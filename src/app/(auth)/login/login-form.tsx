"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email">
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            defaultValue={state.values?.email}
          />
        )}
      </Field>
      <Field label="Password" name="password">
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
