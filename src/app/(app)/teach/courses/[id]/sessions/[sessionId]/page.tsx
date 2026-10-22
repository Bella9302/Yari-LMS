import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, QrCode } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getRegister, isCheckInOpen } from "@/server/tracking/sessions";
import { cancelSessionAction, setAttendanceAction } from "@/server/actions/tracking";
import { NotFoundError } from "@/server/courses/access";
import { formatDateTime, formatDay, formatTime, saDateInput, saTimeInput } from "@/lib/format";
import { Button, buttonClasses } from "@/ui/button";
import { EmptyState, Notice, Stat, Tag } from "@/ui/primitives";
import { SessionForm } from "@/ui/session-form";
import { cn } from "@/ui/cn";

export const metadata: Metadata = { title: "Session" };

const METHOD: Record<string, string> = { QR: "QR", ONLINE_JOIN: "Joined online", MANUAL: "By trainer" };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { user } = await requireUser();
  const { id, sessionId } = await params;
  const { session, rows } = await getRegister({ id: user.id, roles: user.roles }, sessionId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (session.courseId !== id) notFound();
  const present = rows.filter((r) => r.status === "PRESENT").length;
  const open = isCheckInOpen(session);
  const base = `/teach/courses/${id}/sessions/${sessionId}`;

  return (
    <div className="space-y-8">
      <Link href={`/teach/courses/${id}/sessions`} className="eyebrow hover:text-fg">
        ← Sessions
      </Link>
      <header className="border-line flex flex-wrap items-end gap-x-6 gap-y-3 border-b pb-6">
        <div className="flex-1">
          <h2 className="font-display text-h2">{session.title}</h2>
          <p className="text-muted mt-1">
            {formatDay(session.startsAt)} · {formatTime(session.startsAt)}–{formatTime(session.endsAt)}
            {session.location && ` · ${session.location}`}
          </p>
        </div>
        {session.cancelledAt ? (
          <Tag tone="danger">Cancelled {formatDateTime(session.cancelledAt)}</Tag>
        ) : (
          session.mode !== "ONLINE" && (
            <Link href={`${base}/present`} className={buttonClasses("primary", "lg")}>
              <QrCode className="size-5" aria-hidden /> Show check-in code
            </Link>
          )
        )}
      </header>
      {!session.cancelledAt && !open && (
        <Notice>Check-in opens 30 minutes before the start and closes 30 minutes after the end.</Notice>
      )}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Present" value={present} />
        <Stat label="On the course" value={rows.length} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-h3 flex-1">Register</h3>
          <a href={`${base}/export`} className={buttonClasses("secondary", "sm")}>
            <Download className="size-4" aria-hidden /> CSV
          </a>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No learners on this course yet" />
        ) : (
          <ul className="divide-line border-line divide-y border-y">
            {rows.map((r) => (
              <li key={r.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.name}</span>
                  <span className="text-muted block text-xs">
                    {r.organization ?? "Individual"}
                    {r.checkedInAt && ` · ${formatTime(r.checkedInAt)}`}
                    {r.method && ` · ${METHOD[r.method]}`}
                    {r.note && ` · ${r.note}`}
                  </span>
                </span>
                <div role="group" aria-label={`Attendance for ${r.name}`} className="flex gap-1">
                  {(["PRESENT", "ABSENT", "EXCUSED"] as const).map((status) => (
                    <form key={status} action={setAttendanceAction}>
                      <input type="hidden" name="courseId" value={id} />
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="userId" value={r.userId} />
                      <input type="hidden" name="status" value={status} />
                      <Button
                        type="submit"
                        size="sm"
                        variant={r.status === status ? "primary" : "ghost"}
                        aria-pressed={r.status === status}
                        className={cn(r.status === status && status === "ABSENT" && "bg-danger text-paper")}
                      >
                        {status === "PRESENT" ? "Present" : status === "ABSENT" ? "Absent" : "Excused"}
                      </Button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!session.cancelledAt && (
        <details className="border-line border">
          <summary className="cursor-pointer px-4 py-3 font-medium">Edit or cancel the session</summary>
          <div className="border-line space-y-6 border-t p-4">
            <SessionForm
              courseId={id}
              initial={{
                id: session.id,
                title: session.title,
                description: session.description,
                mode: session.mode,
                date: saDateInput(session.startsAt),
                start: saTimeInput(session.startsAt),
                end: saTimeInput(session.endsAt),
                location: session.location ?? "",
                meetingUrl: session.meetingUrl ?? "",
              }}
            />
            <form action={cancelSessionAction} className="border-line border-t pt-4">
              <input type="hidden" name="courseId" value={id} />
              <input type="hidden" name="sessionId" value={sessionId} />
              <Button type="submit" variant="danger" size="sm">
                Cancel this session
              </Button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}
