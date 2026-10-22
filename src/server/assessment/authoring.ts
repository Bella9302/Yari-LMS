import "server-only";
import type { Prisma, ShowAnswers } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import type { Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { rubricMax } from "@/server/assessment/scoring";
import { keyProblems, questionInputSchema, type QuestionInput } from "@/lib/questions";

// ---------------------------------------------------------------------------
// Question banks
// ---------------------------------------------------------------------------

async function courseOfBank(bankId: string) {
  const bank = await db.questionBank.findUnique({ where: { id: bankId }, select: { courseId: true } });
  if (!bank) throw new NotFoundError("Question bank not found");
  return bank.courseId;
}

export async function createBank(actor: Actor, courseId: string, title: string) {
  await assertCanEditCourse(actor, courseId);
  return db.questionBank.create({ data: { courseId, title: title.trim() || "Question bank" } });
}

export async function renameBank(actor: Actor, bankId: string, title: string) {
  await assertCanEditCourse(actor, await courseOfBank(bankId));
  await db.questionBank.update({ where: { id: bankId }, data: { title: title.trim() || "Question bank" } });
}

export async function deleteBank(actor: Actor, bankId: string) {
  await assertCanEditCourse(actor, await courseOfBank(bankId));
  const used = await db.quizSection.count({ where: { bankId } });
  if (used) throw new AssessmentError("This bank is used by a quiz. Remove it from the quiz first.");
  await db.questionBank.delete({ where: { id: bankId } });
}

export interface QuestionFields {
  prompt: string;
  points: number;
  explanation?: string | null;
  data: unknown;
}

function parseQuestion(fields: QuestionFields): QuestionInput {
  if (!fields.prompt.trim()) throw new AssessmentError("Write the question.");
  if (fields.prompt.length > 2000) throw new AssessmentError("Keep the question under 2,000 characters.");
  if (!Number.isInteger(fields.points) || fields.points < 1 || fields.points > 100) {
    throw new AssessmentError("Points must be a whole number from 1 to 100.");
  }
  const parsed = questionInputSchema.safeParse(fields.data);
  if (!parsed.success) throw new AssessmentError(parsed.error.issues[0]?.message ?? "Check the answers.");
  const problem = keyProblems(parsed.data);
  if (problem) throw new AssessmentError(problem);
  return parsed.data;
}

export async function addQuestion(actor: Actor, bankId: string, fields: QuestionFields) {
  await assertCanEditCourse(actor, await courseOfBank(bankId));
  const q = parseQuestion(fields);
  const last = await db.question.findFirst({ where: { bankId }, orderBy: { position: "desc" } });
  return db.question.create({
    data: {
      bankId,
      type: q.type,
      prompt: fields.prompt.trim(),
      points: fields.points,
      explanation: fields.explanation?.trim() || null,
      options: q.options as Prisma.InputJsonValue,
      answerKey: q.answerKey as Prisma.InputJsonValue,
      position: (last?.position ?? -1) + 1,
    },
  });
}

/** Edits apply to future attempts only: past attempts keep the snapshot they were taken with. */
export async function updateQuestion(actor: Actor, questionId: string, fields: QuestionFields) {
  const existing = await db.question.findUnique({ where: { id: questionId } });
  if (!existing) throw new NotFoundError("Question not found");
  await assertCanEditCourse(actor, await courseOfBank(existing.bankId));
  const q = parseQuestion(fields);
  await db.question.update({
    where: { id: questionId },
    data: {
      type: q.type,
      prompt: fields.prompt.trim(),
      points: fields.points,
      explanation: fields.explanation?.trim() || null,
      options: q.options as Prisma.InputJsonValue,
      answerKey: q.answerKey as Prisma.InputJsonValue,
    },
  });
}

export async function archiveQuestion(actor: Actor, questionId: string) {
  const existing = await db.question.findUnique({ where: { id: questionId } });
  if (!existing) throw new NotFoundError("Question not found");
  await assertCanEditCourse(actor, await courseOfBank(existing.bankId));
  await db.question.update({ where: { id: questionId }, data: { archived: true } });
}

// ---------------------------------------------------------------------------
// Quiz settings
// ---------------------------------------------------------------------------

async function courseOfItem(itemId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { type: true, module: { select: { courseId: true } } },
  });
  if (!item) throw new NotFoundError("Item not found");
  return { courseId: item.module.courseId, type: item.type };
}

export interface QuizSettings {
  instructions: string;
  passPct: number;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  shuffle: boolean;
  showAnswers: ShowAnswers;
}

export async function updateQuizSettings(actor: Actor, itemId: string, s: QuizSettings) {
  const { courseId, type } = await courseOfItem(itemId);
  await assertCanEditCourse(actor, courseId);
  if (type !== "QUIZ") throw new AssessmentError("Not a quiz.");
  if (s.passPct < 0 || s.passPct > 100)
    throw new AssessmentError("The pass mark must be between 0 and 100%.");
  if (s.timeLimitMin !== null && (s.timeLimitMin < 1 || s.timeLimitMin > 600))
    throw new AssessmentError("Time limit must be 1–600 minutes.");
  if (s.maxAttempts !== null && (s.maxAttempts < 1 || s.maxAttempts > 50))
    throw new AssessmentError("Attempts must be 1–50.");
  await db.quiz.upsert({
    where: { itemId },
    create: { itemId, ...s, instructions: s.instructions.slice(0, 2000) },
    update: { ...s, instructions: s.instructions.slice(0, 2000) },
  });
}

export async function addQuizSection(actor: Actor, itemId: string, bankId: string, drawCount: number | null) {
  const { courseId } = await courseOfItem(itemId);
  await assertCanEditCourse(actor, courseId);
  if ((await courseOfBank(bankId)) !== courseId) throw new AssessmentError("Choose a bank from this course.");
  const available = await db.question.count({ where: { bankId, archived: false } });
  if (drawCount !== null && (drawCount < 1 || drawCount > available)) {
    throw new AssessmentError(`That bank has ${available} question${available === 1 ? "" : "s"}.`);
  }
  const last = await db.quizSection.findFirst({ where: { quizId: itemId }, orderBy: { position: "desc" } });
  await db.quizSection.create({
    data: { quizId: itemId, bankId, drawCount, position: (last?.position ?? -1) + 1 },
  });
}

export async function removeQuizSection(actor: Actor, sectionId: string) {
  const section = await db.quizSection.findUnique({ where: { id: sectionId } });
  if (!section) return;
  await assertCanEditCourse(actor, (await courseOfItem(section.quizId)).courseId);
  await db.quizSection.delete({ where: { id: sectionId } });
}

/** How many questions an attempt will contain (for the editor and the publish check). */
export async function quizQuestionCount(itemId: string): Promise<number> {
  const sections = await db.quizSection.findMany({
    where: { quizId: itemId },
    include: { bank: { select: { _count: { select: { questions: { where: { archived: false } } } } } } },
  });
  return sections.reduce((n, s) => n + Math.min(s.drawCount ?? Infinity, s.bank._count.questions), 0);
}

// ---------------------------------------------------------------------------
// Assignment settings
// ---------------------------------------------------------------------------

export interface AssignmentSettings {
  dueAt: Date | null;
  allowText: boolean;
  allowFiles: boolean;
  maxFiles: number;
  maxPoints: number;
  passPct: number;
  rubricId: string | null;
  allowLate: boolean;
}

export async function updateAssignmentSettings(actor: Actor, itemId: string, s: AssignmentSettings) {
  const { courseId, type } = await courseOfItem(itemId);
  await assertCanEditCourse(actor, courseId);
  if (type !== "ASSIGNMENT") throw new AssessmentError("Not an assignment.");
  if (!s.allowText && !s.allowFiles) throw new AssessmentError("Allow text, files, or both.");
  if (s.passPct < 0 || s.passPct > 100)
    throw new AssessmentError("The pass mark must be between 0 and 100%.");
  if (s.maxFiles < 1 || s.maxFiles > 10) throw new AssessmentError("Allow 1–10 files.");
  let maxPoints = s.maxPoints;
  if (s.rubricId) {
    const rubric = await db.rubric.findFirst({
      where: { id: s.rubricId, courseId },
      include: { criteria: { include: { levels: true } } },
    });
    if (!rubric) throw new AssessmentError("Choose a rubric from this course.");
    maxPoints = rubricMax(rubric);
    if (maxPoints <= 0) throw new AssessmentError("That rubric has no points yet.");
  } else if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000) {
    throw new AssessmentError("Total marks must be 1–1000.");
  }
  await db.assignment.upsert({
    where: { itemId },
    create: { itemId, ...s, maxPoints },
    update: { ...s, maxPoints },
  });
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

export interface RubricInput {
  title: string;
  criteria: {
    title: string;
    description?: string;
    levels: { label: string; points: number; description?: string }[];
  }[];
}

function validateRubric(input: RubricInput) {
  if (!input.title.trim()) throw new AssessmentError("Give the rubric a title.");
  if (input.criteria.length === 0 || input.criteria.length > 20)
    throw new AssessmentError("Add 1–20 criteria.");
  for (const c of input.criteria) {
    if (!c.title.trim()) throw new AssessmentError("Every criterion needs a title.");
    if (c.levels.length < 2 || c.levels.length > 6)
      throw new AssessmentError(`“${c.title}” needs 2–6 levels.`);
    for (const l of c.levels) {
      if (!l.label.trim()) throw new AssessmentError(`Name every level of “${c.title}”.`);
      if (!Number.isInteger(l.points) || l.points < 0 || l.points > 100)
        throw new AssessmentError("Level points must be 0–100.");
    }
  }
}

export async function saveRubric(
  actor: Actor,
  courseId: string,
  rubricId: string | null,
  input: RubricInput,
) {
  await assertCanEditCourse(actor, courseId);
  validateRubric(input);
  if (rubricId) {
    const marked = await db.mark.count({ where: { submission: { assignment: { rubricId } } } });
    if (marked)
      throw new AssessmentError(
        "Work has already been marked with this rubric. Duplicate it to make changes.",
      );
  }
  return db.$transaction(async (tx) => {
    const rubric = rubricId
      ? await tx.rubric.update({ where: { id: rubricId, courseId }, data: { title: input.title.trim() } })
      : await tx.rubric.create({ data: { courseId, title: input.title.trim() } });
    await tx.rubricCriterion.deleteMany({ where: { rubricId: rubric.id } });
    for (const [ci, c] of input.criteria.entries()) {
      await tx.rubricCriterion.create({
        data: {
          rubricId: rubric.id,
          position: ci,
          title: c.title.trim(),
          description: c.description?.trim() ?? "",
          levels: {
            create: c.levels.map((l, li) => ({
              position: li,
              label: l.label.trim(),
              points: l.points,
              description: l.description?.trim() ?? "",
            })),
          },
        },
      });
    }
    // Keep assignments that use this rubric in step with its total.
    const total = input.criteria.reduce((sum, c) => sum + Math.max(...c.levels.map((l) => l.points)), 0);
    await tx.assignment.updateMany({ where: { rubricId: rubric.id }, data: { maxPoints: total } });
    return rubric;
  });
}

export async function duplicateRubric(actor: Actor, rubricId: string) {
  const rubric = await db.rubric.findUnique({
    where: { id: rubricId },
    include: {
      criteria: { orderBy: { position: "asc" }, include: { levels: { orderBy: { position: "asc" } } } },
    },
  });
  if (!rubric) throw new NotFoundError("Rubric not found");
  return saveRubric(actor, rubric.courseId, null, {
    title: `${rubric.title} (copy)`,
    criteria: rubric.criteria.map((c) => ({ title: c.title, description: c.description, levels: c.levels })),
  });
}

export async function deleteRubric(actor: Actor, rubricId: string) {
  const rubric = await db.rubric.findUnique({ where: { id: rubricId } });
  if (!rubric) return;
  await assertCanEditCourse(actor, rubric.courseId);
  const used = await db.assignment.count({ where: { rubricId } });
  if (used) throw new AssessmentError("This rubric is attached to an assignment.");
  await db.rubric.delete({ where: { id: rubricId } });
}

export function getRubric(rubricId: string) {
  return db.rubric.findUnique({
    where: { id: rubricId },
    include: {
      criteria: { orderBy: { position: "asc" }, include: { levels: { orderBy: { position: "asc" } } } },
    },
  });
}
