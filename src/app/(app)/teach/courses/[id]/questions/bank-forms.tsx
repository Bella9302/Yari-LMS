"use client";

import { useActionState } from "react";
import { createBankAction, deleteBankAction, renameBankAction } from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function CreateBankForm({ courseId }: { courseId: string }) {
  const [state, action] = useActionState(createBankAction, initialFormState);
  return (
    <form action={action} className="border-line bg-surface flex flex-wrap items-end gap-3 border p-5">
      <input type="hidden" name="courseId" value={courseId} />
      <Field label="New bank" name="title" className="min-w-56 flex-1">
        {(p) => <Input {...p} required maxLength={120} placeholder="e.g. Hazard identification" />}
      </Field>
      <SubmitButton pendingLabel="Creating…">Create bank</SubmitButton>
      {state.error && (
        <Notice tone="danger" className="w-full">
          {state.error}
        </Notice>
      )}
    </form>
  );
}

export function BankSettings({
  courseId,
  bankId,
  title,
}: {
  courseId: string;
  bankId: string;
  title: string;
}) {
  const [state, action] = useActionState(renameBankAction, initialFormState);
  const [delState, del] = useActionState(deleteBankAction, initialFormState);
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="bankId" value={bankId} />
        <Field label="Bank name" name="title" className="min-w-56 flex-1">
          {(p) => <Input {...p} required maxLength={120} defaultValue={title} />}
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Rename
        </SubmitButton>
      </form>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <form
        action={del}
        onSubmit={(e) => {
          if (!confirm("Delete this bank and all its questions?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="bankId" value={bankId} />
        <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
          Delete bank
        </SubmitButton>
        {delState.error && <p className="text-danger mt-2 text-sm">{delState.error}</p>}
      </form>
    </div>
  );
}
