"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "@/server/actions/admin";
import { initialFormState } from "@/lib/form-state";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganizationAction, initialFormState);
  return (
    <form action={action} className="space-y-5" key={state.ok ? state.message : "form"}>
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company name" name="name" error={state.fieldErrors?.name}>
          {(p) => <Input {...p} required defaultValue={state.values?.name} />}
        </Field>
        <Field label="Registration number" name="regNumber" optional>
          {(p) => <Input {...p} className="font-mono" defaultValue={state.values?.regNumber} />}
        </Field>
      </div>
      <SubmitButton pendingLabel="Adding…">Add company</SubmitButton>
    </form>
  );
}
