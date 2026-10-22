"use client";

import { Fragment, useActionState } from "react";
import { Star } from "lucide-react";
import { submitRatingAction } from "@/server/actions/engagement";
import { initialFormState } from "@/lib/form-state";
import { Field, Textarea } from "@/ui/field";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

const CRITERIA = [
  { name: "knowledge", label: "Knowledge", hint: "Knew the subject well" },
  { name: "clarity", label: "Clarity", hint: "Explained things clearly" },
  { name: "relevance", label: "Practical relevance", hint: "Useful for my actual work" },
  { name: "engagement", label: "Engagement", hint: "Kept me involved" },
] as const;

/** 1–5 stars as real radio buttons: keyboard arrows work and screen readers announce "3 of 5". */
function StarInput({
  name,
  label,
  hint,
  idPrefix,
}: {
  name: string;
  label: string;
  hint: string;
  idPrefix: string;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">
        {label} <span className="text-muted font-normal">· {hint}</span>
      </legend>
      <div className="stars flex">
        {[1, 2, 3, 4, 5].map((n) => {
          const id = `${idPrefix}-${name}-${n}`;
          return (
            <Fragment key={n}>
              <input type="radio" id={id} name={name} value={n} required className="sr-only" />
              <label
                htmlFor={id}
                className="flex size-11 cursor-pointer items-center justify-center rounded-sm"
              >
                <Star aria-hidden className="size-7 fill-current" strokeWidth={1.25} />
                <span className="sr-only">{n} of 5</span>
              </label>
            </Fragment>
          );
        })}
      </div>
    </fieldset>
  );
}

export function RatingForm({
  trainerId,
  courseId,
  sessionId,
  idPrefix,
}: {
  trainerId: string;
  courseId: string;
  sessionId: string | null;
  idPrefix: string;
}) {
  const [state, action] = useActionState(submitRatingAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="trainerId" value={trainerId} />
      <input type="hidden" name="courseId" value={courseId} />
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {CRITERIA.map((c) => (
          <StarInput key={c.name} {...c} idPrefix={idPrefix} />
        ))}
      </div>
      <Field
        label="Comment"
        name="comment"
        id={`${idPrefix}-comment`}
        optional
        hint="Your trainer sees comments without your name."
      >
        {(p) => <Textarea {...p} maxLength={2000} rows={3} />}
      </Field>
      <SubmitButton pendingLabel="Sending…">Submit rating</SubmitButton>
    </form>
  );
}
