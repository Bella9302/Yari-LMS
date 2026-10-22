"use client";

import { useActionState } from "react";
import { logoutAction, verifyTwoFactorAction } from "@/server/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { Button } from "@/ui/button";

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action] = useActionState(verifyTwoFactorAction, initialFormState);
  return (
    <>
      <form action={action} className="mt-8 space-y-5">
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Verification code" name="code">
          {(p) => (
            <Input
              {...p}
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={11}
              className="font-mono text-2xl tracking-[0.4em]"
            />
          )}
        </Field>
        <SubmitButton size="lg" className="w-full" pendingLabel="Checking…">
          Verify
        </SubmitButton>
      </form>
      <form action={logoutAction} className="mt-4">
        <Button type="submit" variant="ghost" className="w-full">
          Cancel and sign out
        </Button>
      </form>
    </>
  );
}
