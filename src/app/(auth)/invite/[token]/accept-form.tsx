"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { acceptInviteAction } from "@/server/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Checkbox, Field, Input, Select } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { NewPasswordFields } from "@/ui/password-fields";

export function AcceptInviteForm({
  token,
  defaultName,
  requireId,
  countries,
}: {
  token: string;
  defaultName: string;
  requireId: boolean;
  countries: { code: string; name: string }[];
}) {
  const [state, action] = useActionState(acceptInviteAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [idType, setIdType] = useState(v.idType ?? "SA_ID");

  return (
    <form action={action} className="mt-8 space-y-6" noValidate>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <input type="hidden" name="token" value={token} />

      <fieldset className="space-y-5">
        <legend className="eyebrow mb-4">About you</legend>
        <Field
          label="Full name"
          name="fullName"
          hint="As it should appear on certificates."
          error={e.fullName}
        >
          {(p) => <Input {...p} autoComplete="name" required defaultValue={v.fullName ?? defaultName} />}
        </Field>
        <Field label="Mobile number" name="phone" optional error={e.phone}>
          {(p) => <Input {...p} type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.phone} />}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="eyebrow mb-4">Identity document</legend>
        <div role="radiogroup" aria-label="Citizenship" className="grid grid-cols-2 gap-2">
          {[
            { value: "SA_ID", label: "South African" },
            { value: "PASSPORT", label: "Foreign national" },
          ].map((o) => (
            <label
              key={o.value}
              className="border-line-strong has-[:checked]:border-fg has-[:checked]:bg-inverse has-[:checked]:text-on-inverse flex min-h-11 cursor-pointer items-center justify-center rounded-sm border px-3 text-sm"
            >
              <input
                type="radio"
                name="idType"
                value={o.value}
                checked={idType === o.value}
                onChange={() => setIdType(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
        <Field
          label={idType === "SA_ID" ? "SA ID number" : "Passport number"}
          name="idNumber"
          optional={!requireId}
          hint="Stored encrypted. Only YARI administrators can see the full number."
          error={e.idNumber}
        >
          {(p) => (
            <Input
              {...p}
              inputMode={idType === "SA_ID" ? "numeric" : "text"}
              autoComplete="off"
              maxLength={idType === "SA_ID" ? 13 : 20}
              defaultValue={v.idNumber}
              className="font-mono tracking-wider"
            />
          )}
        </Field>
        {idType === "PASSPORT" && (
          <Field label="Issuing country" name="passportCountry" error={e.passportCountry}>
            {(p) => (
              <Select {...p} defaultValue={v.passportCountry ?? ""}>
                <option value="" disabled>
                  Choose a country
                </option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="eyebrow mb-4">Password</legend>
        <NewPasswordFields errors={e} />
      </fieldset>

      <fieldset className="border-line space-y-2 border-t pt-6">
        <legend className="sr-only">Consent</legend>
        <Checkbox
          name="acceptPrivacy"
          defaultChecked={v.acceptPrivacy === "on"}
          label={
            <>
              I have read the{" "}
              <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                privacy notice
              </Link>{" "}
              and agree that YARI GROUP may process my personal information to provide training.
            </>
          }
        />
        {e.acceptPrivacy && <p className="text-danger text-sm">{e.acceptPrivacy}</p>}
        <Checkbox
          name="acceptTerms"
          defaultChecked={v.acceptTerms === "on"}
          label={
            <>
              I accept the{" "}
              <Link href="/terms" target="_blank" className="underline underline-offset-4">
                terms of use
              </Link>
              .
            </>
          }
        />
        {e.acceptTerms && <p className="text-danger text-sm">{e.acceptTerms}</p>}
        <Checkbox
          name="marketing"
          defaultChecked={v.marketing === "on"}
          label="Email me about new courses and events (optional — you can change this any time)."
        />
      </fieldset>

      <SubmitButton size="lg" className="w-full" pendingLabel="Setting up…">
        Create my account
      </SubmitButton>
    </form>
  );
}
