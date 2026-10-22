import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requireUser } from "@/server/guards";
import { calendarEvents, type CalendarEvent } from "@/server/engagement/calendar";
import { formatTime, saDateInput } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { cn } from "@/ui/cn";
import { EmptyState, PageHeader, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Calendar" };

// South Africa has no daylight saving, so SAST is always UTC+2.
const SAST = 2 * 3600_000;
const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  session: "Session",
  assignment: "Due",
  "course-due": "Course due",
};

function parseMonth(m: string | undefined, now: Date) {
  const match = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  const today = new Date(now.getTime() + SAST);
  const year = match ? Number(match[1]) : today.getUTCFullYear();
  const month = match ? Math.min(12, Math.max(1, Number(match[2]))) - 1 : today.getUTCMonth();
  return { year, month };
}
const monthKey = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { user } = await requireUser();
  const now = new Date();
  const { year, month } = parseMonth((await searchParams).m, now);
  const from = new Date(Date.UTC(year, month, 1) - SAST);
  const to = new Date(Date.UTC(year, month + 1, 1) - SAST);
  const events = await calendarEvents({ id: user.id, roles: user.roles }, from, to);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    // Multi-day sessions are listed on their first day in this month.
    const key = saDateInput(e.start < from ? from : e.start);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const todayKey = saDateInput(now);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday first
  const title = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
  const dayHeading = (key: string) =>
    new Intl.DateTimeFormat("en-ZA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${key}T00:00:00Z`));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Calendar"
        title={title}
        description="Live sessions and due dates for your courses. Times are South African (SAST)."
        actions={
          <a href="/calendar/ics" className={buttonClasses("secondary")}>
            <Download aria-hidden className="size-4" /> Add to your calendar
          </a>
        }
      />

      <nav aria-label="Months" className="flex items-center justify-between gap-3">
        <Link href={`/calendar?m=${monthKey(year, month - 1)}`} className={buttonClasses("ghost", "md")}>
          <ChevronLeft aria-hidden className="size-4" /> Previous
        </Link>
        <Link href="/calendar" className="text-sm underline underline-offset-4">
          This month
        </Link>
        <Link href={`/calendar?m=${monthKey(year, month + 1)}`} className={buttonClasses("ghost", "md")}>
          Next <ChevronRight aria-hidden className="size-4" />
        </Link>
      </nav>

      <div aria-hidden className="grid grid-cols-7 gap-px">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="eyebrow pb-2 text-center">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${monthKey(year, month)}-${String(i + 1).padStart(2, "0")}`;
          const evs = byDay.get(key) ?? [];
          const cell = (
            <>
              <span className="font-mono text-sm tabular-nums">{i + 1}</span>
              {evs.length > 0 && (
                <span className="mt-1 flex justify-center gap-0.5">
                  {evs.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      data-category={e.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
                      className={cn("size-1.5 rounded-full", e.kind === "session" ? "bg-accent" : "bg-fg")}
                    />
                  ))}
                </span>
              )}
            </>
          );
          const base = cn(
            "flex min-h-11 flex-col items-center justify-start border-t py-1.5",
            key === todayKey ? "border-fg border-t-2" : "border-line",
          );
          return evs.length ? (
            <a key={key} href={`#d-${key}`} tabIndex={-1} className={cn(base, "hover:bg-sunk")}>
              {cell}
            </a>
          ) : (
            <span key={key} className={cn(base, "text-muted")}>
              {cell}
            </span>
          );
        })}
      </div>

      {events.length === 0 ? (
        <EmptyState title="Nothing scheduled this month" />
      ) : (
        <ol className="space-y-8">
          {[...byDay.entries()].map(([key, evs]) => (
            <li key={key} id={`d-${key}`} className="scroll-mt-24">
              <h2 className={cn("eyebrow border-fg border-b pb-2", key === todayKey && "text-fg")}>
                {dayHeading(key)}
                {key === todayKey && " · Today"}
              </h2>
              <ul className="divide-line divide-y">
                {evs.map((e) => (
                  <li
                    key={e.id}
                    data-category={e.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
                  >
                    <Link href={e.href} className="hover:bg-sunk flex min-h-14 items-start gap-4 px-1 py-3">
                      <span className="text-muted w-14 shrink-0 pt-0.5 font-mono text-sm tabular-nums">
                        {formatTime(e.start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{e.title}</span>
                          {e.done && <Tag tone="success">{e.kind === "session" ? "Attended" : "Done"}</Tag>}
                        </span>
                        <span className="text-muted mt-0.5 block text-sm">
                          <span className="text-accent-text font-medium">
                            {e.kind === "session" && (
                              <CalendarDays aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
                            )}
                            {KIND_LABEL[e.kind]}
                          </span>
                          {[
                            e.course.title,
                            e.location,
                            e.end && e.kind === "session" ? `until ${formatTime(e.end)}` : null,
                          ]
                            .filter(Boolean)
                            .map((part) => ` · ${part}`)
                            .join("")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
