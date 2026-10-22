"use client";

import { useActionState } from "react";
import { addStaffAction, removeStaffAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { Field, Select } from "@/ui/field";
import { Notice, Tag } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function StaffForms({
  courseId,
  staff,
  trainers,
}: {
  courseId: string;
  staff: { userId: string; fullName: string; role: string }[];
  trainers: { id: string; fullName: string }[];
}) {
  const [addState, add] = useActionState(addStaffAction, initialFormState);
  const [removeState, remove] = useActionState(removeStaffAction, initialFormState);
  return (
    <div className="space-y-4">
      <ul className="divide-line border-line divide-y border-y">
        {staff.map((s) => (
          <li key={s.userId} className="flex items-center gap-3 py-2">
            <span className="flex-1">{s.fullName}</span>
            <Tag>{s.role === "LEAD" ? "Lead" : "Trainer"}</Tag>
            <form action={remove}>
              <input type="hidden" name="courseId" value={courseId} />
              <input type="hidden" name="userId" value={s.userId} />
              <SubmitButton variant="ghost" size="sm" aria-label={`Remove ${s.fullName}`}>
                Remove
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      {removeState.error && <Notice tone="danger">{removeState.error}</Notice>}
      {trainers.length > 0 && (
        <form action={add} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="courseId" value={courseId} />
          <Field label="Add a trainer" name="userId" className="min-w-56 flex-1">
            {(p) => (
              <Select {...p} required defaultValue="">
                <option value="" disabled>
                  Choose a trainer
                </option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add
          </SubmitButton>
        </form>
      )}
      {addState.error && <Notice tone="danger">{addState.error}</Notice>}
    </div>
  );
}
