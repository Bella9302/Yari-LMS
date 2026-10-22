import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getLearnerCourse, type OutlineItem } from "@/server/courses/learner";
import { formatDate, formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { ITEM_TYPE_META } from "@/ui/item-type";
import { CategoryTag, Notice, Tag } from "@/ui/primitives";
import { ProgressRing } from "@/ui/progress-ring";
import { upcomingSessionsFor } from "@/server/tracking/sessions";
import { SessionList } from "@/ui/session-list";
import { courseAnnouncements } from "@/server/engagement/announcements";

export const metadata: Metadata = { title: "Course" };

export default async function CourseOutlinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { user } = await requireUser();
  const { slug } = await params;
  const data = await getLearnerCourse({ id: user.id, roles: user.roles }, slug);
  if (!data) notFound();
  const { course, enrolment, modules, nextItemId, preview } = data;
  const [sessions, announcements] = await Promise.all([
    enrolment ? upcomingSessionsFor(user.id, { courseId: course.id }) : Promise.resolve([]),
    courseAnnouncements(course.id),
  ]);
  const latest = announcements[0];
  const total = modules.reduce((n, m) => n + m.items.length, 0);

  return (
    <div
      className="space-y-10"
      data-category={course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
    >
      {preview && (
        <Notice title="Preview">
          You&apos;re seeing this course as a learner would. Locks are shown but you can open everything, and
          nothing is recorded.
        </Notice>
      )}
      <header className="animate-rise border-line grid gap-6 border-b pb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <CategoryTag category={course.category} />
          <h1 className="font-display text-h1 mt-3 break-words">{course.title}</h1>
          {course.summary && <p className="text-muted mt-3 max-w-2xl text-lg">{course.summary}</p>}
          <p className="text-muted mt-4 font-mono text-xs">
            {total} items{course.estMinutes ? ` · about ${Math.round(course.estMinutes / 60) || 1} h` : ""}
            {enrolment?.dueAt ? ` · due ${formatDate(enrolment.dueAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-5">
          {enrolment && (
            <ProgressRing value={enrolment.progressPct} label="Course progress" size={88} stroke={5} />
          )}
          {nextItemId && (
            <Link href={`/learn/${course.slug}/${nextItemId}`} className={buttonClasses("primary", "lg")}>
              {enrolment && enrolment.progressPct > 0 ? "Continue" : "Start"}
            </Link>
          )}
        </div>
      </header>

      {enrolment?.status === "COMPLETED" && (
        <Notice tone="success" title="Course completed">
          Well done. You can come back to the material at any time.
        </Notice>
      )}

      <nav aria-label="Course community" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href={`/learn/${course.slug}/announcements`} className="underline underline-offset-4">
          Announcements{announcements.length ? ` (${announcements.length})` : ""}
        </Link>
        <Link href={`/learn/${course.slug}/discussions`} className="underline underline-offset-4">
          Discussions
        </Link>
      </nav>

      {latest && (
        <Link
          href={`/learn/${course.slug}/announcements`}
          className="border-accent hover:bg-sunk block border-l-2 py-2 pr-2 pl-4"
        >
          <span className="eyebrow">Latest announcement · {formatDateTime(latest.createdAt)}</span>
          <span className="mt-1 block font-medium break-words">{latest.title}</span>
        </Link>
      )}

      {sessions.length > 0 && (
        <section aria-labelledby="course-sessions-heading" className="space-y-3">
          <h2 id="course-sessions-heading" className="eyebrow">
            Live sessions
          </h2>
          <SessionList sessions={sessions} />
        </section>
      )}

      <ol className="space-y-8">
        {modules.map((m, mi) => (
          <li key={m.id}>
            <div className="border-fg flex items-baseline gap-4 border-b pb-2">
              <span className="text-muted font-mono text-sm">{String(mi + 1).padStart(2, "0")}</span>
              <h2 className="font-display text-h3">{m.title}</h2>
            </div>
            {m.description && <p className="text-muted mt-2">{m.description}</p>}
            {!m.lock.unlocked && (
              <p className="text-muted mt-3 flex items-center gap-2 text-sm">
                <Lock className="size-4" aria-hidden /> {m.lock.reasons.join(" · ")}
              </p>
            )}
            <ul className="divide-line mt-2 divide-y">
              {m.items.map((item) => (
                <OutlineRow
                  key={item.id}
                  item={item}
                  href={`/learn/${course.slug}/${item.id}`}
                  clickable={item.lock.unlocked || preview}
                />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OutlineRow({ item, href, clickable }: { item: OutlineItem; href: string; clickable: boolean }) {
  const StatusIcon = !item.lock.unlocked
    ? Lock
    : item.status === "COMPLETED"
      ? CheckCircle2
      : item.status === "IN_PROGRESS"
        ? CircleDot
        : Circle;
  const statusLabel = !item.lock.unlocked
    ? "Locked"
    : item.status === "COMPLETED"
      ? "Completed"
      : item.status === "IN_PROGRESS"
        ? "Started"
        : "Not started";
  const body = (
    <>
      <StatusIcon
        className={`size-5 shrink-0 ${item.status === "COMPLETED" && item.lock.unlocked ? "text-accent-text" : "text-muted"}`}
        strokeWidth={1.5}
        aria-label={statusLabel}
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words">{item.title}</span>
        <span className="text-muted block text-sm">
          {ITEM_TYPE_META[item.type].label}
          {item.estMinutes ? ` · ${item.estMinutes} min` : ""}
          {!item.lock.unlocked && ` · ${item.lock.reasons.join(" · ")}`}
        </span>
      </span>
      {!item.required && <Tag>Optional</Tag>}
    </>
  );
  return (
    <li>
      {clickable ? (
        <Link href={href} className="hover:bg-sunk flex min-h-14 items-center gap-4 py-3 sm:px-2">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-4 py-3 opacity-70 sm:px-2" aria-disabled>
          {body}
        </div>
      )}
    </li>
  );
}
