"use client";

import { useActionState } from "react";
import { setCourseAccreditationAction } from "@/server/actions/public";
import { initialFormState } from "@/lib/form-state";
import { Field, Input, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function CourseAccreditationForm({
  courseId,
  current,
}: {
  courseId: string;
  current: { unitStandards: string; nqfLevel: string; credits: string };
}) {
  const [state, action] = useActionState(setCourseAccreditationAction, initialFormState);
  const v = (k: keyof typeof current) => state.values?.[k] ?? current[k];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field
        label="Unit standards"
        name="unitStandards"
        hint="One per line: ID — title. Leave empty if this course isn't accredited."
      >
        {(p) => <Textarea {...p} rows={4} className="font-mono text-sm" defaultValue={v("unitStandards")} />}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="NQF level" name="nqfLevel" optional>
          {(p) => <Input {...p} type="number" min={1} max={10} defaultValue={v("nqfLevel")} />}
        </Field>
        <Field label="Credits" name="credits" optional>
          {(p) => <Input {...p} type="number" min={1} max={999} defaultValue={v("credits")} />}
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">Save accreditation details</SubmitButton>
    </form>
  );
}
