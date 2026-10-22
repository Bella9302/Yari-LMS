import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { CheckInError, getCheckInPreview } from "@/server/tracking/sessions";
import { NotFoundError } from "@/server/courses/access";
import { formatDay, formatTime } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { Monogram } from "@/ui/monogram";
import { Notice } from "@/ui/primitives";
import { CheckInButton } from "./check-in-button";

export const metadata: Metadata = { title: "Check in", referrer: "no-referrer" };

/** Opened by scanning the trainer's QR code with a phone camera. */
export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { sessionId } = await params;
  const { t } = await searchParams;
  const here = `/check-in/${sessionId}?t=${encodeURIComponent(t ?? "")}`;
  const session = await getCurrentSession();
  const stage = authStage(session);
  if (stage === "anonymous") redirect(`/login?next=${encodeURIComponent(here)}`);
  if (stage === "needs-2fa") redirect(`/login/2fa?next=${encodeURIComponent(here)}`);
  if (stage === "needs-2fa-setup") redirect("/setup-2fa");

  // Load first, render after: errors here are expected outcomes (not enrolled, no such session).
  let preview: Awaited<ReturnType<typeof getCheckInPreview>> | null = null;
  let problem: string | null = null;
  try {
    preview = await getCheckInPreview(session!.user.id, sessionId);
  } catch (err) {
    if (err instanceof CheckInError) problem = err.message;
    else if (err instanceof NotFoundError) problem = "This session doesn't exist.";
    else throw err;
  }

  const s = preview?.session;
  const content =
    preview && s ? (
      <>
        <p className="eyebrow">{s.course.title}</p>
        <h1 className="font-display text-h1 mt-3">{s.title}</h1>
        <p className="text-muted mt-2">
          {formatDay(s.startsAt)} · {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
          {s.location && ` · ${s.location}`}
        </p>
        <div className="mt-8">
          {preview.alreadyPresent ? (
            <p className="text-success flex items-center gap-3 text-xl">
              <CheckCircle2 className="size-7" aria-hidden /> You&apos;re checked in.
            </p>
          ) : !preview.open ? (
            <Notice>Check-in for this session isn&apos;t open right now.</Notice>
          ) : (
            <CheckInButton sessionId={sessionId} token={t ?? ""} />
          )}
        </div>
        <Link href={`/learn/${s.course.slug}`} className={buttonClasses("ghost", "md", "mt-8")}>
          Go to the course
        </Link>
      </>
    ) : (
      <>
        <h1 className="font-display text-h1">Can&apos;t check in</h1>
        <Notice tone="danger" className="mt-6">
          {problem}
        </Notice>
      </>
    );

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Monogram className="mb-10 h-8 w-auto self-start" />
      <div className="animate-rise">{content}</div>
    </main>
  );
}
