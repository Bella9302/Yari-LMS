import "server-only";
import type { AtRiskType } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { computeGrade } from "@/server/assessment/grades";
import { AssessmentError } from "@/server/assessment/errors";
import { dec } from "@/server/pii/fields";
import { sendEmail } from "@/server/email/send";
import { escapeHtml } from "@/server/email/templates";
import type { Actor } from "@/server/pii/users";

const DAY = 24 * 60 * 60 * 1000;
/** A trainer's dismissal stops the same rule re-flagging that learner for this long. */
export const DISMISS_DAYS = 7;

export const RULE_INFO: Record<
  AtRiskType,
  { label: string; unit: string; defaultThreshold: number; help: string }
> = {
  INACTIVE_DAYS: {
    label: "Inactive",
    unit: "days",
    defaultThreshold: 7,
    help: "No activity on the course for this many days (or not started, counted from enrolment).",
  },
  MISSED_DEADLINE: {
    label: "Missed a deadline",
    unit: "days' grace",
    defaultThreshold: 0,
    help: "The course due date, or an assignment's due date, has passed (plus the grace days) without completion or a hand-in.",
  },
  SCORE_BELOW: {
    label: "Low score",
    unit: "%",
    defaultThreshold: 50,
    help: "A marked quiz or assignment is below this percentage (best attempt counts).",
  },
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function saveRule(
  actor: Actor,
  courseId: string,
  type: AtRiskType,
  threshold: number,
  active: boolean,
) {
  await assertCanEditCourse(actor, courseId);
  const max = type === "SCORE_BELOW" ? 100 : 365;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > max) {
    throw new AssessmentError(`Enter a whole number from 0 to ${max}.`);
  }
  if (type === "INACTIVE_DAYS" && threshold < 1)
    throw new AssessmentError("Inactivity needs at least 1 day.");
  await db.atRiskRule.upsert({
    where: { courseId_type: { courseId, type } },
    create: { courseId, type, threshold, active, createdById: actor.id },
    update: { threshold, active },
  });
  // Changing a rule can make existing flags wrong: re-check straight away.
  await evaluateCourse(courseId);
}

export async function deleteRule(actor: Actor, ruleId: string) {
  const rule = await db.atRiskRule.findUnique({ where: { id: ruleId } });
  if (!rule) return;
  await assertCanEditCourse(actor, rule.courseId);
  await db.atRiskRule.delete({ where: { id: ruleId } });
}

export async function dismissFlag(actor: Actor, flagId: string, note: string) {
  const flag = await db.atRiskFlag.findUnique({ where: { id: flagId }, include: { rule: true } });
  if (!flag) throw new NotFoundError("Flag not found");
  await assertCanEditCourse(actor, flag.rule.courseId);
  await db.atRiskFlag.update({
    where: { id: flagId },
    data: {
      resolvedAt: new Date(),
      resolvedManually: true,
      resolvedById: actor.id,
      note: note.trim().slice(0, 500) || null,
    },
  });
  await audit({ actorId: actor.id, action: "atrisk.dismissed", entityType: "AtRiskFlag", entityId: flagId });
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Johannesburg",
});

interface EnrolmentFacts {
  id: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  dueAt: Date | null;
  submittedAssignmentIds: Set<string>;
  scores: { title: string; scorePct: number; passed: boolean | null }[];
}

/** Pure: the reason a learner meets a rule, or null. */
export function ruleReason(
  rule: { type: AtRiskType; threshold: number },
  e: EnrolmentFacts,
  assignments: { id: string; title: string; dueAt: Date | null }[],
  now: Date,
): string | null {
  switch (rule.type) {
    case "INACTIVE_DAYS": {
      const since = e.lastActiveAt ?? e.createdAt;
      const days = Math.floor((now.getTime() - since.getTime()) / DAY);
      if (days < rule.threshold) return null;
      return e.lastActiveAt ? `No activity for ${days} days` : `Hasn't started (enrolled ${days} days ago)`;
    }
    case "MISSED_DEADLINE": {
      const grace = rule.threshold * DAY;
      const reasons: string[] = [];
      if (e.dueAt && e.dueAt.getTime() + grace < now.getTime())
        reasons.push(`Course was due ${dateFmt.format(e.dueAt)}`);
      for (const a of assignments) {
        if (a.dueAt && a.dueAt.getTime() + grace < now.getTime() && !e.submittedAssignmentIds.has(a.id)) {
          reasons.push(`“${a.title}” not handed in (due ${dateFmt.format(a.dueAt)})`);
        }
      }
      return reasons.length ? reasons.join("; ") : null;
    }
    case "SCORE_BELOW": {
      const low = e.scores.filter((s) => s.scorePct < rule.threshold && s.passed !== true);
      return low.length ? low.map((s) => `“${s.title}”: ${Math.round(s.scorePct)}%`).join("; ") : null;
    }
  }
}

/**
 * Re-checks one course: raises new flags, clears flags whose condition no longer holds, and
 * respects recent dismissals. Completed and withdrawn learners are never at risk.
 */
export async function evaluateCourse(
  courseId: string,
  now = new Date(),
): Promise<{ raised: number; cleared: number }> {
  const rules = await db.atRiskRule.findMany({ where: { courseId } });
  const activeRules = rules.filter((r) => r.active);
  // Inactive or deleted rules shouldn't leave flags behind.
  const inactiveIds = rules.filter((r) => !r.active).map((r) => r.id);
  let cleared = 0;
  if (inactiveIds.length) {
    cleared += (
      await db.atRiskFlag.updateMany({
        where: { ruleId: { in: inactiveIds }, resolvedAt: null },
        data: { resolvedAt: now },
      })
    ).count;
  }
  if (activeRules.length === 0) return { raised: 0, cleared };

  const [enrolments, assessed] = await Promise.all([
    db.enrolment.findMany({
      where: { courseId, status: { not: "WITHDRAWN" } },
      select: { id: true, status: true, createdAt: true, lastActiveAt: true, dueAt: true },
    }),
    db.item.findMany({
      where: { module: { courseId }, published: true, type: { in: ["QUIZ", "ASSIGNMENT"] } },
      include: {
        quiz: { include: { attempts: { select: { enrolmentId: true, status: true, scorePct: true } } } },
        assignment: {
          include: {
            submissions: {
              orderBy: { attemptNo: "desc" },
              select: {
                enrolmentId: true,
                status: true,
                isLate: true,
                mark: { select: { status: true, score: true } },
              },
            },
          },
        },
        overrides: { select: { enrolmentId: true, scorePct: true } },
      },
    }),
  ]);
  const assignments = assessed
    .filter((i) => i.assignment && i.required)
    .map((i) => ({ id: i.id, title: i.title, dueAt: i.assignment!.dueAt }));

  const facts = (e: (typeof enrolments)[number]): EnrolmentFacts => ({
    ...e,
    submittedAssignmentIds: new Set(
      assessed.filter((i) => i.assignment?.submissions.some((s) => s.enrolmentId === e.id)).map((i) => i.id),
    ),
    scores: assessed.flatMap((i) => {
      const override = i.overrides.find((o) => o.enrolmentId === e.id) ?? null;
      const g = i.quiz
        ? computeGrade(
            {
              kind: "quiz",
              passPct: i.quiz.passPct,
              attempts: i.quiz.attempts.filter((a) => a.enrolmentId === e.id),
            },
            override,
          )
        : computeGrade(
            {
              kind: "assignment",
              passPct: i.assignment!.passPct,
              maxPoints: i.assignment!.maxPoints,
              submissions: i.assignment!.submissions.filter((s) => s.enrolmentId === e.id),
            },
            override,
          );
      return g.state === "graded" && g.scorePct !== null
        ? [{ title: i.title, scorePct: g.scorePct, passed: g.passed }]
        : [];
    }),
  });

  let raised = 0;
  for (const rule of activeRules) {
    const [open, recentDismissals] = await Promise.all([
      db.atRiskFlag.findMany({ where: { ruleId: rule.id, resolvedAt: null } }),
      db.atRiskFlag.findMany({
        where: {
          ruleId: rule.id,
          resolvedManually: true,
          resolvedAt: { gte: new Date(now.getTime() - DISMISS_DAYS * DAY) },
        },
        select: { enrolmentId: true },
      }),
    ]);
    const openBy = new Map(open.map((f) => [f.enrolmentId, f]));
    const dismissed = new Set(recentDismissals.map((d) => d.enrolmentId));

    for (const e of enrolments) {
      const reason = e.status === "ACTIVE" ? ruleReason(rule, facts(e), assignments, now) : null;
      const flag = openBy.get(e.id);
      if (!reason && flag) {
        await db.atRiskFlag.update({ where: { id: flag.id }, data: { resolvedAt: now } });
        cleared++;
      } else if (reason && flag && flag.reason !== reason) {
        await db.atRiskFlag.update({ where: { id: flag.id }, data: { reason } });
      } else if (reason && !flag && !dismissed.has(e.id)) {
        await db.atRiskFlag.create({ data: { ruleId: rule.id, enrolmentId: e.id, reason, raisedAt: now } });
        raised++;
      }
    }
  }
  return { raised, cleared };
}

export async function evaluateAllCourses(now = new Date()) {
  const courses = await db.course.findMany({
    where: { status: "PUBLISHED", isTemplate: false, atRiskRules: { some: { active: true } } },
    select: { id: true },
  });
  let raised = 0;
  let cleared = 0;
  for (const c of courses) {
    const r = await evaluateCourse(c.id, now);
    raised += r.raised;
    cleared += r.cleared;
  }
  return { courses: courses.length, raised, cleared };
}

/**
 * Emails each course's trainers how many learners were newly flagged. Only counts and a link:
 * names stay inside the platform.
 */
export async function sendNewFlagDigests(now = new Date()) {
  const flags = await db.atRiskFlag.findMany({
    where: { resolvedAt: null, notifiedAt: null },
    select: {
      id: true,
      enrolmentId: true,
      rule: { select: { courseId: true, course: { select: { title: true } } } },
    },
  });
  const byCourse = new Map<string, { title: string; ids: string[]; learners: Set<string> }>();
  for (const f of flags) {
    const entry = byCourse.get(f.rule.courseId) ?? {
      title: f.rule.course.title,
      ids: [],
      learners: new Set<string>(),
    };
    entry.ids.push(f.id);
    entry.learners.add(f.enrolmentId);
    byCourse.set(f.rule.courseId, entry);
  }
  let emails = 0;
  for (const [courseId, { title, ids, learners }] of byCourse) {
    const staff = await db.courseStaff.findMany({
      where: { courseId, user: { status: "ACTIVE" } },
      select: { user: { select: { id: true, emailEnc: true } } },
    });
    const url = `${env().APP_URL}/teach/courses/${courseId}/progress`;
    const n = learners.size;
    for (const s of staff) {
      await sendEmail({
        to: dec.email(s.user.id, s.user.emailEnc),
        subject: `${n} learner${n === 1 ? "" : "s"} may need help on ${title}`,
        text: `${n} learner${n === 1 ? " was" : "s were"} newly flagged as at risk on "${title}".\nSee who and why: ${url}`,
        html: `<p>${n} learner${n === 1 ? " was" : "s were"} newly flagged as at risk on <strong>${escapeHtml(title)}</strong>.</p><p><a href="${url}">See who and why</a></p>`,
      });
      emails++;
    }
    await db.atRiskFlag.updateMany({ where: { id: { in: ids } }, data: { notifiedAt: now } });
  }
  return { emails };
}
