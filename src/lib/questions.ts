// Question shapes shared by the editor (browser) and the server. Answer keys never reach learners:
// the server strips them before sending a question (see toLearnerQuestion).
import { z } from "zod";
import type { QuestionType } from "@/generated/prisma/enums";

const choice = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1, "Options can't be empty.").max(500),
});

export const questionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MCQ"),
    options: z.object({ choices: z.array(choice).min(2, "Add at least two options.").max(10) }),
    answerKey: z.object({ correct: z.string().min(1, "Choose the correct option.") }),
  }),
  z.object({
    type: z.literal("MULTI_SELECT"),
    options: z.object({ choices: z.array(choice).min(2, "Add at least two options.").max(10) }),
    answerKey: z.object({ correct: z.array(z.string()).min(1, "Choose at least one correct option.") }),
  }),
  z.object({
    type: z.literal("TRUE_FALSE"),
    options: z.object({}).default({}),
    answerKey: z.object({ correct: z.boolean() }),
  }),
  z.object({
    type: z.literal("SHORT_ANSWER"),
    options: z.object({}).default({}),
    answerKey: z.object({
      accepted: z
        .array(z.string().trim().min(1).max(200))
        .min(1, "Add at least one accepted answer.")
        .max(20),
    }),
  }),
  z.object({
    type: z.literal("MATCHING"),
    options: z.object({
      left: z.array(choice).min(2, "Add at least two pairs.").max(10),
      right: z.array(choice).min(2).max(12),
    }),
    answerKey: z.object({ pairs: z.record(z.string(), z.string()) }),
  }),
]);

export type QuestionInput = z.infer<typeof questionInputSchema>;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ: "Multiple choice",
  MULTI_SELECT: "Multiple answers",
  TRUE_FALSE: "True or false",
  SHORT_ANSWER: "Short answer",
  MATCHING: "Matching",
};

/** Checks the key refers to real options (zod can't express cross-field references). */
export function keyProblems(q: QuestionInput): string | null {
  switch (q.type) {
    case "MCQ":
      return q.options.choices.some((c) => c.id === q.answerKey.correct)
        ? null
        : "Choose the correct option.";
    case "MULTI_SELECT":
      return q.answerKey.correct.every((id) => q.options.choices.some((c) => c.id === id))
        ? null
        : "Choose valid correct options.";
    case "MATCHING": {
      const lefts = q.options.left.map((l) => l.id);
      const rights = new Set(q.options.right.map((r) => r.id));
      return lefts.every((id) => rights.has(q.answerKey.pairs[id] ?? ""))
        ? null
        : "Give every item on the left its match.";
    }
    default:
      return null;
  }
}

/** A drawn question as stored in an attempt (server-side, includes the key). */
export interface SnapshotQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: {
    choices?: { id: string; text: string }[];
    left?: { id: string; text: string }[];
    right?: { id: string; text: string }[];
  };
  key: unknown;
  explanation: string | null;
}

/** What a learner's browser receives: no key, no explanation. */
export interface LearnerQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: SnapshotQuestion["options"];
}

export function toLearnerQuestion(q: SnapshotQuestion): LearnerQuestion {
  return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: q.options };
}

export type Answer = string | string[] | boolean | Record<string, string> | null;
