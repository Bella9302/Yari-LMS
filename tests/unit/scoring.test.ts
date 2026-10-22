import { describe, expect, it } from "vitest";
import {
  drawQuestions,
  rescore,
  rubricMax,
  rubricScore,
  scoreAttempt,
  scoreQuestion,
  shuffle,
} from "@/server/assessment/scoring";
import { keyProblems, questionInputSchema, toLearnerQuestion, type SnapshotQuestion } from "@/lib/questions";

const q = (over: Partial<SnapshotQuestion> & Pick<SnapshotQuestion, "type" | "key">): SnapshotQuestion => ({
  id: over.id ?? "q",
  prompt: "Prompt",
  points: 2,
  options: {},
  explanation: null,
  ...over,
});

const abc = {
  choices: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ],
};

describe("scoring each question type", () => {
  it("multiple choice", () => {
    const mcq = q({ type: "MCQ", options: abc, key: { correct: "b" } });
    expect(scoreQuestion(mcq, "b").points).toBe(2);
    expect(scoreQuestion(mcq, "a").points).toBe(0);
    expect(scoreQuestion(mcq, undefined).points).toBe(0);
  });

  it("true/false", () => {
    const tf = q({ type: "TRUE_FALSE", key: { correct: false } });
    expect(scoreQuestion(tf, false).points).toBe(2);
    expect(scoreQuestion(tf, true).points).toBe(0);
  });

  it("multi-select gives partial credit and penalises wrong picks", () => {
    const ms = q({ type: "MULTI_SELECT", options: abc, key: { correct: ["a", "b"] }, points: 4 });
    expect(scoreQuestion(ms, ["a", "b"]).points).toBe(4);
    expect(scoreQuestion(ms, ["a"]).points).toBe(2);
    expect(scoreQuestion(ms, ["a", "c"]).points).toBe(0);
    expect(scoreQuestion(ms, ["a", "b", "c"]).points).toBe(2);
    expect(scoreQuestion(ms, ["c"]).points).toBe(0); // never negative
  });

  it("matching gives credit per correct pair", () => {
    const m = q({
      type: "MATCHING",
      points: 3,
      options: {
        left: [
          { id: "l1", text: "" },
          { id: "l2", text: "" },
          { id: "l3", text: "" },
        ],
        right: abc.choices,
      },
      key: { pairs: { l1: "a", l2: "b", l3: "c" } },
    });
    expect(scoreQuestion(m, { l1: "a", l2: "b", l3: "c" }).points).toBe(3);
    expect(scoreQuestion(m, { l1: "a", l2: "c", l3: "b" }).points).toBe(1);
  });

  it("short answer accepts variants ignoring case and spacing, and flags the rest for a trainer", () => {
    const sa = q({ type: "SHORT_ANSWER", key: { accepted: ["Section 18", "s18"] } });
    expect(scoreQuestion(sa, "  section   18 ")).toEqual({ points: 2, max: 2, needsMarking: false });
    expect(scoreQuestion(sa, "the 18th section")).toEqual({ points: 0, max: 2, needsMarking: true });
    expect(scoreQuestion(sa, "   ")).toEqual({ points: 0, max: 2, needsMarking: false });
  });
});

describe("attempts", () => {
  const qs = [
    q({ id: "1", type: "MCQ", options: abc, key: { correct: "a" }, points: 1 }),
    q({ id: "2", type: "TRUE_FALSE", key: { correct: true }, points: 1 }),
    q({ id: "3", type: "SHORT_ANSWER", key: { accepted: ["PPE"] }, points: 2 }),
  ];

  it("totals points and lists questions that need a trainer", () => {
    const r = scoreAttempt(qs, { "1": "a", "2": false, "3": "personal protective equipment" });
    expect(r).toMatchObject({ total: 1, max: 4, scorePct: 25, needsMarking: ["3"] });
  });

  it("rescoring clamps trainer-awarded points to each question's maximum", () => {
    expect(rescore(qs, { "1": 1, "2": 0, "3": 5 })).toEqual({
      awarded: { "1": 1, "2": 0, "3": 2 },
      scorePct: 75,
    });
    expect(rescore(qs, { "1": -3 }).awarded["1"]).toBe(0);
  });
});

describe("drawing questions", () => {
  const bank = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      q({ id: `${prefix}${i}`, type: "MCQ", options: abc, key: { correct: "a" } }),
    );

  it("draws the requested number from each section without repeats", () => {
    const picked = drawQuestions(
      [
        { questions: bank("a", 10), drawCount: 3 },
        { questions: bank("b", 4), drawCount: null },
      ],
      { shuffle: true },
    );
    expect(picked).toHaveLength(7);
    expect(new Set(picked.map((p) => p.id)).size).toBe(7);
    expect(picked.filter((p) => p.id.startsWith("a"))).toHaveLength(3);
  });

  it("keeps bank order when not shuffling", () => {
    const picked = drawQuestions([{ questions: bank("a", 3), drawCount: null }], { shuffle: false });
    expect(picked.map((p) => p.id)).toEqual(["a0", "a1", "a2"]);
    expect(picked[0]!.options.choices!.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("always shuffles matching answers, even when the quiz isn't shuffled", () => {
    const right = ["r1", "r2", "r3", "r4"].map((id) => ({ id, text: id }));
    const matching = q({
      id: "m",
      type: "MATCHING",
      options: { left: right.map((r, i) => ({ id: `l${i}`, text: `l${i}` })), right },
      key: { pairs: {} },
    });
    // A rand that always picks index 0 turns Fisher–Yates into a rotation, never the identity.
    const [drawn] = drawQuestions([{ questions: [matching], drawCount: null }], { shuffle: false }, () => 0);
    expect(drawn!.options.right!.map((r) => r.id)).not.toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("doesn't draw the same question twice when two sections share a bank", () => {
    const shared = bank("s", 5);
    const picked = drawQuestions(
      [
        { questions: shared, drawCount: 3 },
        { questions: shared, drawCount: 3 },
      ],
      { shuffle: true },
    );
    expect(new Set(picked.map((p) => p.id)).size).toBe(picked.length);
    expect(picked).toHaveLength(5);
  });

  it("shuffles with a uniform Fisher–Yates", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const k = shuffle([1, 2, 3]).join("");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(c).toBeGreaterThan(800);
  });
});

describe("learner-safe questions", () => {
  it("strips the answer key and explanation", () => {
    const safe = toLearnerQuestion(
      q({ type: "MCQ", options: abc, key: { correct: "a" }, explanation: "Because" }),
    );
    expect(JSON.stringify(safe)).not.toContain("correct");
    expect(JSON.stringify(safe)).not.toContain("Because");
  });
});

describe("question validation", () => {
  it("rejects a key pointing at a missing option", () => {
    const parsed = questionInputSchema.parse({ type: "MCQ", options: abc, answerKey: { correct: "z" } });
    expect(keyProblems(parsed)).toMatch(/correct option/);
  });
  it("requires every matching item to have a pair", () => {
    const parsed = questionInputSchema.parse({
      type: "MATCHING",
      options: {
        left: [
          { id: "l1", text: "x" },
          { id: "l2", text: "y" },
        ],
        right: abc.choices,
      },
      answerKey: { pairs: { l1: "a" } },
    });
    expect(keyProblems(parsed)).toMatch(/every item/);
  });
});

describe("rubrics", () => {
  const rubric = {
    criteria: [
      {
        id: "c1",
        levels: [
          { id: "c1a", points: 0 },
          { id: "c1b", points: 5 },
          { id: "c1c", points: 10 },
        ],
      },
      {
        id: "c2",
        levels: [
          { id: "c2a", points: 2 },
          { id: "c2b", points: 4 },
        ],
      },
    ],
  };
  it("totals the highest level per criterion", () => expect(rubricMax(rubric)).toBe(14));
  it("scores only when every criterion has a level", () => {
    expect(rubricScore(rubric, { c1: "c1b", c2: "c2b" })).toBe(9);
    expect(rubricScore(rubric, { c1: "c1b" })).toBeNull();
  });
});
