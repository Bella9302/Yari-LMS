"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmTotpEnrolmentAction, type EnrolState } from "@/server/auth/actions";
import { Field, Input } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { RecoveryCodes } from "@/ui/recovery-codes";
import { buttonClasses } from "@/ui/button";

export function EnrolForm() {
  const [state, action] = useActionState<EnrolState, FormData>(confirmTotpEnrolmentAction, {});

  if (state.recoveryCodes) {
    return (
      <div className="mt-4 space-y-4">
        <Notice tone="success" title="Two-step verification is on." />
        <p>
          Save these recovery codes somewhere safe. Each one works once if you lose your phone.{" "}
          <strong>You won&apos;t see them again.</strong>
        </p>
        <RecoveryCodes codes={state.recoveryCodes} />
        <Link href="/dashboard" className={buttonClasses("primary", "lg", "w-full")}>
          I&apos;ve saved them — continue
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-4">
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Verification code" name="code">
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            className="font-mono text-2xl tracking-[0.4em]"
          />
        )}
      </Field>
      <SubmitButton size="lg" className="w-full" pendingLabel="Checking…">
        Turn on two-step verification
      </SubmitButton>
    </form>
  );
}
