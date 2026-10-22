// Pure marking logic. No database access, so every rule is unit-tested.
import { randomInt } from "node:crypto";
import type { Answer, SnapshotQuestion } from "@/lib/questions";

export interface QuestionResult {
  points: number;
  max: number;
  /** Short answer that didn't match an accepted answer: a trainer decides. */
  needsMarking: boolean;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function scoreQuestion(q: SnapshotQuestion, answer: Answer | undefined): QuestionResult {
  const max = q.points;
  const none = { points: 0, max, needsMarking: false };
  if (answer === undefined || answer === null || answer === "") return none;

  switch (q.type) {
    case "MCQ": {
      const key = q.key as { correct: string };
      return { points: answer === key.correct ? max : 0, max, needsMarking: false };
    }
    case "TRUE_FALSE": {
      const key = q.key as { correct: boolean };
      return { points: answer === key.correct ? max : 0, max, needsMarking: false };
    }
    case "MULTI_SELECT": {
      // Partial credit: each right choice earns a share; each wrong choice takes one back (never below zero).
      if (!Array.isArray(answer)) return none;
      const correct = new Set((q.key as { correct: string[] }).correct);
      const picked = new Set(answer);
      let right = 0;
      let wrong = 0;
      for (const id of picked) {
        if (correct.has(id)) right++;
        else wrong++;
      }
      return { points: round2((Math.max(0, right - wrong) / correct.size) * max), max, needsMarking: false };
    }
    case "MATCHING": {
      if (typeof answer !== "object" || Array.isArray(answer)) return none;
      const pairs = (q.key as { pairs: Record<string, string> }).pairs;
      const lefts = Object.keys(pairs);
      const right = lefts.filter((l) => (answer as Record<string, string>)[l] === pairs[l]).length;
      return { points: round2((right / lefts.length) * max), max, needsMarking: false };
    }
    case "SHORT_ANSWER": {
      if (typeof answer !== "string" || !answer.trim()) return none;
      const accepted = (q.key as { accepted: string[] }).accepted.map(norm);
      return accepted.includes(norm(answer))
        ? { points: max, max, needsMarking: false }
        : { points: 0, max, needsMarking: true };
    }
  }
}

export interface AttemptResult {
  awarded: Record<string, number>;
  total: number;
  max: number;
  scorePct: number;
  needsMarking: string[];
}

export function scoreAttempt(questions: SnapshotQuestion[], answers: Record<string, Answer>): AttemptResult {
  const awarded: Record<string, number> = {};
  const needsMarking: string[] = [];
  let total = 0;
  let max = 0;
  for (const q of questions) {
    const r = scoreQuestion(q, answers[q.id]);
    awarded[q.id] = r.points;
    total += r.points;
    max += r.max;
    if (r.needsMarking) needsMarking.push(q.id);
  }
  return { awarded, total: round2(total), max, scorePct: percent(total, max), needsMarking };
}

/** Recalculates the score after a trainer adjusts points (clamped to each question's maximum). */
export function rescore(questions: SnapshotQuestion[], awarded: Record<string, number>) {
  let total = 0;
  let max = 0;
  const clean: Record<string, number> = {};
  for (const q of questions) {
    const p = Math.min(q.points, Math.max(0, Number(awarded[q.id] ?? 0) || 0));
    clean[q.id] = round2(p);
    total += p;
    max += q.points;
  }
  return { awarded: clean, scorePct: percent(total, max) };
}

export function percent(points: number, max: number) {
  return max > 0 ? round2((points / max) * 100) : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Drawing questions
// ---------------------------------------------------------------------------

export function shuffle<T>(items: T[], rand: (max: number) => number = randomInt): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface SectionPool {
  questions: SnapshotQuestion[];
  drawCount: number | null;
}

/**
 * Picks questions for one attempt: a random `drawCount` from each section (all when null),
 * never the same question twice. Optionally shuffles question order and answer options.
 */
export function drawQuestions(
  sections: SectionPool[],
  opts: { shuffle: boolean },
  rand = randomInt,
): SnapshotQuestion[] {
  const seen = new Set<string>();
  const picked: SnapshotQuestion[] = [];
  for (const s of sections) {
    const pool = s.questions.filter((q) => !seen.has(q.id));
    const take = s.drawCount == null ? pool : shuffle(pool, rand).slice(0, s.drawCount);
    // Without shuffling, keep the bank's order for drawn questions.
    const ordered = opts.shuffle ? take : pool.filter((q) => take.includes(q));
    for (const q of ordered) {
      seen.add(q.id);
      picked.push(q);
    }
  }
  const questions = opts.shuffle ? shuffle(picked, rand) : picked;
  return questions.map((q) => {
    // Matching answers are stored in the same order as their prompts, so they are always
    // shuffled: otherwise the order itself would give the answer away.
    if (q.options.right) return { ...q, options: { ...q.options, right: shuffle(q.options.right, rand) } };
    if (opts.shuffle && q.options.choices)
      return { ...q, options: { ...q.options, choices: shuffle(q.options.choices, rand) } };
    return q;
  });
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

export interface RubricShape {
  criteria: { id: string; levels: { id: string; points: number }[] }[];
}

export function rubricMax(r: RubricShape) {
  return r.criteria.reduce((sum, c) => sum + Math.max(0, ...c.levels.map((l) => l.points)), 0);
}

/** Total of the chosen level per criterion. Returns null until every criterion has a level. */
export function rubricScore(r: RubricShape, selections: Record<string, string>): number | null {
  let total = 0;
  for (const c of r.criteria) {
    const level = c.levels.find((l) => l.id === selections[c.id]);
    if (!level) return null;
    total += level.points;
  }
  return total;
}
