"use client";

import { useActionState } from "react";
import { deleteRubricAction } from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { SubmitButton } from "@/ui/submit-button";

export function DeleteRubricForm({ courseId, rubricId }: { courseId: string; rubricId: string }) {
  const [state, action] = useActionState(deleteRubricAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this rubric?")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="rubricId" value={rubricId} />
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete
      </SubmitButton>
      {state.error && <span className="text-danger text-sm">{state.error}</span>}
    </form>
  );
}
