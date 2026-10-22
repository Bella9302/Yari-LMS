"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { submitEnquiryAction } from "@/server/actions/public";
import { initialFormState } from "@/lib/form-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { cn } from "@/ui/cn";

const INTERESTS = [
  {
    value: "SHE",
    label: "Health & Safety",
    hint: "Safety files, audits, SHE rep training…",
    category: "health-safety",
  },
  {
    value: "TECH",
    label: "AI & Digital",
    hint: "AI adoption, digital migration, IT training…",
    category: "ai-digital",
  },
  { value: "BOTH", label: "Both", hint: "A mix for your team", category: undefined },
] as const;

export function EnquiryForm({
  courses,
  defaultCourseId,
  defaultInterest,
}: {
  courses: { id: string; title: string; category: "HEALTH_SAFETY" | "AI_DIGITAL" }[];
  defaultCourseId?: string;
  defaultInterest?: "SHE" | "TECH" | "BOTH";
}) {
  const [state, action] = useActionState(submitEnquiryAction, initialFormState);
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div role="status" className="border-fg border-l-2 py-2 pl-5">
        <p className="font-display text-h3 flex items-center gap-2">
          <CheckCircle2 aria-hidden className="text-success size-6" /> Thank you
        </p>
        <p className="text-muted mt-2">
          We&apos;ve received your enquiry and will be in touch within two working days.
        </p>
      </div>
    );
  }

  const interest = v.interest ?? defaultInterest ?? "";
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" name="name" error={err.name}>
          {(p) => <Input {...p} required autoComplete="name" maxLength={120} defaultValue={v.name} />}
        </Field>
        <Field label="Company" name="company" optional error={err.company}>
          {(p) => <Input {...p} autoComplete="organization" maxLength={160} defaultValue={v.company} />}
        </Field>
        <Field label="Email" name="email" error={err.email}>
          {(p) => (
            <Input {...p} type="email" required autoComplete="email" maxLength={200} defaultValue={v.email} />
          )}
        </Field>
        <Field label="Phone" name="phone" optional error={err.phone}>
          {(p) => <Input {...p} type="tel" autoComplete="tel" maxLength={30} defaultValue={v.phone} />}
        </Field>
      </div>

      <fieldset aria-describedby={err.interest ? "interest-error" : undefined}>
        <legend className="text-sm font-medium">What are you interested in?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {INTERESTS.map((i) => (
            <label
              key={i.value}
              data-category={i.category}
              className={cn(
                "border-line-strong bg-surface relative flex min-h-16 cursor-pointer flex-col justify-center border px-4 py-3 transition-colors",
                "has-[:checked]:border-fg has-[:focus-visible]:outline-fg has-[:checked]:shadow-[inset_0_-3px_0_var(--color-accent)] has-[:focus-visible]:outline-2",
              )}
            >
              <input
                type="radio"
                name="interest"
                value={i.value}
                defaultChecked={interest === i.value}
                className="sr-only"
              />
              <span className="font-medium">{i.label}</span>
              <span className="text-muted text-sm">{i.hint}</span>
            </label>
          ))}
        </div>
        {err.interest && (
          <p id="interest-error" className="text-danger mt-1.5 text-sm" role="alert">
            {err.interest}
          </p>
        )}
      </fieldset>

      {courses.length > 0 && (
        <Field label="A particular course?" name="courseId" optional>
          {(p) => (
            <Select {...p} defaultValue={v.courseId ?? defaultCourseId ?? ""}>
              <option value="">Not sure yet</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field
        label="How can we help?"
        name="message"
        error={err.message}
        hint="For example: how many people, where, and by when."
      >
        {(p) => (
          <Textarea {...p} required minLength={10} maxLength={4000} rows={5} defaultValue={v.message} />
        )}
      </Field>

      {/* Honeypot for bots: hidden from people and screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <Checkbox
          name="consent"
          defaultChecked={v.consent === "on"}
          aria-describedby={err.consent ? "consent-error" : undefined}
          label={
            <>
              I agree that YARI GROUP may use these details to reply to my enquiry, as described in the{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                privacy notice
              </Link>
              . They are deleted after 12 months.
            </>
          }
        />
        {err.consent && (
          <p id="consent-error" className="text-danger mt-1 text-sm" role="alert">
            {err.consent}
          </p>
        )}
      </div>

      <SubmitButton size="lg" pendingLabel="Sending…">
        Send enquiry
      </SubmitButton>
    </form>
  );
}
