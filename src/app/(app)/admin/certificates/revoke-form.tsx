"use client";

import { useActionState, useState } from "react";
import { revokeCertificateAction } from "@/server/actions/public";
import { initialFormState } from "@/lib/form-state";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function RevokeForm({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(revokeCertificateAction, initialFormState);
  if (state.ok) return <Notice tone="success">{state.message}</Notice>;
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Revoke…
      </Button>
    );
  }
  return (
    <form action={action} className="w-full space-y-3">
      <input type="hidden" name="code" value={code} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Reason (kept in the audit log, not shown publicly)" name="reason" id={`reason-${code}`}>
        {(p) => <Input {...p} required minLength={3} maxLength={500} />}
      </Field>
      <div className="flex gap-2">
        <SubmitButton variant="danger" size="sm" pendingLabel="Revoking…">
          Revoke {code}
        </SubmitButton>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
