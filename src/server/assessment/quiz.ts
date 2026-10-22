import "server-only";
import type { Prisma, QuizAttempt } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { getLearnerItem } from "@/server/courses/learner";
import type { Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { drawQuestions, rescore, scoreAttempt, scoreQuestion } from "@/server/assessment/scoring";
import { computeGrade, syncItemProgress } from "@/server/assessment/grades";
import { toLearnerQuestion, type Answer, type LearnerQuestion, type SnapshotQuestion } from "@/lib/questions";

// Network lag allowance after the deadline before late answers are ignored.
const GRACE_MS = 30_000;

/** The learner's enrolment for a quiz item, if the item is open to them. */
async function learnerQuizContext(actor: Actor, itemId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: { quiz: true, module: { select: { course: { select: { slug: true } } } } },
  });
  if (!item?.quiz) throw new NotFoundError("Quiz not found");
  const view = await getLearnerItem(actor, item.module.course.slug, itemId);
  if (!view || view.course.preview || !view.course.enrolment) throw new NotFoundError("Quiz not found");
  return {
    item,
    quiz: item.quiz,
    enrolmentId: view.course.enrolment.id,
    unlocked: view.item.lock.unlocked,
    archived: view.course.course.archived,
  };
}

export interface QuizOverview {
  instructions: string;
  passPct: number;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  questionCount: number;
  attempts: {
    id: string;
    attemptNo: number;
    status: string;
    scorePct: number | null;
    passed: boolean | null;
    submittedAt: Date | null;
  }[];
  inProgressId: string | null;
  canStart: boolean;
  bestPct: number | null;
  passed: boolean;
  pending: boolean;
}

export async function getQuizOverview(actor: Actor, itemId: string): Promise<QuizOverview> {
  const { quiz, enrolmentId, unlocked, archived } = await learnerQuizContext(actor, itemId);
  const [attempts, sections] = await Promise.all([
    db.quizAttempt.findMany({ where: { quizId: itemId, enrolmentId }, orderBy: { attemptNo: "asc" } }),
    db.quizSection.findMany({
      where: { quizId: itemId },
      include: { bank: { select: { _count: { select: { questions: { where: { archived: false } } } } } } },
    }),
  ]);
  for (const a of attempts)
    if (a.status === "IN_PROGRESS" && isExpired(a)) await finalize(a, { timedOut: true });
  const fresh = await db.quizAttempt.findMany({
    where: { quizId: itemId, enrolmentId },
    orderBy: { attemptNo: "asc" },
  });
  const override = await db.gradeOverride.findUnique({
    where: { enrolmentId_itemId: { enrolmentId, itemId } },
  });
  const grade = computeGrade({ kind: "quiz", passPct: quiz.passPct, attempts: fresh }, override);
  const finished = fresh.filter((a) => a.status !== "IN_PROGRESS").length;
  const inProgress = fresh.find((a) => a.status === "IN_PROGRESS");

  return {
    instructions: quiz.instructions,
    passPct: quiz.passPct,
    timeLimitMin: quiz.timeLimitMin,
    maxAttempts: quiz.maxAttempts,
    questionCount: sections.reduce(
      (n, s) => n + Math.min(s.drawCount ?? Infinity, s.bank._count.questions),
      0,
    ),
    attempts: fresh
      .filter((a) => a.status !== "IN_PROGRESS")
      .map((a) => ({
        id: a.id,
        attemptNo: a.attemptNo,
        status: a.status,
        scorePct: a.scorePct,
        passed: a.passed,
        submittedAt: a.submittedAt,
      })),
    inProgressId: inProgress?.id ?? null,
    canStart:
      unlocked &&
      !archived &&
      !inProgress &&
      (quiz.maxAttempts === null || finished < quiz.maxAttempts) &&
      !grade.passed,
    bestPct: grade.scorePct,
    passed: Boolean(grade.passed),
    pending: grade.state === "pending",
  };
}

function isExpired(a: Pick<QuizAttempt, "deadline">, now = Date.now()) {
  return a.deadline !== null && now > a.deadline.getTime() + GRACE_MS;
}

export async function startAttempt(actor: Actor, itemId: string): Promise<string> {
  const { quiz, enrolmentId, unlocked, archived } = await learnerQuizContext(actor, itemId);
  if (!unlocked || archived) throw new AssessmentError("This quiz isn't open.");
  const overview = await getQuizOverview(actor, itemId);
  if (overview.inProgressId) return overview.inProgressId;
  if (!overview.canStart)
    throw new AssessmentError(
      overview.passed ? "You've already passed this quiz." : "You've used all your attempts.",
    );

  const sections = await db.quizSection.findMany({
    where: { quizId: itemId },
    orderBy: { position: "asc" },
    include: {
      bank: { include: { questions: { where: { archived: false }, orderBy: { position: "asc" } } } },
    },
  });
  const questions = drawQuestions(
    sections.map((s) => ({
      drawCount: s.drawCount,
      questions: s.bank.questions.map((q): SnapshotQuestion => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        options: q.options as SnapshotQuestion["options"],
        key: q.answerKey,
        explanation: q.explanation,
      })),
    })),
    { shuffle: quiz.shuffle },
  );
  if (questions.length === 0) throw new AssessmentError("This quiz has no questions yet.");

  const now = new Date();
  const attempt = await db.quizAttempt.create({
    data: {
      quizId: itemId,
      enrolmentId,
      attemptNo: overview.attempts.length + 1,
      questions: questions as unknown as Prisma.InputJsonValue,
      deadline: quiz.timeLimitMin ? new Date(now.getTime() + quiz.timeLimitMin * 60_000) : null,
    },
  });
  await db.enrolment.update({ where: { id: enrolmentId }, data: { lastActiveAt: now } });
  return attempt.id;
}

async function ownAttempt(actor: Actor, attemptId: string) {
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { enrolment: { select: { userId: true } }, quiz: true },
  });
  if (!attempt || attempt.enrolment.userId !== actor.id) throw new NotFoundError("Attempt not found");
  return attempt;
}

export interface LearnerAttempt {
  id: string;
  itemId: string;
  attemptNo: number;
  questions: LearnerQuestion[];
  answers: Record<string, Answer>;
  deadline: Date | null;
  status: string;
}

/** The attempt as the learner sees it while answering. Expired attempts are submitted automatically. */
export async function getAttemptForLearner(actor: Actor, attemptId: string): Promise<LearnerAttempt> {
  let attempt = await ownAttempt(actor, attemptId);
  if (attempt.status === "IN_PROGRESS" && isExpired(attempt)) {
    await finalize(attempt, { timedOut: true });
    attempt = await ownAttempt(actor, attemptId);
  }
  return {
    id: attempt.id,
    itemId: attempt.quizId,
    attemptNo: attempt.attemptNo,
    questions: (attempt.questions as unknown as SnapshotQuestion[]).map(toLearnerQuestion),
    answers: attempt.answers as Record<string, Answer>,
    deadline: attempt.deadline,
    status: attempt.status,
  };
}

/** Keeps only well-formed answers to questions in this attempt. */
export function cleanAnswers(questions: SnapshotQuestion[], raw: unknown): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  if (!raw || typeof raw !== "object") return out;
  const input = raw as Record<string, unknown>;
  for (const q of questions) {
    const a = input[q.id];
    if (a === undefined || a === null) continue;
    const ids = new Set([...(q.options.choices ?? []), ...(q.options.right ?? [])].map((c) => c.id));
    switch (q.type) {
      case "MCQ":
        if (typeof a === "string" && ids.has(a)) out[q.id] = a;
        break;
      case "MULTI_SELECT":
        if (Array.isArray(a))
          out[q.id] = [...new Set(a.filter((x): x is string => typeof x === "string" && ids.has(x)))];
        break;
      case "TRUE_FALSE":
        if (typeof a === "boolean") out[q.id] = a;
        break;
      case "SHORT_ANSWER":
        if (typeof a === "string") out[q.id] = a.slice(0, 1000);
        break;
      case "MATCHING":
        if (typeof a === "object" && !Array.isArray(a)) {
          const lefts = new Set((q.options.left ?? []).map((l) => l.id));
          out[q.id] = Object.fromEntries(
            Object.entries(a as Record<string, unknown>).filter(
              (e): e is [string, string] => lefts.has(e[0]) && typeof e[1] === "string" && ids.has(e[1]),
            ),
          );
        }
        break;
    }
  }
  return out;
}

/** Autosave. Ignored once the attempt is over (so a slow connection can't add answers after time). */
export async function saveAnswers(
  actor: Actor,
  attemptId: string,
  raw: unknown,
): Promise<{ saved: boolean }> {
  const attempt = await ownAttempt(actor, attemptId);
  if (attempt.status !== "IN_PROGRESS" || isExpired(attempt)) return { saved: false };
  const answers = cleanAnswers(attempt.questions as unknown as SnapshotQuestion[], raw);
  const { count } = await db.quizAttempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS" },
    data: { answers: answers as Prisma.InputJsonValue },
  });
  return { saved: count === 1 };
}

export async function submitAttempt(actor: Actor, attemptId: string, raw: unknown) {
  const attempt = await ownAttempt(actor, attemptId);
  if (attempt.status !== "IN_PROGRESS") return attempt;
  // Past the deadline only the autosaved answers count.
  if (!isExpired(attempt)) await saveAnswers(actor, attemptId, raw);
  return finalize(
    await db.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: true } }),
    {
      timedOut: isExpired(attempt),
    },
  );
}

async function finalize(attempt: QuizAttempt & { quiz?: { passPct: number } }, opts: { timedOut: boolean }) {
  const quiz = attempt.quiz ?? (await db.quiz.findUniqueOrThrow({ where: { itemId: attempt.quizId } }));
  const questions = attempt.questions as unknown as SnapshotQuestion[];
  const result = scoreAttempt(questions, attempt.answers as Record<string, Answer>);
  const needsMarking = result.needsMarking.length > 0;
  // Conditional update: only the first finaliser wins if two requests race.
  const { count } = await db.quizAttempt.updateMany({
    where: { id: attempt.id, status: "IN_PROGRESS" },
    data: {
      status: needsMarking ? "NEEDS_MARKING" : "MARKED",
      awarded: result.awarded,
      scorePct: result.scorePct,
      passed: needsMarking ? null : result.scorePct >= quiz.passPct,
      submittedAt: new Date(),
    },
  });
  if (count === 1) {
    const enrolment = await db.enrolment.findUniqueOrThrow({
      where: { id: attempt.enrolmentId },
      select: { userId: true },
    });
    await audit({
      actorId: enrolment.userId,
      action: "quiz.submitted",
      entityType: "QuizAttempt",
      entityId: attempt.id,
      meta: { scorePct: result.scorePct, needsMarking, timedOut: opts.timedOut },
    });
    await syncItemProgress(attempt.enrolmentId, attempt.quizId);
  }
  return db.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
}

export interface AttemptReview {
  attemptNo: number;
  status: string;
  scorePct: number | null;
  passed: boolean | null;
  passPct: number;
  showAnswers: boolean;
  questions: {
    id: string;
    prompt: string;
    type: SnapshotQuestion["type"];
    options: SnapshotQuestion["options"];
    answer: Answer | undefined;
    points: number;
    max: number;
    pending: boolean;
    correct?: unknown;
    explanation?: string | null;
  }[];
}

/** Results for the learner. Correct answers only when the quiz's "show answers" rule allows. */
export async function getAttemptReview(actor: Actor, attemptId: string): Promise<AttemptReview> {
  const attempt = await ownAttempt(actor, attemptId);
  if (attempt.status === "IN_PROGRESS") throw new AssessmentError("Finish the attempt first.");
  const passedAny = await db.quizAttempt.count({
    where: { quizId: attempt.quizId, enrolmentId: attempt.enrolmentId, passed: true },
  });
  const show =
    attempt.status === "MARKED" &&
    (attempt.quiz.showAnswers === "AFTER_SUBMIT" ||
      (attempt.quiz.showAnswers === "AFTER_PASS" && passedAny > 0));
  const awarded = attempt.awarded as Record<string, number>;
  const answers = attempt.answers as Record<string, Answer>;
  return {
    attemptNo: attempt.attemptNo,
    status: attempt.status,
    scorePct: attempt.status === "MARKED" ? attempt.scorePct : null,
    passed: attempt.passed,
    passPct: attempt.quiz.passPct,
    showAnswers: show,
    questions: (attempt.questions as unknown as SnapshotQuestion[]).map((q) => {
      const auto = scoreQuestion(q, answers[q.id]);
      return {
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        options: q.options,
        answer: answers[q.id],
        points: awarded[q.id] ?? 0,
        max: q.points,
        pending: attempt.status === "NEEDS_MARKING" && auto.needsMarking,
        ...(show ? { correct: q.key, explanation: q.explanation } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Trainer marking of short answers
// ---------------------------------------------------------------------------

export async function getAttemptForMarking(actor: Actor, attemptId: string) {
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: { include: { item: { select: { title: true, module: { select: { courseId: true } } } } } },
    },
  });
  if (!attempt) throw new NotFoundError("Attempt not found");
  await assertCanEditCourse(actor, attempt.quiz.item.module.courseId);
  return attempt;
}

/** A trainer confirms or adjusts points (typically for unmatched short answers) and finalises the attempt. */
export async function markAttempt(actor: Actor, attemptId: string, awardedInput: Record<string, number>) {
  const attempt = await getAttemptForMarking(actor, attemptId);
  if (attempt.status === "IN_PROGRESS")
    throw new AssessmentError("The learner hasn't submitted this attempt yet.");
  const questions = attempt.questions as unknown as SnapshotQuestion[];
  const merged = { ...(attempt.awarded as Record<string, number>), ...awardedInput };
  const { awarded, scorePct } = rescore(questions, merged);
  await db.quizAttempt.update({
    where: { id: attemptId },
    data: {
      awarded,
      scorePct,
      passed: scorePct >= attempt.quiz.passPct,
      status: "MARKED",
      markedById: actor.id,
      markedAt: new Date(),
    },
  });
  await audit({
    actorId: actor.id,
    action: "quiz.marked",
    entityType: "QuizAttempt",
    entityId: attemptId,
    meta: { scorePct },
  });
  await syncItemProgress(attempt.enrolmentId, attempt.quizId);
}
