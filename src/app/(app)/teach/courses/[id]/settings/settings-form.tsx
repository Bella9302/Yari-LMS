"use client";

import { useActionState } from "react";
import type { CourseCategory, CourseVisibility } from "@/generated/prisma/enums";
import { deleteCourseAction, updateCourseSettingsAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function SettingsForm({
  course,
}: {
  course: {
    id: string;
    title: string;
    summary: string;
    category: CourseCategory;
    visibility: CourseVisibility;
    estMinutes: number | null;
  };
}) {
  const [state, action] = useActionState(updateCourseSettingsAction, initialFormState);
  const v = state.values;
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="courseId" value={course.id} />
      <Field label="Title" name="title" error={e.title}>
        {(p) => <Input {...p} required maxLength={120} defaultValue={v?.title ?? course.title} />}
      </Field>
      <Field
        label="Summary"
        name="summary"
        hint="One or two sentences shown on course cards."
        error={e.summary}
      >
        {(p) => <Textarea {...p} maxLength={600} defaultValue={v?.summary ?? course.summary} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" name="category">
          {(p) => (
            <Select {...p} defaultValue={v?.category ?? course.category}>
              <option value="HEALTH_SAFETY">Health &amp; Safety</option>
              <option value="AI_DIGITAL">AI &amp; Digital</option>
            </Select>
          )}
        </Field>
        <Field label="Estimated length (minutes)" name="estMinutes" optional error={e.estMinutes}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              maxLength={5}
              defaultValue={v?.estMinutes ?? course.estMinutes ?? ""}
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <Field
        label="Who can be enrolled"
        name="visibility"
        hint="Catalogue courses can be chosen by Client Managers for their staff (and will appear on the public site)."
      >
        {(p) => (
          <Select {...p} defaultValue={v?.visibility ?? course.visibility}>
            <option value="PRIVATE">Private — enrolled by YARI administrators</option>
            <option value="PUBLIC">Catalogue — companies can enrol their staff</option>
          </Select>
        )}
      </Field>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export function DeleteCourseForm({ courseId }: { courseId: string }) {
  const [state, action] = useActionState(deleteCourseAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this draft course and everything in it? This can't be undone."))
          e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <p className="text-muted text-sm">Drafts with no learners can be deleted.</p>
      <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
        Delete course
      </SubmitButton>
      {state.error && <p className="text-danger text-sm">{state.error}</p>}
    </form>
  );
}
