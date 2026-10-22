"use client";

import { useActionState } from "react";
import { setCourseStatusAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import type { CourseStatus } from "@/generated/prisma/enums";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

const NEXT: Record<
  CourseStatus,
  { status: CourseStatus; label: string; variant: "primary" | "secondary" }[]
> = {
  DRAFT: [{ status: "PUBLISHED", label: "Publish course", variant: "primary" }],
  PUBLISHED: [
    { status: "DRAFT", label: "Unpublish", variant: "secondary" },
    { status: "ARCHIVED", label: "Archive", variant: "secondary" },
  ],
  ARCHIVED: [{ status: "PUBLISHED", label: "Restore", variant: "secondary" }],
};

export function StatusControl({ courseId, status }: { courseId: string; status: CourseStatus }) {
  const [state, action] = useActionState(setCourseStatusAction, initialFormState);
  return (
    <>
      {NEXT[status].map((n) => (
        <form key={n.status} action={action}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="status" value={n.status} />
          <SubmitButton variant={n.variant} pendingLabel="Saving…">
            {n.label}
          </SubmitButton>
        </form>
      ))}
      {state.error && (
        <Notice tone="danger" className="w-full">
          {state.error}
        </Notice>
      )}
    </>
  );
}
