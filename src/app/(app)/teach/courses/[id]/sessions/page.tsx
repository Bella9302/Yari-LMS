import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Video } from "lucide-react";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { formatDay, formatTime } from "@/lib/format";
import { EmptyState, Tag } from "@/ui/primitives";
import { SessionForm } from "@/ui/session-form";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const now = new Date();
  const sessions = await db.liveSession.findMany({
    where: { courseId: id },
    orderBy: { startsAt: "asc" },
    include: { _count: { select: { attendance: { where: { status: "PRESENT" } } } } },
  });
  const upcoming = sessions.filter((s) => s.endsAt >= now);
  const past = sessions.filter((s) => s.endsAt < now).reverse();

  const list = (items: typeof sessions) => (
    <ul className="divide-line border-line divide-y border-y">
      {items.map((s) => (
        <li key={s.id}>
          <Link
            href={`/teach/courses/${id}/sessions/${s.id}`}
            className="hover:bg-sunk flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-3 sm:px-2"
          >
            <span className="w-28 font-mono text-sm">{formatDay(s.startsAt)}</span>
            <span className="text-muted font-mono text-sm">
              {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
            </span>
            <span className="min-w-0 flex-1 font-medium">{s.title}</span>
            {s.mode === "ONLINE" ? (
              <Video className="text-muted size-4" aria-label="Online" />
            ) : (
              <MapPin className="text-muted size-4" aria-label="In person" />
            )}
            {s.cancelledAt ? (
              <Tag tone="danger">Cancelled</Tag>
            ) : (
              <span className="text-muted font-mono text-xs">{s._count.attendance} present</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="font-display text-h2">Upcoming</h2>
          {upcoming.length ? (
            list(upcoming)
          ) : (
            <EmptyState title="Nothing scheduled">Schedule a practical or an online class.</EmptyState>
          )}
        </section>
        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-h2">Past</h2>
            {list(past)}
          </section>
        )}
      </div>
      <aside className="space-y-4">
        <h2 className="font-display text-h3">Schedule a session</h2>
        <SessionForm courseId={id} />
      </aside>
    </div>
  );
}
