"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import type { QuestionType } from "@/generated/prisma/enums";
import { saveQuestionAction } from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { QUESTION_TYPE_LABELS } from "@/lib/questions";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

interface Choice {
  id: string;
  text: string;
}

export interface EditableQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  explanation: string | null;
  options: { choices?: Choice[]; left?: Choice[]; right?: Choice[] };
  answerKey: { correct?: string | string[] | boolean; accepted?: string[]; pairs?: Record<string, string> };
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** Creates or edits one question. Structured parts are posted as JSON in a hidden "data" field. */
export function QuestionEditor({
  courseId,
  bankId,
  question,
  onDone,
}: {
  courseId: string;
  bankId: string;
  question?: EditableQuestion;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(async (prev: typeof initialFormState, fd: FormData) => {
    const res = await saveQuestionAction(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, initialFormState);
  const [type, setType] = useState<QuestionType>(question?.type ?? "MCQ");
  const [choices, setChoices] = useState<Choice[]>(
    question?.options.choices ?? [
      { id: newId(), text: "" },
      { id: newId(), text: "" },
    ],
  );
  const [correct, setCorrect] = useState<string[]>(() => {
    const c = question?.answerKey.correct;
    return Array.isArray(c) ? c : typeof c === "string" ? [c] : [];
  });
  const [tf, setTf] = useState<boolean>(question?.answerKey.correct === false ? false : true);
  const [accepted, setAccepted] = useState((question?.answerKey.accepted ?? []).join("\n"));
  const [pairs, setPairs] = useState<{ left: Choice; right: Choice }[]>(() => {
    if (question?.type === "MATCHING" && question.options.left && question.options.right) {
      return question.options.left.map((l) => ({
        left: l,
        right: question.options.right!.find((r) => r.id === question.answerKey.pairs?.[l.id]) ?? {
          id: newId(),
          text: "",
        },
      }));
    }
    return [
      { left: { id: newId(), text: "" }, right: { id: newId(), text: "" } },
      { left: { id: newId(), text: "" }, right: { id: newId(), text: "" } },
    ];
  });

  const data = (() => {
    switch (type) {
      case "MCQ":
        return { type, options: { choices }, answerKey: { correct: correct[0] ?? "" } };
      case "MULTI_SELECT":
        return { type, options: { choices }, answerKey: { correct } };
      case "TRUE_FALSE":
        return { type, options: {}, answerKey: { correct: tf } };
      case "SHORT_ANSWER":
        return {
          type,
          options: {},
          answerKey: {
            accepted: accepted
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        };
      case "MATCHING":
        return {
          type,
          options: { left: pairs.map((p) => p.left), right: pairs.map((p) => p.right) },
          answerKey: { pairs: Object.fromEntries(pairs.map((p) => [p.left.id, p.right.id])) },
        };
    }
  })();

  const uid = question?.id ?? "new";
  return (
    <form action={action} className="space-y-5" key={state.ok && !question ? state.message : uid}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="bankId" value={bankId} />
      {question && <input type="hidden" name="questionId" value={question.id} />}
      <input type="hidden" name="data" value={JSON.stringify(data)} />

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field label="Question type" name="type" id={`qt-${uid}`}>
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
              {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Points" name="points" id={`qp-${uid}`}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={100}
              defaultValue={question?.points ?? 1}
              required
              className="font-mono"
            />
          )}
        </Field>
      </div>

      <Field label="Question" name="prompt" id={`qq-${uid}`}>
        {(p) => (
          <Textarea {...p} required maxLength={2000} defaultValue={question?.prompt} className="min-h-20" />
        )}
      </Field>

      {(type === "MCQ" || type === "MULTI_SELECT") && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            Options — mark {type === "MCQ" ? "the correct one" : "every correct one"}
          </legend>
          {choices.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                type={type === "MCQ" ? "radio" : "checkbox"}
                name={`correct-${uid}`}
                checked={correct.includes(c.id)}
                onChange={(e) =>
                  setCorrect(
                    type === "MCQ"
                      ? [c.id]
                      : e.target.checked
                        ? [...correct, c.id]
                        : correct.filter((x) => x !== c.id),
                  )
                }
                aria-label={`Option ${i + 1} is correct`}
                className="size-5 shrink-0 accent-current"
              />
              <Input
                aria-label={`Option ${i + 1}`}
                value={c.text}
                maxLength={500}
                onChange={(e) =>
                  setChoices(choices.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))
                }
              />
              <button
                type="button"
                onClick={() => {
                  setChoices(choices.filter((x) => x.id !== c.id));
                  setCorrect(correct.filter((x) => x !== c.id));
                }}
                disabled={choices.length <= 2}
                aria-label={`Remove option ${i + 1}`}
                className="hover:bg-sunk inline-grid size-11 shrink-0 place-items-center rounded-sm disabled:opacity-30"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {choices.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChoices([...choices, { id: newId(), text: "" }])}
            >
              <Plus className="size-4" aria-hidden /> Add option
            </Button>
          )}
        </fieldset>
      )}

      {type === "TRUE_FALSE" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Correct answer</legend>
          <div className="flex gap-6">
            {[true, false].map((v) => (
              <label key={String(v)} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`tf-${uid}`}
                  checked={tf === v}
                  onChange={() => setTf(v)}
                  className="size-5 accent-current"
                />
                {v ? "True" : "False"}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {type === "SHORT_ANSWER" && (
        <Field
          label="Accepted answers"
          name="accepted-ui"
          id={`qa-${uid}`}
          hint="One per line. Capitals and extra spaces are ignored. Other answers are sent to you to mark."
        >
          {(p) => (
            <Textarea
              {...p}
              value={accepted}
              onChange={(e) => setAccepted(e.target.value)}
              className="min-h-24 font-mono text-sm"
            />
          )}
        </Field>
      )}

      {type === "MATCHING" && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            Pairs — learners match each left item to its right item
          </legend>
          {pairs.map((p, i) => (
            <div key={p.left.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                aria-label={`Item ${i + 1}`}
                value={p.left.text}
                onChange={(e) =>
                  setPairs(
                    pairs.map((x, j) => (j === i ? { ...x, left: { ...x.left, text: e.target.value } } : x)),
                  )
                }
              />
              <Input
                aria-label={`Match for item ${i + 1}`}
                value={p.right.text}
                onChange={(e) =>
                  setPairs(
                    pairs.map((x, j) =>
                      j === i ? { ...x, right: { ...x.right, text: e.target.value } } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
                disabled={pairs.length <= 2}
                aria-label={`Remove pair ${i + 1}`}
                className="hover:bg-sunk inline-grid size-11 place-items-center rounded-sm disabled:opacity-30"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {pairs.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setPairs([...pairs, { left: { id: newId(), text: "" }, right: { id: newId(), text: "" } }])
              }
            >
              <Plus className="size-4" aria-hidden /> Add pair
            </Button>
          )}
        </fieldset>
      )}

      <Field
        label="Explanation"
        name="explanation"
        id={`qe-${uid}`}
        optional
        hint="Shown with the correct answer, if the quiz shows answers."
      >
        {(p) => (
          <Textarea {...p} maxLength={2000} defaultValue={question?.explanation ?? ""} className="min-h-16" />
        )}
      </Field>

      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton pendingLabel="Saving…">{question ? "Save question" : "Add question"}</SubmitButton>
    </form>
  );
}
