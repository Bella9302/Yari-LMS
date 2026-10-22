"use client";

import { useActionState } from "react";
import { overrideGradeAction } from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function OverrideForm({
  courseId,
  enrolmentId,
  itemId,
  current,
}: {
  courseId: string;
  enrolmentId: string;
  itemId: string;
  current: { scorePct: number; reason: string } | null;
}) {
  const [state, action] = useActionState(overrideGradeAction, initialFormState);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="enrolmentId" value={enrolmentId} />
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Score (%)" name="scorePct" id={`ov-score-${itemId}`}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={100}
              step="0.5"
              defaultValue={current?.scorePct}
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Reason (kept in the audit log)" name="reason" id={`ov-reason-${itemId}`}>
          {(p) => (
            <Input
              {...p}
              defaultValue={current?.reason}
              maxLength={300}
              placeholder="e.g. Assessed orally on site"
            />
          )}
        </Field>
      </div>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <div className="flex gap-2">
        <SubmitButton name="intent" value="set" variant="secondary" size="sm" pendingLabel="Saving…">
          Save override
        </SubmitButton>
        {current && (
          <SubmitButton name="intent" value="remove" variant="ghost" size="sm" pendingLabel="Removing…">
            Remove override
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
