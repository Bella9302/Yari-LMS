"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { checkInAction } from "@/server/actions/tracking";
import { initialFormState } from "@/lib/form-state";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function CheckInButton({ sessionId, token }: { sessionId: string; token: string }) {
  const [state, action] = useActionState(checkInAction, initialFormState);
  if (state.ok) {
    return (
      <p className="text-success flex items-center gap-3 text-xl" role="status">
        <CheckCircle2 className="size-7" aria-hidden /> {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="token" value={token} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton size="lg" className="w-full" pendingLabel="Checking in…">
        Check me in
      </SubmitButton>
    </form>
  );
}
