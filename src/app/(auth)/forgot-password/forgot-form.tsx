"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/server/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialFormState);
  if (state.ok)
    return (
      <Notice tone="success" className="mt-8">
        {state.message}
      </Notice>
    );
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Email" name="email">
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
          />
        )}
      </Field>
      <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
