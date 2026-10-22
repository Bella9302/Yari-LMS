"use client";

import { useActionState } from "react";
import { startAttemptAction } from "@/server/actions/assessment";
import { initialFormState } from "@/lib/form-state";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function StartAttemptButton({
  slug,
  itemId,
  label,
  timed,
}: {
  slug: string;
  itemId: string;
  label: string;
  timed: number | null;
}) {
  const [state, action] = useActionState(startAttemptAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (timed && !confirm(`You'll have ${timed} minutes once you start. Ready?`)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="itemId" value={itemId} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton size="lg" pendingLabel="Starting…">
        {label}
      </SubmitButton>
    </form>
  );
}
