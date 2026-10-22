"use client";

import { useActionState, useState } from "react";
import { eraseAccountAction } from "@/server/actions/admin";
import { initialFormState } from "@/lib/form-state";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function EraseForm({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(eraseAccountAction, initialFormState);
  if (!open) {
    return (
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Erase account…
      </Button>
    );
  }
  return (
    <form action={action} className="border-danger w-full space-y-3 border-l-2 pl-4 md:max-w-sm">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        This permanently removes {name}&apos;s personal details, written work, uploaded files, feedback and
        discussion posts, and withdraws their certificates. Scores and completion numbers stay, without their
        name. It can&apos;t be undone.
      </p>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Type ERASE to confirm" name="confirm" id={`confirm-${id}`}>
        {(p) => <Input {...p} required autoComplete="off" />}
      </Field>
      <div className="flex gap-2">
        <SubmitButton variant="danger" size="sm" pendingLabel="Erasing…">
          Erase permanently
        </SubmitButton>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
