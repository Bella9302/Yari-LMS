import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { getLearnerItem } from "@/server/courses/learner";
import { dec } from "@/server/pii/fields";
import type { Actor } from "@/server/pii/users";
import { AssessmentError, assertNotOwnWork } from "@/server/assessment/errors";
import { computeGrade, syncItemProgress, type Grade } from "@/server/assessment/grades";
import { rubricScore } from "@/server/assessment/scoring";
import { getRubric } from "@/server/assessment/authoring";
import { notifyMarked } from "@/server/engagement/notifications";

const fileSelect = { asset: { select: { id: true, filename: true, bytes: true, mime: true } } } as const;

async function learnerAssignmentContext(actor: Actor, itemId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: { assignment: true, module: { select: { course: { select: { slug: true } } } } },
  });
  if (!item?.assignment) throw new NotFoundError("Assignment not found");
  const view = await getLearnerItem(actor, item.module.course.slug, itemId);
  if (!view || view.course.preview || !view.course.enrolment) throw new NotFoundError("Assignment not found");
  return {
    assignment: item.assignment,
    enrolmentId: view.course.enrolment.id,
    unlocked: view.item.lock.unlocked,
    archived: view.course.course.archived,
  };
}

export interface LearnerSubmission {
  id: string;
  attemptNo: number;
  text: string | null;
  status: string;
  isLate: boolean;
  submittedAt: Date;
  files: { id: string; filename: string; bytes: number; mime: string }[];
  /** Only once released. */
  feedback: {
    score: number;
    maxPoints: number;
    text: string | null;
    file: { id: string; filename: string } | null;
    audioId: string | null;
    rubric: { criterion: string; level: string; points: number; max: number }[];
    releasedAt: Date | null;
  } | null;
}

export interface AssignmentOverview {
  dueAt: Date | null;
  allowText: boolean;
  allowFiles: boolean;
  maxFiles: number;
  maxPoints: number;
  passPct: number;
  allowLate: boolean;
  rubric: Awaited<ReturnType<typeof getRubric>>;
  submissions: LearnerSubmission[];
  grade: Grade;
  canSubmit: boolean;
  /** Why the learner can't submit (shown in place of the form). */
  blockedReason: string | null;
}

/** Whether a new submission is allowed now, and if not, why. */
export function submissionGate(opts: {
  unlocked: boolean;
  archived: boolean;
  dueAt: Date | null;
  allowLate: boolean;
  latestStatus: string | null;
  passed: boolean;
  now?: Date;
}): string | null {
  const now = opts.now ?? new Date();
  if (!opts.unlocked) return "This assignment isn't open yet.";
  if (opts.archived) return "This course is archived.";
  // A trainer returning work reopens it, even after a pass.
  if (opts.passed && opts.latestStatus !== "RETURNED") return "You've passed this assignment.";
  if (opts.latestStatus === "SUBMITTED") return "Handed in — your trainer will mark it.";
  if (opts.dueAt && now > opts.dueAt && !opts.allowLate)
    return "The due date has passed and late work isn't accepted.";
  return null;
}

export async function getAssignmentOverview(actor: Actor, itemId: string): Promise<AssignmentOverview> {
  const { assignment, enrolmentId, unlocked, archived } = await learnerAssignmentContext(actor, itemId);
  const [submissions, rubric, override] = await Promise.all([
    db.submission.findMany({
      where: { assignmentId: itemId, enrolmentId },
      orderBy: { attemptNo: "desc" },
      include: {
        files: { orderBy: { position: "asc" }, include: fileSelect },
        mark: { include: { feedbackAsset: { select: { id: true, filename: true } } } },
      },
    }),
    assignment.rubricId ? getRubric(assignment.rubricId) : Promise.resolve(null),
    db.gradeOverride.findUnique({ where: { enrolmentId_itemId: { enrolmentId, itemId } } }),
  ]);
  const grade = computeGrade(
    { kind: "assignment", passPct: assignment.passPct, maxPoints: assignment.maxPoints, submissions },
    override,
  );
  const blockedReason = submissionGate({
    unlocked,
    archived,
    dueAt: assignment.dueAt,
    allowLate: assignment.allowLate,
    latestStatus: submissions[0]?.status ?? null,
    passed: Boolean(grade.passed),
  });

  return {
    ...assignment,
    rubric,
    grade,
    canSubmit: blockedReason === null,
    blockedReason,
    submissions: submissions.map((s) => {
      const released = s.mark?.status === "RELEASED" ? s.mark : null;
      const selections = (released?.rubricSelections ?? {}) as Record<string, string>;
      return {
        id: s.id,
        attemptNo: s.attemptNo,
        text: s.text,
        status: s.status,
        isLate: s.isLate,
        submittedAt: s.submittedAt,
        files: s.files.map((f) => f.asset),
        feedback: released
          ? {
              score: released.score,
              maxPoints: assignment.maxPoints,
              text: released.feedbackText,
              file: released.feedbackAsset,
              audioId: released.audioAssetId,
              releasedAt: released.releasedAt,
              rubric: (rubric?.criteria ?? []).map((c) => {
                const level = c.levels.find((l) => l.id === selections[c.id]);
                return {
                  criterion: c.title,
                  level: level?.label ?? "—",
                  points: level?.points ?? 0,
                  max: Math.max(...c.levels.map((l) => l.points)),
                };
              }),
            }
          : null,
      };
    }),
  };
}

export async function submitAssignment(
  actor: Actor,
  itemId: string,
  input: { text: string; assetIds: string[] },
) {
  const { assignment, enrolmentId } = await learnerAssignmentContext(actor, itemId);
  const overview = await getAssignmentOverview(actor, itemId);
  if (!overview.canSubmit)
    throw new AssessmentError(overview.blockedReason ?? "You can't hand in work right now.");

  const text = assignment.allowText ? input.text.trim().slice(0, 50_000) : "";
  const assetIds = assignment.allowFiles ? [...new Set(input.assetIds)] : [];
  if (!text && assetIds.length === 0) throw new AssessmentError("Add your answer or attach a file.");
  if (assetIds.length > assignment.maxFiles)
    throw new AssessmentError(`Attach at most ${assignment.maxFiles} files.`);
  if (assetIds.length) {
    const ok = await db.asset.count({
      where: { id: { in: assetIds }, uploadedById: actor.id, scanStatus: { in: ["CLEAN", "SKIPPED"] } },
    });
    if (ok !== assetIds.length) throw new AssessmentError("One of the files isn't ready. Upload it again.");
  }

  const now = new Date();
  const submission = await db.submission.create({
    data: {
      assignmentId: itemId,
      enrolmentId,
      attemptNo: overview.submissions.length + 1,
      text: text || null,
      isLate: Boolean(assignment.dueAt && now > assignment.dueAt),
      files: { create: assetIds.map((assetId, position) => ({ assetId, position })) },
    },
  });
  await audit({
    actorId: actor.id,
    action: "assignment.submitted",
    entityType: "Submission",
    entityId: submission.id,
    meta: { late: submission.isLate, files: assetIds.length },
  });
  await syncItemProgress(enrolmentId, itemId);
  return submission;
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

export interface MarkingQueueRow {
  submissionId: string;
  learnerName: string;
  attemptNo: number;
  submittedAt: Date;
  isLate: boolean;
  status: string;
  markStatus: string | null;
  score: number | null;
}

/** Each learner's newest submission for an assignment, oldest unmarked first. */
export async function getMarkingQueue(actor: Actor, itemId: string): Promise<MarkingQueueRow[]> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { module: { select: { courseId: true } }, assignment: true },
  });
  if (!item?.assignment) throw new NotFoundError("Assignment not found");
  await assertCanEditCourse(actor, item.module.courseId);
  const all = await db.submission.findMany({
    where: { assignmentId: itemId, enrolment: { status: { not: "WITHDRAWN" } } },
    orderBy: [{ attemptNo: "desc" }],
    include: {
      mark: { select: { status: true, score: true } },
      enrolment: { select: { user: { select: { id: true, profile: { select: { fullNameEnc: true } } } } } },
    },
  });
  const latest = new Map<string, (typeof all)[number]>();
  for (const s of all) if (!latest.has(s.enrolmentId)) latest.set(s.enrolmentId, s);
  const rows = [...latest.values()].map((s) => ({
    submissionId: s.id,
    learnerName: s.enrolment.user.profile
      ? dec.fullName(s.enrolment.user.id, s.enrolment.user.profile.fullNameEnc)
      : "",
    attemptNo: s.attemptNo,
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    status: s.status,
    markStatus: s.mark?.status ?? null,
    score: s.mark?.score ?? null,
  }));
  const rank = (r: MarkingQueueRow) => (r.status === "SUBMITTED" && r.markStatus !== "RELEASED" ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || a.submittedAt.getTime() - b.submittedAt.getTime());
}

/** One submission in the inline grader, with previous/next learner in the queue. */
export async function getSubmissionForMarking(actor: Actor, submissionId: string) {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      files: { orderBy: { position: "asc" }, include: fileSelect },
      mark: { include: { feedbackAsset: { select: { id: true, filename: true } } } },
      assignment: {
        include: {
          item: { select: { id: true, title: true, body: true, module: { select: { courseId: true } } } },
        },
      },
      enrolment: {
        select: {
          user: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
          organization: { select: { name: true } },
        },
      },
    },
  });
  if (!submission) throw new NotFoundError("Submission not found");
  const courseId = submission.assignment.item.module.courseId;
  await assertCanEditCourse(actor, courseId);

  const [queue, history, rubric] = await Promise.all([
    getMarkingQueue(actor, submission.assignmentId),
    db.submission.findMany({
      where: { assignmentId: submission.assignmentId, enrolmentId: submission.enrolmentId },
      orderBy: { attemptNo: "asc" },
      select: { id: true, attemptNo: true, submittedAt: true, status: true },
    }),
    submission.assignment.rubricId ? getRubric(submission.assignment.rubricId) : Promise.resolve(null),
  ]);
  const index = queue.findIndex((q) => q.submissionId === submissionId);
  const user = submission.enrolment.user;
  await audit({
    actorId: actor.id,
    action: "pii.viewed",
    entityType: "Submission",
    entityId: submissionId,
    fields: ["fullName"],
  });

  return {
    courseId,
    submission,
    learnerName: user.profile ? dec.fullName(user.id, user.profile.fullNameEnc) : "",
    organization: submission.enrolment.organization?.name ?? null,
    rubric,
    history,
    prevId: index > 0 ? queue[index - 1]!.submissionId : null,
    nextId: index >= 0 && index < queue.length - 1 ? queue[index + 1]!.submissionId : null,
    position: index + 1,
    queueLength: queue.length,
  };
}

export interface MarkInput {
  score: number | null;
  rubricSelections: Record<string, string>;
  feedbackText: string;
  feedbackAssetId: string | null;
  audioAssetId: string | null;
  /** "draft" saves privately; "release" shows the learner; "return" releases and asks for a resubmission. */
  action: "draft" | "release" | "return";
}

export async function saveMark(actor: Actor, submissionId: string, input: MarkInput) {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: { include: { item: { select: { module: { select: { courseId: true } } } } } },
      mark: true,
      enrolment: { select: { userId: true } },
    },
  });
  if (!submission) throw new NotFoundError("Submission not found");
  await assertCanEditCourse(actor, submission.assignment.item.module.courseId);
  assertNotOwnWork(actor, submission.enrolment.userId);
  // Released marks are visible to the learner at once, so a "draft" can't silently overwrite one.
  if (input.action === "draft" && submission.mark?.status === "RELEASED") {
    throw new AssessmentError("This mark is already released. Use “Release & next” to change it.");
  }

  let score = input.score;
  const selections: Record<string, string> = {};
  if (submission.assignment.rubricId) {
    const rubric = await getRubric(submission.assignment.rubricId);
    for (const c of rubric?.criteria ?? []) {
      const levelId = input.rubricSelections[c.id];
      if (levelId && c.levels.some((l) => l.id === levelId)) selections[c.id] = levelId;
    }
    score = rubric ? rubricScore(rubric, selections) : null;
    if (score === null && input.action !== "draft")
      throw new AssessmentError("Choose a level for every rubric criterion.");
  }
  if (score === null || !(score >= 0 && score <= submission.assignment.maxPoints)) {
    if (input.action !== "draft")
      throw new AssessmentError(`Enter a mark from 0 to ${submission.assignment.maxPoints}.`);
    score = score ?? 0;
  }

  for (const assetId of [input.feedbackAssetId, input.audioAssetId]) {
    if (
      assetId &&
      !(await db.asset.findFirst({
        where: { id: assetId, uploadedById: actor.id, scanStatus: { in: ["CLEAN", "SKIPPED"] } },
      }))
    ) {
      throw new AssessmentError("Upload the feedback file again.");
    }
  }

  const releasing = input.action !== "draft";
  const data = {
    graderId: actor.id,
    score,
    rubricSelections: selections as Prisma.InputJsonValue,
    feedbackText: input.feedbackText.trim().slice(0, 20_000) || null,
    feedbackAssetId: input.feedbackAssetId,
    audioAssetId: input.audioAssetId,
    status: releasing ? ("RELEASED" as const) : (submission.mark?.status ?? ("DRAFT" as const)),
    releasedAt: releasing ? new Date() : (submission.mark?.releasedAt ?? null),
  };
  await db.$transaction([
    db.mark.upsert({ where: { submissionId }, create: { submissionId, ...data }, update: data }),
    db.submission.update({
      where: { id: submissionId },
      data: { status: input.action === "return" ? "RETURNED" : releasing ? "MARKED" : submission.status },
    }),
  ]);
  if (releasing) {
    await audit({
      actorId: actor.id,
      action: input.action === "return" ? "assignment.returned" : "assignment.marked",
      entityType: "Submission",
      entityId: submissionId,
      meta: { score },
    });
    await syncItemProgress(submission.enrolmentId, submission.assignmentId);
    await notifyMarked(submission.enrolmentId, submission.assignmentId);
  }
}
