"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/server/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { NewPasswordFields } from "@/ui/password-fields";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="mt-8 space-y-5">
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields errors={state.fieldErrors} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}
