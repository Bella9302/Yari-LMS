import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { listUsers } from "@/server/pii/users";
import { ROLE_LABELS } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { DataTable } from "@/ui/data-table";
import { Input, Select } from "@/ui/field";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { InviteForm } from "@/ui/invite-form";
import { UserStatusTag } from "@/ui/status-tag";

export const metadata: Metadata = { title: "People" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const { user } = await requireRole("SUPER_ADMIN");
  const sp = await searchParams;
  const role = Object.values(Role).includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const status = Object.values(UserStatus).includes(sp.status as UserStatus)
    ? (sp.status as UserStatus)
    : undefined;

  const [rows, organizations] = await Promise.all([
    listUsers({ id: user.id, roles: user.roles }, { q: sp.q, role, status }),
    db.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="People"
        description="Everyone with access to YARI Academy."
      />

      <details className="group border-line bg-surface border">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium">
          Invite someone
          <span aria-hidden className="font-mono text-xl transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-line border-t p-5">
          <InviteForm
            roles={["LEARNER", "TRAINER", "CLIENT_MANAGER", "SUPER_ADMIN"]}
            organizations={organizations}
          />
        </div>
      </details>

      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <label className="sr-only" htmlFor="q">
          Search people
        </label>
        <Input id="q" name="q" placeholder="Search name or email" defaultValue={sp.q} />
        <label className="sr-only" htmlFor="role">
          Role
        </label>
        <Select id="role" name="role" defaultValue={role ?? ""}>
          <option value="">All roles</option>
          {Object.values(Role).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="status">
          Status
        </label>
        <Select id="status" name="status" defaultValue={status ?? ""}>
          <option value="">Any status</option>
          {Object.values(UserStatus)
            .filter((s) => s !== "DELETED")
            .map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No one matches">Try a different search or filter.</EmptyState>
      ) : (
        <DataTable
          caption="People"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (r) => (
                <Link
                  href={`/admin/users/${r.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {r.fullName}
                  <span className="text-muted block text-sm font-normal">{r.email}</span>
                </Link>
              ),
            },
            {
              key: "roles",
              header: "Roles",
              cell: (r) => [...new Set(r.roles.map((x) => ROLE_LABELS[x.role]))].join(", "),
            },
            {
              key: "company",
              header: "Company",
              cell: (r) => r.organizations.map((o) => o.name).join(", ") || "—",
            },
            { key: "status", header: "Status", cell: (r) => <UserStatusTag status={r.status} /> },
            {
              key: "last",
              header: "Last sign-in",
              cell: (r) => formatDate(r.lastLoginAt),
              hideOnMobile: true,
            },
          ]}
        />
      )}
    </div>
  );
}
