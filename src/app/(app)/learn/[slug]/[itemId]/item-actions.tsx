"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { completeItemAction, recordViewAction } from "@/server/actions/courses";
import { initialFormState } from "@/lib/form-state";
import { buttonClasses } from "@/ui/button";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

const IDLE_AFTER_MS = 90_000;
const SEND_EVERY_S = 30;

/**
 * Records that the learner opened the item (client-side, so link prefetching never counts as a
 * view), then counts active time: only while the tab is visible and the learner has interacted
 * recently or media is playing. Time is sent every 30 s and when the page is hidden.
 */
export function ViewTracker({ itemId }: { itemId: string }) {
  useEffect(() => {
    let pending = 0;
    let lastInput = Date.now();
    const viewed = recordViewAction(itemId).catch(() => {});

    const touch = () => (lastInput = Date.now());
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const mediaPlaying = () =>
      Array.from(document.querySelectorAll("video, audio")).some((m) => !(m as HTMLMediaElement).paused);

    const send = (beacon: boolean) => {
      if (pending < 1) return;
      const payload = JSON.stringify({ itemId, seconds: Math.min(pending, 600) });
      pending = 0;
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/activity", new Blob([payload], { type: "application/json" }));
      } else {
        void viewed.then(() =>
          fetch("/api/activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {}),
        );
      }
    };

    const tick = setInterval(() => {
      const active =
        document.visibilityState === "visible" && (Date.now() - lastInput < IDLE_AFTER_MS || mediaPlaying());
      if (active) pending += 1;
      if (pending >= SEND_EVERY_S) send(false);
    }, 1000);

    const onHide = () => document.visibilityState === "hidden" && send(true);
    const onPageHide = () => send(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      send(true);
    };
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
