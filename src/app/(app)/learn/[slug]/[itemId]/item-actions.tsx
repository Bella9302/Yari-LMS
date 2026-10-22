"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { completeItemAction, recordViewAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { buttonClasses } from "@/ui/button";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

/** Records that the learner opened the item (client-side, so link prefetching never counts as a view). */
export function ViewTracker({ itemId }: { itemId: string }) {
  useEffect(() => {
    void recordViewAction(itemId);
  }, [itemId]);
  return null;
}

export function CompleteButton({
  slug,
  itemId,
  completed,
  nextHref,
}: {
  slug: string;
  itemId: string;
  completed: boolean;
  nextHref: string;
}) {
  const [state, action] = useActionState(completeItemAction, initialFormState);
  if (state.message === "course-complete") {
    return (
      <Notice tone="success" title="You've completed this course.">
        Well done.{" "}
        <Link href={`/learn/${slug}`} className="underline underline-offset-4">
          Back to the course
        </Link>
      </Notice>
    );
  }
  if (completed || state.ok) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-success flex items-center gap-2">
          <CheckCircle2 className="size-5" aria-hidden /> Completed
        </p>
        <Link href={nextHref} className={buttonClasses("primary")}>
          Continue
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="itemId" value={itemId} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Saving…">
        Mark as complete
      </SubmitButton>
    </form>
  );
}
