import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { canAccessOrg } from "@/server/rbac";
import { dec } from "@/server/pii/fields";
import { PermissionError, type Actor } from "@/server/pii/users";
import { computeGrade } from "@/server/assessment/grades";
import { csvCell } from "@/server/assessment/gradebook";

const DAY = 24 * 60 * 60 * 1000;
/** Shown to companies as "inactive" (separate from trainers' own at-risk rules). */
export const COMPANY_INACTIVE_DAYS = 14;

export type TrainingState = "completed" | "overdue" | "inactive" | "in_progress" | "not_started";

export function trainingState(
  e: { status: string; progressPct: number; dueAt: Date | null; lastActiveAt: Date | null; createdAt: Date },
  now = new Date(),
): TrainingState {
  if (e.status === "COMPLETED") return "completed";
  if (e.dueAt && e.dueAt < now) return "overdue";
  const since = e.lastActiveAt ?? e.createdAt;
  if (now.getTime() - since.getTime() > COMPANY_INACTIVE_DAYS * DAY) return "inactive";
  return e.progressPct > 0 || e.lastActiveAt ? "in_progress" : "not_started";
}

function assertOrg(actor: Actor, orgId: string) {
  if (!canAccessOrg(actor.roles, orgId)) throw new PermissionError();
}

/**
 * Everything a company sees is limited to enrolments made for that company: their own staff's
 * training, never another company's, and never trainers' private notes.
 */
async function companyEnrolments(orgId: string) {
  return db.enrolment.findMany({
    where: { organizationId: orgId, status: { not: "WITHDRAWN" } },
    include: {
      course: { select: { id: true, title: true, category: true } },
      user: { select: { id: true, status: true, profile: { select: { fullNameEnc: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCompanyOverview(actor: Actor, orgId: string, now = new Date()) {
  assertOrg(actor, orgId);
  const [org, staffCount, enrolments] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true } }),
    db.orgMembership.count({ where: { organizationId: orgId, user: { status: { not: "DELETED" } } } }),
    companyEnrolments(orgId),
  ]);

  const rows = enrolments.map((e) => ({
    enrolmentId: e.id,
    userId: e.user.id,
    name: e.user.profile ? dec.fullName(e.user.id, e.user.profile.fullNameEnc) : "",
    course: e.course,
    progressPct: e.progressPct,
    dueAt: e.dueAt,
    completedAt: e.completedAt,
    lastActiveAt: e.lastActiveAt,
    state: trainingState(e, now),
  }));

  const count = (s: TrainingState) => rows.filter((r) => r.state === s).length;
  const courses = [...new Map(rows.map((r) => [r.course.id, r.course])).values()].map((c) => {
    const cr = rows.filter((r) => r.course.id === c.id);
    return {
      ...c,
      enrolled: cr.length,
      completed: cr.filter((r) => r.state === "completed").length,
      overdue: cr.filter((r) => r.state === "overdue").length,
      avgProgress: Math.round(cr.reduce((s, r) => s + r.progressPct, 0) / cr.length),
    };
  });

  if (rows.length) {
    await audit({
      actorId: actor.id,
      action: "pii.viewed",
      entityType: "CompanyOverview",
      entityId: orgId,
      orgId,
      fields: ["fullName"],
      meta: { count: rows.length },
    });
  }
  return {
    org,
    stats: {
      staff: staffCount,
      enrolments: rows.length,
      completed: count("completed"),
      overdue: count("overdue"),
      inactive: count("inactive"),
      inProgress: count("in_progress"),
      notStarted: count("not_started"),
      completionRate: rows.length ? Math.round((count("completed") / rows.length) * 100) : 0,
    },
    courses,
    attention: rows
      .filter((r) => r.state === "overdue" || r.state === "inactive")
      .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0)),
    rows,
  };
}

/** One staff member's company-enrolled training: progress, results (pass/fail and scores) and attendance. */
export async function getStaffTraining(actor: Actor, orgId: string, userId: string, now = new Date()) {
  assertOrg(actor, orgId);
  const member = await db.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    include: { user: { select: { id: true, status: true, profile: { select: { fullNameEnc: true } } } } },
  });
  if (!member) throw new PermissionError();

  const enrolments = await db.enrolment.findMany({
    where: { organizationId: orgId, userId, status: { not: "WITHDRAWN" } },
    orderBy: { createdAt: "desc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          category: true,
          sessions: { where: { cancelledAt: null, startsAt: { lte: now } }, select: { id: true } },
          modules: {
            orderBy: { position: "asc" },
            select: {
              items: {
                where: { published: true, type: { in: ["QUIZ", "ASSIGNMENT"] } },
                orderBy: { position: "asc" },
                include: {
                  quiz: {
                    include: {
                      attempts: {
                        where: { enrolment: { userId } },
                        select: { status: true, scorePct: true },
                      },
                    },
                  },
                  assignment: {
                    include: {
                      submissions: {
                        where: { enrolment: { userId } },
                        orderBy: { attemptNo: "desc" },
                        select: {
                          status: true,
                          isLate: true,
                          mark: { select: { status: true, score: true } },
                        },
                      },
                    },
                  },
                  overrides: { where: { enrolment: { userId } }, select: { scorePct: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const attendance = await db.attendance.findMany({
    where: { userId, status: "PRESENT" },
    select: { sessionId: true },
  });
  const attended = new Set(attendance.map((a) => a.sessionId));

  await audit({
    actorId: actor.id,
    action: "pii.viewed",
    entityType: "StaffTraining",
    entityId: userId,
    orgId,
    fields: ["fullName"],
  });
  return {
    name: member.user.profile ? dec.fullName(member.user.id, member.user.profile.fullNameEnc) : "",
    department: member.department,
    courses: enrolments.map((e) => ({
      enrolmentId: e.id,
      course: { id: e.course.id, title: e.course.title, category: e.course.category },
      state: trainingState(e, now),
      progressPct: e.progressPct,
      dueAt: e.dueAt,
      completedAt: e.completedAt,
      lastActiveAt: e.lastActiveAt,
      sessions: {
        held: e.course.sessions.length,
        attended: e.course.sessions.filter((s) => attended.has(s.id)).length,
      },
      results: e.course.modules.flatMap((m) =>
        m.items.map((i) => {
          const override = i.overrides[0] ?? null;
          const g = i.quiz
            ? computeGrade({ kind: "quiz", passPct: i.quiz.passPct, attempts: i.quiz.attempts }, override)
            : computeGrade(
                {
                  kind: "assignment",
                  passPct: i.assignment!.passPct,
                  maxPoints: i.assignment!.maxPoints,
                  submissions: i.assignment!.submissions,
                },
                override,
              );
          return { title: i.title, type: i.type, scorePct: g.scorePct, passed: g.passed, state: g.state };
        }),
      ),
    })),
  };
}

export const STATE_LABELS: Record<TrainingState, string> = {
  completed: "Completed",
  overdue: "Overdue",
  inactive: "Inactive",
  in_progress: "In progress",
  not_started: "Not started",
};

/** Compliance report: one row per staff member per course. */
export async function getComplianceRows(actor: Actor, orgId: string, now = new Date()) {
  assertOrg(actor, orgId);
  const [org, enrolments, members] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } }),
    companyEnrolments(orgId),
    db.orgMembership.findMany({
      where: { organizationId: orgId },
      select: { userId: true, department: true },
    }),
  ]);
  const dept = new Map(members.map((m) => [m.userId, m.department]));
  const rows = enrolments
    .map((e) => ({
      name: e.user.profile ? dec.fullName(e.user.id, e.user.profile.fullNameEnc) : "",
      department: dept.get(e.user.id) ?? null,
      course: e.course.title,
      state: trainingState(e, now),
      progressPct: e.progressPct,
      enrolledAt: e.createdAt,
      dueAt: e.dueAt,
      completedAt: e.completedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.course.localeCompare(b.course));
  return { orgName: org.name, rows };
}

export function complianceCsv(rows: Awaited<ReturnType<typeof getComplianceRows>>["rows"]) {
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  const header = [
    "Name",
    "Department / site",
    "Course",
    "Status",
    "Progress %",
    "Enrolled",
    "Due",
    "Completed",
  ];
  const lines = rows.map((r) => [
    r.name,
    r.department ?? "",
    r.course,
    STATE_LABELS[r.state],
    r.progressPct,
    d(r.enrolledAt),
    d(r.dueAt),
    d(r.completedAt),
  ]);
  return "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
