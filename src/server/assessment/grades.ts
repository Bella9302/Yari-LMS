import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { recomputeEnrolment } from "@/server/courses/learner";
import type { Actor } from "@/server/pii/users";
import { AssessmentError, assertNotOwnWork } from "@/server/assessment/errors";

export type GradeState =
  /** Nothing attempted or handed in. */
  | "none"
  /** Quiz attempt in progress. */
  | "in_progress"
  /** Waiting for a trainer (submitted work, or short answers to check). */
  | "pending"
  | "graded";

export interface Grade {
  state: GradeState;
  scorePct: number | null;
  passed: boolean | null;
  passPct: number;
  late: boolean;
  overridden: boolean;
  attempts: number;
}

interface QuizFacts {
  kind: "quiz";
  passPct: number;
  attempts: { status: string; scorePct: number | null }[];
}

interface AssignmentFacts {
  kind: "assignment";
  passPct: number;
  maxPoints: number;
  // Newest first.
  submissions: { status: string; isLate: boolean; mark: { status: string; score: number } | null }[];
}

/**
 * The grade rules, in one pure function:
 * - Quiz: the best fully marked attempt counts.
 * - Assignment: the newest released mark counts; newer unmarked work shows as pending.
 * - A trainer's override replaces either.
 */
export function computeGrade(
  facts: QuizFacts | AssignmentFacts,
  override: { scorePct: number } | null,
): Grade {
  const base = { passPct: facts.passPct, late: false, overridden: false };
  let grade: Grade;

  if (facts.kind === "quiz") {
    const marked = facts.attempts.filter((a) => a.status === "MARKED" && a.scorePct !== null);
    const best = marked.length ? Math.max(...marked.map((a) => a.scorePct!)) : null;
    const pending = facts.attempts.some((a) => a.status === "NEEDS_MARKING");
    const inProgress = facts.attempts.some((a) => a.status === "IN_PROGRESS");
    const passed = best !== null ? best >= facts.passPct : null;
    grade = {
      ...base,
      attempts: facts.attempts.filter((a) => a.status !== "IN_PROGRESS").length,
      scorePct: best,
      passed,
      state: passed
        ? "graded"
        : pending
          ? "pending"
          : best !== null
            ? "graded"
            : inProgress
              ? "in_progress"
              : "none",
    };
  } else {
    const released = facts.submissions.find((s) => s.mark?.status === "RELEASED");
    const latest = facts.submissions[0];
    const scorePct = released?.mark
      ? Math.round((released.mark.score / facts.maxPoints) * 10000) / 100
      : null;
    const awaiting = latest && latest.status === "SUBMITTED" && latest !== released;
    grade = {
      ...base,
      attempts: facts.submissions.length,
      late: Boolean(latest?.isLate),
      scorePct,
      passed: scorePct !== null ? scorePct >= facts.passPct : null,
      state: awaiting ? "pending" : scorePct !== null ? "graded" : latest ? "pending" : "none",
    };
  }

  if (override) {
    return {
      ...grade,
      scorePct: override.scorePct,
      passed: override.scorePct >= facts.passPct,
      state: "graded",
      overridden: true,
    };
  }
  return grade;
}

/** Loads the facts and computes one learner's grade for one quiz or assignment item. */
export async function gradeFor(enrolmentId: string, itemId: string): Promise<Grade | null> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: {
      quiz: { include: { attempts: { where: { enrolmentId }, select: { status: true, scorePct: true } } } },
      assignment: {
        include: {
          submissions: {
            where: { enrolmentId },
            orderBy: { attemptNo: "desc" },
            select: { status: true, isLate: true, mark: { select: { status: true, score: true } } },
          },
        },
      },
      overrides: { where: { enrolmentId }, select: { scorePct: true } },
    },
  });
  if (!item) return null;
  const override = item.overrides[0] ?? null;
  if (item.quiz)
    return computeGrade({ kind: "quiz", passPct: item.quiz.passPct, attempts: item.quiz.attempts }, override);
  if (item.assignment) {
    return computeGrade(
      {
        kind: "assignment",
        passPct: item.assignment.passPct,
        maxPoints: item.assignment.maxPoints,
        submissions: item.assignment.submissions,
      },
      override,
    );
  }
  return null;
}

/**
 * Writes an item's grade into the learner's progress (status + best score for MIN_SCORE
 * release rules) and recalculates course completion. Call after anything that changes a grade.
 */
export async function syncItemProgress(enrolmentId: string, itemId: string) {
  const grade = await gradeFor(enrolmentId, itemId);
  if (!grade) return;
  const now = new Date();
  const status = grade.passed ? "COMPLETED" : grade.state === "none" ? "NOT_STARTED" : "IN_PROGRESS";
  await db.itemProgress.upsert({
    where: { enrolmentId_itemId: { enrolmentId, itemId } },
    create: {
      enrolmentId,
      itemId,
      status,
      scorePct: grade.scorePct,
      firstViewedAt: now,
      lastViewedAt: now,
      completedAt: grade.passed ? now : null,
    },
    update: {
      status,
      scorePct: grade.scorePct,
      ...(grade.passed ? { completedAt: now } : { completedAt: null }),
    },
  });
  await recomputeEnrolment(enrolmentId);
}

export async function setGradeOverride(
  actor: Actor,
  enrolmentId: string,
  itemId: string,
  value: { scorePct: number; reason: string } | null,
) {
  const enrolment = await db.enrolment.findUnique({ where: { id: enrolmentId } });
  if (!enrolment) throw new NotFoundError("Enrolment not found");
  await assertCanEditCourse(actor, enrolment.courseId);
  assertNotOwnWork(actor, enrolment.userId);
  const item = await db.item.findFirst({
    where: { id: itemId, module: { courseId: enrolment.courseId }, type: { in: ["QUIZ", "ASSIGNMENT"] } },
  });
  if (!item) throw new NotFoundError("Item not found");

  if (value) {
    if (!(value.scorePct >= 0 && value.scorePct <= 100))
      throw new AssessmentError("Enter a score from 0 to 100%.");
    if (value.reason.trim().length < 3) throw new AssessmentError("Give a reason for the override.");
    await db.gradeOverride.upsert({
      where: { enrolmentId_itemId: { enrolmentId, itemId } },
      create: {
        enrolmentId,
        itemId,
        scorePct: value.scorePct,
        reason: value.reason.trim(),
        graderId: actor.id,
      },
      update: { scorePct: value.scorePct, reason: value.reason.trim(), graderId: actor.id },
    });
  } else {
    await db.gradeOverride.deleteMany({ where: { enrolmentId, itemId } });
  }
  await audit({
    actorId: actor.id,
    action: "grade.overridden",
    entityType: "Enrolment",
    entityId: enrolmentId,
    meta: { itemId, scorePct: value?.scorePct ?? null, reason: value?.reason ?? "removed" },
  });
  await syncItemProgress(enrolmentId, itemId);
}
