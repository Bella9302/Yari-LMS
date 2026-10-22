import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { hasRole, managedOrgIds } from "@/server/rbac";
import { requireUser } from "@/server/guards";
import { getOwnIdentity } from "@/server/pii/users";
import { EmptyState, PageHeader, Stat } from "@/ui/primitives";
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

  const [adminStats, orgStats] = await Promise.all([
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
  ]);

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

      {hasRole(user.roles, "LEARNER") && (
        <section aria-labelledby="courses-heading">
          <h2 id="courses-heading" className="font-display text-h2">
            Your courses
          </h2>
          <div className="mt-6">
            <EmptyState title="No courses yet">
              When you&apos;re enrolled on a course it will appear here, with your progress and next steps.
            </EmptyState>
          </div>
        </section>
      )}

      {hasRole(user.roles, "TRAINER") && (
        <section aria-labelledby="teaching-heading">
          <h2 id="teaching-heading" className="font-display text-h2">
            Teaching
          </h2>
          <div className="mt-6">
            <EmptyState title="Course builder coming next">
              Building courses, modules and release rules is the next part of YARI Academy to arrive.
            </EmptyState>
          </div>
        </section>
      )}
    </div>
  );
}
