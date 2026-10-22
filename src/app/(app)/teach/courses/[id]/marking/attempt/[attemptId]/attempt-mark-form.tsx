"use client";

import { useActionState } from "react";
import { markAttemptAction } from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { Input } from "@/ui/field";
import { Notice, Tag } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function AttemptMarkForm({
  courseId,
  attemptId,
  questions,
}: {
  courseId: string;
  attemptId: string;
  questions: { id: string; max: number; awarded: number; needsMarking: boolean; content: React.ReactNode }[];
}) {
  const [state, action] = useActionState(markAttemptAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="attemptId" value={attemptId} />
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id} className={`border p-4 ${q.needsMarking ? "border-fg bg-surface" : "border-line"}`}>
            <div className="flex items-start gap-3">
              <span className="text-muted font-mono text-sm">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                {q.needsMarking && <Tag tone="accent">Check this answer</Tag>}
                {q.content}
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <Input
                  name={`points:${q.id}`}
                  type="number"
                  min={0}
                  max={q.max}
                  step="0.5"
                  defaultValue={q.awarded}
                  aria-label={`Points for question ${i + 1}`}
                  className="w-20 font-mono"
                />
                <span className="text-muted font-mono">/ {q.max}</span>
              </label>
            </div>
          </li>
        ))}
      </ol>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton pendingLabel="Saving…">Finish marking</SubmitButton>
    </form>
  );
}
