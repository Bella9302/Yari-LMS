import { Readable } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addItem,
  addReleaseRule,
  createCourse,
  enrolLearners,
  setCourseStatus,
  updateItem,
  cloneCourse,
} from "@/server/courses/builder";
import { getLearnerCourse } from "@/server/courses/learner";
import {
  addQuestion,
  addQuizSection,
  createBank,
  saveRubric,
  updateAssignmentSettings,
  updateQuizSettings,
} from "@/server/assessment/authoring";
import {
  getAttemptForLearner,
  getAttemptReview,
  getQuizOverview,
  markAttempt,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "@/server/assessment/quiz";
import {
  getAssignmentOverview,
  getMarkingQueue,
  saveMark,
  submitAssignment,
} from "@/server/assessment/assignments";
import { gradebookCsv, getGradebook } from "@/server/assessment/gradebook";
import { setGradeOverride } from "@/server/assessment/grades";
import { AssessmentError } from "@/server/assessment/errors";
import { canReadAsset, finishUpload, startUpload } from "@/server/storage/assets";
import { storage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, trainer: U, learner: U, other: U;

const mcq = (text: string, correct = "a") => ({
  prompt: text,
  points: 1,
  data: {
    type: "MCQ",
    options: {
      choices: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
    },
    answerKey: { correct },
  },
});

async function quizCourse(
  opts: {
    passPct?: number;
    maxAttempts?: number | null;
    timeLimitMin?: number | null;
    withShortAnswer?: boolean;
  } = {},
) {
  const course = await createCourse(trainer, { title: "Assessed course", category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const bank = await createBank(trainer, course.id, "Bank");
  for (let i = 0; i < 4; i++) await addQuestion(trainer, bank.id, mcq(`Q${i}`));
  if (opts.withShortAnswer) {
    await addQuestion(trainer, bank.id, {
      prompt: "Which section lists SHE rep functions?",
      points: 1,
      data: { type: "SHORT_ANSWER", options: {}, answerKey: { accepted: ["section 18"] } },
    });
  }
  const quiz = await addItem(trainer, mod.id, "QUIZ", "Knowledge check");
  await updateQuizSettings(trainer, quiz.id, {
    instructions: "",
    passPct: opts.passPct ?? 75,
    timeLimitMin: opts.timeLimitMin ?? null,
    maxAttempts: opts.maxAttempts === undefined ? 2 : opts.maxAttempts,
    shuffle: true,
    showAnswers: "AFTER_SUBMIT",
  });
  await addQuizSection(trainer, quiz.id, bank.id, null);
  await updateItem(trainer, quiz.id, {
    title: "Knowledge check",
    required: true,
    published: true,
    estMinutes: null,
  });
  const next = await addItem(trainer, mod.id, "RICH_TEXT", "After the quiz");
  await updateItem(trainer, next.id, {
    title: "After the quiz",
    required: false,
    published: true,
    estMinutes: null,
    body: { type: "doc", content: [] },
  });
  await addReleaseRule(trainer, {
    target: { itemId: next.id },
    type: "MIN_SCORE",
    dependsOnItemId: quiz.id,
    minScorePct: 75,
  });
  await setCourseStatus(trainer, course.id, "PUBLISHED");
  await enrolLearners(admin, course.id, [learner.id]);
  return { course, quiz, next, bank };
}

/** Answers every question correctly except `wrong` of them. */
async function answerAll(attemptId: string, wrong = 0) {
  const attempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const qs = attempt.questions as {
    id: string;
    type: string;
    key: { correct?: string; accepted?: string[] };
  }[];
  const answers: Record<string, unknown> = {};
  qs.forEach((q, i) => {
    if (q.type === "MCQ") answers[q.id] = i < wrong ? (q.key.correct === "a" ? "b" : "a") : q.key.correct;
    if (q.type === "SHORT_ANSWER") answers[q.id] = "the one about reps";
  });
  return answers;
}

beforeAll(async () => {
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }] });
  learner = await createUser({ roles: [{ role: "LEARNER" }] });
  other = await createUser({ roles: [{ role: "LEARNER" }] });
});

describe("quizzes", () => {
  it("never sends the answer key to the learner", async () => {
    const { quiz } = await quizCourse();
    const attemptId = await startAttempt(learner, quiz.id);
    const view = await getAttemptForLearner(learner, attemptId);
    expect(view.questions).toHaveLength(4);
    expect(JSON.stringify(view)).not.toMatch(/"correct"|"key"|accepted/);
  });

  it("marks, passes, completes the item and unlocks score-gated content", async () => {
    const { course, quiz, next } = await quizCourse();
    const a1 = await startAttempt(learner, quiz.id);
    await submitAttempt(learner, a1, await answerAll(a1, 2)); // 50%
    let overview = await getQuizOverview(learner, quiz.id);
    expect(overview).toMatchObject({ bestPct: 50, passed: false, canStart: true });
    let view = await getLearnerCourse(learner, course.slug);
    expect(view!.modules[0]!.items.find((i) => i.id === next.id)!.lock.reasons[0]).toMatch(
      /Score at least 75%/,
    );

    const a2 = await startAttempt(learner, quiz.id);
    await submitAttempt(learner, a2, await answerAll(a2, 0)); // 100%
    overview = await getQuizOverview(learner, quiz.id);
    expect(overview).toMatchObject({ bestPct: 100, passed: true, canStart: false });
    view = await getLearnerCourse(learner, course.slug);
    expect(view!.modules[0]!.items.find((i) => i.id === next.id)!.lock.unlocked).toBe(true);
    expect(view!.enrolment!.status).toBe("COMPLETED"); // the quiz was the only required item

    const review = await getAttemptReview(learner, a2);
    expect(review.showAnswers).toBe(true);
    expect(review.questions[0]!.correct).toBeDefined();
  });

  it("enforces the attempt limit", async () => {
    const { quiz } = await quizCourse({ maxAttempts: 1 });
    const a = await startAttempt(learner, quiz.id);
    await submitAttempt(learner, a, await answerAll(a, 4));
    await expect(startAttempt(learner, quiz.id)).rejects.toThrow(/used all your attempts/);
  });

  it("ignores answers sent after the time limit and auto-submits", async () => {
    const { quiz } = await quizCourse({ timeLimitMin: 5 });
    const a = await startAttempt(learner, quiz.id);
    await saveAnswers(learner, a, await answerAll(a, 4)); // all wrong, saved in time
    await db.quizAttempt.update({ where: { id: a }, data: { deadline: new Date(Date.now() - 60_000) } });
    expect((await saveAnswers(learner, a, await answerAll(a, 0))).saved).toBe(false);
    const view = await getAttemptForLearner(learner, a);
    expect(view.status).toBe("MARKED");
    expect((await db.quizAttempt.findUniqueOrThrow({ where: { id: a } })).scorePct).toBe(0);
  });

  it("holds unmatched short answers for a trainer, who can then pass the learner", async () => {
    const { quiz } = await quizCourse({ withShortAnswer: true, passPct: 100, maxAttempts: null });
    const a = await startAttempt(learner, quiz.id);
    await submitAttempt(learner, a, await answerAll(a, 0));
    const attempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: a } });
    expect(attempt.status).toBe("NEEDS_MARKING");
    expect((await getQuizOverview(learner, quiz.id)).pending).toBe(true);
    const review = await getAttemptReview(learner, a);
    expect(review.showAnswers).toBe(false); // not until marking is finished

    const shortId = (attempt.questions as { id: string; type: string }[]).find(
      (q) => q.type === "SHORT_ANSWER",
    )!.id;
    await expect(markAttempt(other, a, { [shortId]: 1 })).rejects.toThrow();
    await markAttempt(trainer, a, { [shortId]: 1 });
    expect(await getQuizOverview(learner, quiz.id)).toMatchObject({ bestPct: 100, passed: true });
  });

  it("copies question banks and quiz settings when a course is cloned", async () => {
    const { course } = await quizCourse();
    const copy = await cloneCourse(trainer, course.id, { title: "Copy" });
    const q = await db.quiz.findFirstOrThrow({
      where: { item: { module: { courseId: copy.id } } },
      include: { sections: { include: { bank: true } } },
    });
    expect(q.sections[0]!.bank.courseId).toBe(copy.id);
    expect(await db.question.count({ where: { bankId: q.sections[0]!.bankId } })).toBe(4);
  });
});

describe("assignments", () => {
  async function assignmentCourse(opts: { dueAt?: Date | null; allowLate?: boolean } = {}) {
    const course = await createCourse(trainer, { title: "Practical", category: "HEALTH_SAFETY" });
    const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
    const rubric = await saveRubric(trainer, course.id, null, {
      title: "Inspection report",
      criteria: [
        {
          title: "Hazards found",
          levels: [
            { label: "Few", points: 0 },
            { label: "Most", points: 5 },
            { label: "All", points: 10 },
          ],
        },
        {
          title: "Actions",
          levels: [
            { label: "Vague", points: 0 },
            { label: "Clear", points: 10 },
          ],
        },
      ],
    });
    const item = await addItem(trainer, mod.id, "ASSIGNMENT", "Inspection report");
    await updateAssignmentSettings(trainer, item.id, {
      dueAt: opts.dueAt ?? null,
      allowText: true,
      allowFiles: true,
      maxFiles: 2,
      maxPoints: 999, // ignored: the rubric's total (20) wins
      passPct: 50,
      rubricId: rubric.id,
      allowLate: opts.allowLate ?? true,
    });
    await updateItem(trainer, item.id, {
      title: "Inspection report",
      required: true,
      published: true,
      estMinutes: null,
    });
    await setCourseStatus(trainer, course.id, "PUBLISHED");
    await enrolLearners(admin, course.id, [learner.id]);
    const full = await db.rubric.findUniqueOrThrow({
      where: { id: rubric.id },
      include: { criteria: { include: { levels: true } } },
    });
    return { course, item, rubric: full };
  }

  const level = (
    rubric: Awaited<ReturnType<typeof assignmentCourse>>["rubric"],
    criterion: number,
    label: string,
  ) =>
    rubric.criteria.sort((a, b) => a.position - b.position)[criterion]!.levels.find((l) => l.label === label)!
      .id;

  it("flags late work, and refuses it when late work isn't allowed", async () => {
    const late = await assignmentCourse({ dueAt: new Date(Date.now() - 86_400_000) });
    const s = await submitAssignment(learner, late.item.id, { text: "My report", assetIds: [] });
    expect(s.isLate).toBe(true);
    const strict = await assignmentCourse({ dueAt: new Date(Date.now() - 86_400_000), allowLate: false });
    await expect(submitAssignment(learner, strict.item.id, { text: "x", assetIds: [] })).rejects.toThrow(
      AssessmentError,
    );
  });

  it("keeps draft marks private, releases rubric marks, and completes the course on a pass", async () => {
    const { course, item, rubric } = await assignmentCourse();
    expect((await db.assignment.findUniqueOrThrow({ where: { itemId: item.id } })).maxPoints).toBe(20);
    const s = await submitAssignment(learner, item.id, { text: "Report", assetIds: [] });
    await expect(submitAssignment(learner, item.id, { text: "again", assetIds: [] })).rejects.toThrow(
      /your trainer will mark it/,
    );

    const selections = {
      [rubric.criteria[0]!.id]: level(rubric, 0, "Most"),
      [rubric.criteria[1]!.id]: level(rubric, 1, "Clear"),
    };
    await saveMark(trainer, s.id, {
      score: null,
      rubricSelections: selections,
      feedbackText: "Good",
      feedbackAssetId: null,
      audioAssetId: null,
      action: "draft",
    });
    let overview = await getAssignmentOverview(learner, item.id);
    expect(overview.submissions[0]!.feedback).toBeNull();

    await expect(
      saveMark(trainer, s.id, {
        score: null,
        rubricSelections: { [rubric.criteria[0]!.id]: level(rubric, 0, "All") },
        feedbackText: "",
        feedbackAssetId: null,
        audioAssetId: null,
        action: "release",
      }),
    ).rejects.toThrow(/every rubric criterion/);

    await saveMark(trainer, s.id, {
      score: null,
      rubricSelections: selections,
      feedbackText: "Good",
      feedbackAssetId: null,
      audioAssetId: null,
      action: "release",
    });
    overview = await getAssignmentOverview(learner, item.id);
    expect(overview.submissions[0]!.feedback).toMatchObject({ score: 15, maxPoints: 20, text: "Good" });
    expect(overview.grade).toMatchObject({ scorePct: 75, passed: true });
    expect((await getLearnerCourse(learner, course.slug))!.enrolment!.status).toBe("COMPLETED");
  });

  it("lets a trainer return work for resubmission", async () => {
    const { item, rubric } = await assignmentCourse();
    const s = await submitAssignment(learner, item.id, { text: "Draft", assetIds: [] });
    const fail = {
      [rubric.criteria[0]!.id]: level(rubric, 0, "Few"),
      [rubric.criteria[1]!.id]: level(rubric, 1, "Vague"),
    };
    await saveMark(trainer, s.id, {
      score: null,
      rubricSelections: fail,
      feedbackText: "Redo",
      feedbackAssetId: null,
      audioAssetId: null,
      action: "return",
    });
    const overview = await getAssignmentOverview(learner, item.id);
    expect(overview.canSubmit).toBe(true);
    const s2 = await submitAssignment(learner, item.id, { text: "Better", assetIds: [] });
    expect(s2.attemptNo).toBe(2);
    const queue = await getMarkingQueue(trainer, item.id);
    expect(queue[0]!.submissionId).toBe(s2.id); // newest attempt, waiting first
  });

  it("only lets the learner and course trainers open submitted files", async () => {
    const { course, item } = await assignmentCourse();
    const pdf = Buffer.from("%PDF-1.4\nreport\n");
    const { assetId } = await startUpload(learner, {
      purpose: "submission",
      courseId: course.id,
      itemId: item.id,
      filename: "report.pdf",
      mime: "application/pdf",
      bytes: pdf.length,
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
    await (storage() as LocalStorage).write(asset.storageKey, Readable.from([pdf]), asset.bytes);
    await finishUpload(learner, assetId);
    await submitAssignment(learner, item.id, { text: "", assetIds: [assetId] });

    expect(await canReadAsset(learner, assetId)).toBe(true);
    expect(await canReadAsset(trainer, assetId)).toBe(true);
    expect(await canReadAsset(other, assetId)).toBe(false);
    // Someone not on the course can't upload "submissions" to it.
    await expect(
      startUpload(other, {
        purpose: "submission",
        courseId: course.id,
        itemId: item.id,
        filename: "x.pdf",
        mime: "application/pdf",
        bytes: 10,
      }),
    ).rejects.toThrow();
  });
});

describe("gradebook", () => {
  it("shows grades, filters, honours overrides and exports safe CSV", async () => {
    const { course, quiz } = await quizCourse();
    const a = await startAttempt(learner, quiz.id);
    await submitAttempt(learner, a, await answerAll(a, 2));
    let gb = await getGradebook(trainer, course.id);
    expect(gb.rows[0]!.grades[quiz.id]).toMatchObject({ scorePct: 50, passed: false });
    expect((await getGradebook(trainer, course.id, { filter: "failing" })).rows).toHaveLength(1);

    const enrolment = await db.enrolment.findFirstOrThrow({
      where: { courseId: course.id, userId: learner.id },
    });
    await setGradeOverride(trainer, enrolment.id, quiz.id, {
      scorePct: 80,
      reason: "Oral assessment on site",
    });
    gb = await getGradebook(trainer, course.id);
    expect(gb.rows[0]!.grades[quiz.id]).toMatchObject({ scorePct: 80, passed: true, overridden: true });

    await db.userProfile.update({ where: { userId: learner.id }, data: {} });
    const csv = gradebookCsv({ ...gb, rows: [{ ...gb.rows[0]!, name: '=HYPERLINK("evil")' }] });
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
    expect(csv).toContain("pass (override)");
    await expect(getGradebook(other, course.id)).rejects.toThrow();
  });
});
