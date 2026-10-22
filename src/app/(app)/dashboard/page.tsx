import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { hasRole, managedOrgIds } from "@/server/rbac";
import { requireUser } from "@/server/guards";
import { getOwnIdentity } from "@/server/pii/users";
import { EmptyState, PageHeader, Stat } from "@/ui/primitives";
import { listMyCourses } from "@/server/courses/learner";
import { CourseCard } from "@/ui/course-card";
import { buttonClasses } from "@/ui/button";

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
  const [adminStats, orgStats, myCourses, teaching] = await Promise.all([
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
    isTrainer
      ? db.course.count({
          where: { isTemplate: false, status: { not: "ARCHIVED" }, staff: { some: { userId: user.id } } },
        })
      : Promise.resolve(0),
  ]);
  const inProgress = myCourses.filter((c) => c.status !== "COMPLETED");

  return (
    <div className="space-y-12">
      <PageHeader eyebrow={greeting()} title={<>Hello, {me.displayName}.</>} />

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
