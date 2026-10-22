import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { managedOrgIds } from "@/server/rbac";
import { requireRole } from "@/server/guards";
import { listUsers } from "@/server/pii/users";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { InviteForm } from "@/ui/invite-form";
import { StaffTable } from "@/ui/staff-table";
import { cn } from "@/ui/cn";
import { OrgEnrol } from "./org-enrol";

export const metadata: Metadata = { title: "My company" };

export default async function OrgPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; q?: string }>;
}) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const orgIds = managedOrgIds(user.roles);
  const orgs = await db.organization.findMany({
    where: { id: { in: orgIds }, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (orgs.length === 0) notFound();

  const sp = await searchParams;
  const org = orgs.find((o) => o.id === sp.org) ?? orgs[0]!;
  const [staff, courses] = await Promise.all([
    listUsers({ id: user.id, roles: user.roles }, { organizationId: org.id, q: sp.q }),
    db.course.findMany({
      where: { status: "PUBLISHED", visibility: "PUBLIC", isTemplate: false },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        enrolments: {
          where: { organizationId: org.id, status: { not: "WITHDRAWN" } },
          select: { userId: true },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="My company"
        title={org.name}
        description="Invite your staff and follow their training."
      />

      {orgs.length > 1 && (
        <nav aria-label="Companies" className="flex flex-wrap gap-2">
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/org?org=${o.id}`}
              aria-current={o.id === org.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-sm border px-4 text-sm",
                o.id === org.id ? "border-fg bg-inverse text-on-inverse" : "border-line-strong",
              )}
            >
              {o.name}
            </Link>
          ))}
        </nav>
      )}

      <section className="border-line bg-surface border p-5">
        <h2 className="font-display text-h3 mb-1">Invite a staff member</h2>
        <p className="text-muted mb-5 text-sm">
          They&apos;ll get an email to set up their account and join {org.name}.
        </p>
        <InviteForm roles={["LEARNER"]} organizations={[]} fixedOrganizationId={org.id} />
      </section>

      <section className="border-line bg-surface border p-5">
        <h2 className="font-display text-h3 mb-1">Enrol staff on a course</h2>
        <p className="text-muted mb-5 text-sm">
          Choose a course from the YARI catalogue, then the people to enrol.
        </p>
        <OrgEnrol
          organizationId={org.id}
          courses={courses.map((c) => ({
            id: c.id,
            title: c.title,
            enrolledUserIds: c.enrolments.map((e) => e.userId),
          }))}
          staff={staff
            .filter((s) => s.status !== "SUSPENDED")
            .map((s) => ({ id: s.id, name: s.fullName, detail: s.email }))}
        />
      </section>

      <section>
        <h2 className="font-display text-h3">Staff</h2>
        <div className="mt-4">
          {staff.length === 0 ? (
            <EmptyState title="No staff yet">Invite your first staff member above.</EmptyState>
          ) : (
            <StaffTable rows={staff} />
          )}
        </div>
      </section>
    </div>
  );
}
