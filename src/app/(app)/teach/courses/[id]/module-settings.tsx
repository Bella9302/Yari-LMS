"use client";

import { useActionState } from "react";
import { deleteModuleAction, updateModuleAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { Field, Input, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function ModuleSettingsForm({
  courseId,
  moduleId,
  title,
  description,
}: {
  courseId: string;
  moduleId: string;
  title: string;
  description: string;
}) {
  const [state, action] = useActionState(updateModuleAction, initialFormState);
  const [delState, deleteAction] = useActionState(deleteModuleAction, initialFormState);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="moduleId" value={moduleId} />
        <Field label="Module title" name="title" id={`mt-${moduleId}`}>
          {(p) => <Input {...p} defaultValue={title} maxLength={120} required />}
        </Field>
        <Field label="Short description" name="description" id={`md-${moduleId}`} optional>
          {(p) => <Textarea {...p} defaultValue={description} maxLength={600} className="min-h-20" />}
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
          Save module
        </SubmitButton>
      </form>
      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm("Delete this module and all its items? Learners' progress on them will be lost."))
            e.preventDefault();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="moduleId" value={moduleId} />
        <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
          Delete module and its items
        </SubmitButton>
        {delState.error && <span className="text-danger text-sm">{delState.error}</span>}
      </form>
    </div>
  );
}
