"use client";

import { useActionState } from "react";
import { updateOwnProfileAction } from "@/server/actions/account";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function ProfileForm({ preferredName, phone }: { preferredName: string; phone: string }) {
  const [state, action] = useActionState(updateOwnProfileAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-5 space-y-5">
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <Field
        label="Preferred name"
        name="preferredName"
        optional
        hint="What we call you on screen."
        error={e.preferredName}
      >
        {(p) => <Input {...p} defaultValue={state.values?.preferredName ?? preferredName} />}
      </Field>
      <Field label="Mobile number" name="phone" optional error={e.phone}>
        {(p) => (
          <Input
            {...p}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={state.values?.phone ?? phone}
          />
        )}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
