"use client";

import { useActionState } from "react";
import { updateAccreditationAction, updateSiteSettingsAction } from "@/server/actions/public";
import { initialFormState } from "@/lib/form-state";
import { Checkbox, Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function SiteSettingsForm({
  current,
}: {
  current: { academyName: string; contactEmail: string; contactPhone: string };
}) {
  const [state, action] = useActionState(updateSiteSettingsAction, initialFormState);
  const v = (k: keyof typeof current) => state.values?.[k] ?? current[k];
  return (
    <form action={action} className="space-y-5">
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field
        label="Platform name"
        name="academyName"
        error={state.fieldErrors?.academyName}
        hint="Shown on the public site and on certificates."
      >
        {(p) => <Input {...p} required maxLength={60} defaultValue={v("academyName")} />}
      </Field>
      <Field
        label="Public contact email"
        name="contactEmail"
        optional
        error={state.fieldErrors?.contactEmail}
      >
        {(p) => <Input {...p} type="email" maxLength={200} defaultValue={v("contactEmail")} />}
      </Field>
      <Field
        label="Public contact phone"
        name="contactPhone"
        optional
        error={state.fieldErrors?.contactPhone}
      >
        {(p) => <Input {...p} type="tel" maxLength={30} defaultValue={v("contactPhone")} />}
      </Field>
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

export function AccreditationForm({
  current,
}: {
  current: { enabled: boolean; body: string; providerNumber: string };
}) {
  const [state, action] = useActionState(updateAccreditationAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      {state.ok && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field
        label="Accrediting body"
        name="body"
        optional
        hint="For example QCTO or a SETA."
        error={state.fieldErrors?.body}
      >
        {(p) => <Input {...p} maxLength={120} defaultValue={state.values?.body ?? current.body} />}
      </Field>
      <Field label="Provider number" name="providerNumber" optional error={state.fieldErrors?.providerNumber}>
        {(p) => (
          <Input
            {...p}
            maxLength={60}
            className="font-mono"
            defaultValue={state.values?.providerNumber ?? current.providerNumber}
          />
        )}
      </Field>
      <div className="space-y-1">
        <Checkbox
          name="enabled"
          defaultChecked={current.enabled}
          label="Print accreditation on certificates"
        />
        <Checkbox
          name="confirm"
          label="I confirm YARI GROUP holds this accreditation, and that the provider number above is current."
        />
      </div>
      <SubmitButton pendingLabel="Saving…">Save accreditation</SubmitButton>
    </form>
  );
}
