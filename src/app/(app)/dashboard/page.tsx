import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { hasRole, managedOrgIds } from "@/server/rbac";
import { requireUser } from "@/server/guards";
import { getOwnIdentity } from "@/server/pii/users";
import { EmptyState, PageHeader, Stat } from "@/ui/primitives";
import { listMyCourses } from "@/server/courses/learner";
import { CourseCard } from "@/ui/course-card";
import { upcomingSessionsFor } from "@/server/tracking/sessions";
import { SessionList } from "@/ui/session-list";
import { buttonClasses } from "@/ui/button";
import { latestForUser } from "@/server/engagement/announcements";
import { pendingRatings } from "@/server/engagement/ratings";
import { badgesFor } from "@/server/engagement/badges";
import { BADGES, type BadgeCode } from "@/lib/badges";
import { formatDate } from "@/lib/format";
import { BadgeMark } from "@/ui/badge-mark";

export const metadata: Metadata = { title: "Home" };

function greeting(date = new Date()) {
  const h = Number(
    new Intl.DateTimeFormat("en-ZA", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Johannesburg",
    }).format(date),
  );
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const { user } = await requireUser();
  const me = await getOwnIdentity(user.id);
  const isAdmin = hasRole(user.roles, "SUPER_ADMIN");
  const orgIds = managedOrgIds(user.roles);

  const isLearner = hasRole(user.roles, "LEARNER");
  const isTrainer = hasRole(user.roles, "TRAINER");
  const [adminStats, orgStats, myCourses, sessions, teaching, announcements, toRate, badges] =
    await Promise.all([
      isAdmin
        ? Promise.all([
            db.user.count({ where: { status: "ACTIVE" } }),
            db.user.count({ where: { status: "INVITED" } }),
            db.organization.count({ where: { status: "ACTIVE" } }),
            db.dataRequest.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
          ])
        : null,
      orgIds.length
        ? db.orgMembership.count({
            where: { organizationId: { in: orgIds }, user: { status: { not: "DELETED" } } },
          })
        : null,
      isLearner ? listMyCourses(user.id) : Promise.resolve([]),
      isLearner ? upcomingSessionsFor(user.id, { limit: 5 }) : Promise.resolve([]),
      isTrainer
        ? db.course.count({
            where: { isTemplate: false, status: { not: "ARCHIVED" }, staff: { some: { userId: user.id } } },
          })
        : Promise.resolve(0),
      latestForUser(user.id, 3),
      isLearner ? pendingRatings(user.id) : Promise.resolve([]),
      isLearner ? badgesFor(user.id) : Promise.resolve([]),
    ]);
  const inProgress = myCourses.filter((c) => c.status !== "COMPLETED");

  return (
    <div className="space-y-12">
      <PageHeader eyebrow={greeting()} title={<>Hello, {me.displayName}.</>} />

      {toRate.length > 0 && (
        <aside
          aria-labelledby="rate-heading"
          className="border-fg flex flex-col gap-4 border-l-2 py-1 pl-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="rate-heading" className="font-display text-h3">
              Rate your trainer
            </h2>
            <p className="text-muted mt-1">
              {toRate.length === 1
                ? `How was ${toRate[0]!.trainerName}? It takes a minute and is anonymous to them.`
                : `${toRate.length} ratings are waiting. Each takes a minute and is anonymous to the trainer.`}
            </p>
          </div>
          <Link href="/ratings" className={buttonClasses("primary", "md", "shrink-0")}>
            Rate now
          </Link>
        </aside>
      )}

      {announcements.length > 0 && (
        <section aria-labelledby="news-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="news-heading" className="font-display text-h2">
              Announcements
            </h2>
            <Link href="/announcements" className="text-sm underline underline-offset-4">
              All
            </Link>
          </div>
          <ul className="border-line divide-line mt-6 divide-y border-y">
            {announcements.map((a) => (
              <li
                key={a.id}
                data-category={
                  a.course
                    ? a.course.category === "HEALTH_SAFETY"
                      ? "health-safety"
                      : "ai-digital"
                    : undefined
                }
              >
                <Link
                  href={a.course ? `/learn/${a.course.slug}/announcements` : "/announcements"}
                  className="hover:bg-sunk flex flex-col gap-1 px-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="text-muted w-28 shrink-0 font-mono text-xs">
                    {formatDate(a.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium break-words">{a.title}</span>
                    <span className="text-accent-text block text-sm">
                      {a.course?.title ?? "YARI Academy"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adminStats && (
        <section aria-labelledby="platform-heading">
          <h2 id="platform-heading" className="font-display text-h2">
            Platform
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            <Stat label="Active users" value={adminStats[0]} />
            <Stat label="Pending invites" value={adminStats[1]} />
            <Stat label="Client companies" value={adminStats[2]} />
            <Stat
              label="Open data requests"
              value={adminStats[3]}
              hint={
                adminStats[3] ? (
                  <Link href="/admin/data-requests" className="underline">
                    Review
                  </Link>
                ) : (
                  "None waiting"
                )
              }
            />
          </div>
        </section>
      )}

      {orgStats !== null && (
        <section aria-labelledby="company-heading">
          <h2 id="company-heading" className="font-display text-h2">
            Your company
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat label="Staff on YARI Academy" value={orgStats} />
          </div>
          <Link href="/org" className={buttonClasses("secondary", "md", "mt-6")}>
            Manage staff
          </Link>
        </section>
      )}

      {isLearner && (
        <section aria-labelledby="courses-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="courses-heading" className="font-display text-h2">
              Your courses
            </h2>
            {myCourses.length > 0 && (
              <Link href="/learn" className="text-sm underline underline-offset-4">
                All courses
              </Link>
            )}
          </div>
          <div className="mt-6">
            {inProgress.length === 0 ? (
              <EmptyState title={myCourses.length ? "All caught up" : "No courses yet"}>
                {myCourses.length
                  ? "You've completed every course you're enrolled on."
                  : "When you're enrolled on a course it will appear here, with your progress and next steps."}
              </EmptyState>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {inProgress.slice(0, 4).map((c) => (
                  <li key={c.slug}>
                    <CourseCard course={c} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {badges.length > 0 && (
        <section aria-labelledby="badges-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="badges-heading" className="font-display text-h2">
              Badges
            </h2>
            <Link href="/account/badges" className="text-sm underline underline-offset-4">
              All badges
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-4">
            {badges.slice(0, 4).map((b) => {
              const def = BADGES[b.badge as BadgeCode];
              return def ? (
                <li key={b.id} className="flex items-center gap-3">
                  <BadgeMark code={def.code} />
                  <span>
                    <span className="block font-medium">{def.name}</span>
                    {b.course && <span className="text-muted block text-sm">{b.course.title}</span>}
                  </span>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}

      {sessions.length > 0 && (
        <section aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" className="font-display text-h2">
            Coming up
          </h2>
          <div className="mt-6">
            <SessionList sessions={sessions} showCourse />
          </div>
        </section>
      )}

      {isTrainer && (
        <section aria-labelledby="teaching-heading">
          <h2 id="teaching-heading" className="font-display text-h2">
            Teaching
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat label="Your courses" value={teaching} />
          </div>
          <Link href="/teach" className={buttonClasses("secondary", "md", "mt-6")}>
            Go to your courses
          </Link>
        </section>
      )}
    </div>
  );
}
