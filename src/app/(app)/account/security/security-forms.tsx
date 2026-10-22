"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  disableTotpAction,
  regenerateRecoveryCodesAction,
  type EnrolState,
} from "@/server/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { NewPasswordFields } from "@/ui/password-fields";
import { RecoveryCodes } from "@/ui/recovery-codes";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-5 space-y-5" key={state.ok ? "done" : "form"}>
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Current password" name="currentPassword" error={e.currentPassword}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <NewPasswordFields errors={e} />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}

export function RegenerateCodesForm() {
  const [state, action] = useActionState<EnrolState, FormData>(regenerateRecoveryCodesAction, {});
  if (state.recoveryCodes) {
    return (
      <div className="space-y-4">
        <Notice tone="success" title="New recovery codes created.">
          Your old codes no longer work. Save these somewhere safe — you won&apos;t see them again.
        </Notice>
        <RecoveryCodes codes={state.recoveryCodes} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <p className="font-medium">New recovery codes</p>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Confirm with your password" name="currentPassword" id="regen-password">
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Creating…">
        Create new codes
      </SubmitButton>
    </form>
  );
}

export function DisableTwoFactorForm() {
  const [state, action] = useActionState(disableTotpAction, initialFormState);
  if (state.ok) return <Notice tone="neutral">{state.message}</Notice>;
  return (
    <form action={action} className="border-line space-y-4 border-t pt-6">
      <p className="font-medium">Turn off two-step verification</p>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Confirm with your password" name="currentPassword" id="disable-password">
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <SubmitButton variant="danger" pendingLabel="Turning off…">
        Turn off
      </SubmitButton>
    </form>
  );
}
