import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { listUsers } from "@/server/pii/users";
import { dec } from "@/server/pii/fields";
import { EmptyState, PageHeader, Tag } from "@/ui/primitives";
import { InviteForm } from "@/ui/invite-form";
import { StaffTable } from "@/ui/staff-table";

export const metadata: Metadata = { title: "Company" };

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) notFound();

  const [staff, managers] = await Promise.all([
    listUsers({ id: user.id, roles: user.roles }, { organizationId: id }),
    db.roleAssignment.findMany({
      where: { organizationId: id, role: "CLIENT_MANAGER" },
      select: { user: { select: { id: true, status: true, profile: { select: { fullNameEnc: true } } } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Client company"
        title={org.name}
        description={org.regNumber ? `Reg. ${org.regNumber}` : undefined}
      />

      <section>
        <h2 className="font-display text-h3">Client Managers</h2>
        {managers.length === 0 ? (
          <p className="text-muted mt-2">No manager yet — invite one below.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {managers.map(({ user: m }) => (
              <li key={m.id}>
                <Tag>
                  {m.profile ? dec.fullName(m.id, m.profile.fullNameEnc) : "—"} · {m.status.toLowerCase()}
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-line bg-surface border p-5">
        <h2 className="font-display text-h3 mb-5">Invite to {org.name}</h2>
        <InviteForm roles={["CLIENT_MANAGER", "LEARNER"]} organizations={[]} fixedOrganizationId={org.id} />
      </section>

      <section>
        <h2 className="font-display text-h3">Staff</h2>
        <div className="mt-4">
          {staff.length === 0 ? (
            <EmptyState title="No staff yet" />
          ) : (
            <StaffTable rows={staff} linkBase="/admin/users" />
          )}
        </div>
      </section>
    </div>
  );
}
