import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/guards";
import { listUsers } from "@/server/pii/users";
import { getCompanyOverview } from "@/server/tracking/company";
import { formatDate } from "@/lib/format";
import { DataTable } from "@/ui/data-table";
import { EmptyState, Tag } from "@/ui/primitives";
import { InviteForm } from "@/ui/invite-form";
import { UserStatusTag } from "@/ui/status-tag";

export const metadata: Metadata = { title: "Staff" };

export default async function OrgStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const actor = { id: user.id, roles: user.roles };
  const { orgId } = await params;
  const { q } = await searchParams;
  const [staff, overview] = await Promise.all([
    listUsers(actor, { organizationId: orgId, q }),
    getCompanyOverview(actor, orgId),
  ]);
  const summary = (userId: string) => {
    const rows = overview.rows.filter((r) => r.userId === userId);
    return {
      total: rows.length,
      completed: rows.filter((r) => r.state === "completed").length,
      overdue: rows.filter((r) => r.state === "overdue").length,
    };
  };

  return (
    <div className="space-y-10">
      <section className="border-line bg-surface border p-5">
        <h2 className="font-display text-h3 mb-1">Invite a staff member</h2>
        <p className="text-muted mb-5 text-sm">
          They&apos;ll get an email to set up their account and join your company.
        </p>
        <InviteForm roles={["LEARNER"]} organizations={[]} fixedOrganizationId={orgId} />
      </section>
      <section className="space-y-4">
        <form role="search" className="flex gap-3">
          <label htmlFor="staff-q" className="sr-only">
            Search staff
          </label>
          <input
            id="staff-q"
            name="q"
            defaultValue={q}
            placeholder="Search by name or email"
            className="border-line-strong bg-surface min-h-11 flex-1 rounded-sm border px-3"
          />
        </form>
        {staff.length === 0 ? (
          <EmptyState title="No staff yet">Invite your first staff member above.</EmptyState>
        ) : (
          <DataTable
            caption="Staff"
            rows={staff}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "name",
                header: "Name",
                cell: (r) => (
                  <Link
                    href={`/org/${orgId}/staff/${r.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.fullName}
                    <span className="text-muted block text-sm font-normal">{r.email}</span>
                  </Link>
                ),
              },
              { key: "status", header: "Account", cell: (r) => <UserStatusTag status={r.status} /> },
              {
                key: "training",
                header: "Training",
                cell: (r) => {
                  const s = summary(r.id);
                  return s.total ? (
                    <span className="flex flex-wrap items-center gap-2 font-mono text-sm">
                      {s.completed}/{s.total} done{" "}
                      {s.overdue > 0 && <Tag tone="danger">{s.overdue} overdue</Tag>}
                    </span>
                  ) : (
                    <span className="text-muted text-sm">Not enrolled</span>
                  );
                },
              },
              {
                key: "last",
                header: "Last sign-in",
                cell: (r) => formatDate(r.lastLoginAt),
                hideOnMobile: true,
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
