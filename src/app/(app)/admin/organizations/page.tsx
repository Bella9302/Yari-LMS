import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { formatDate } from "@/lib/format";
import { DataTable } from "@/ui/data-table";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { CreateOrganizationForm } from "./create-form";

export const metadata: Metadata = { title: "Companies" };

export default async function OrganizationsPage() {
  await requireRole("SUPER_ADMIN");
  const orgs = await db.organization.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true, roles: { where: { role: "CLIENT_MANAGER" } } } } },
  });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Client companies"
        description="Each company's data is kept separate."
      />
      <details className="group border-line bg-surface border">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium">
          Add a company
          <span aria-hidden className="font-mono text-xl transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-line border-t p-5">
          <CreateOrganizationForm />
        </div>
      </details>
      {orgs.length === 0 ? (
        <EmptyState title="No companies yet">
          Add a client company, then invite its Client Manager.
        </EmptyState>
      ) : (
        <DataTable
          caption="Client companies"
          rows={orgs}
          rowKey={(o) => o.id}
          columns={[
            {
              key: "name",
              header: "Company",
              cell: (o) => (
                <Link
                  href={`/admin/organizations/${o.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {o.name}
                </Link>
              ),
            },
            {
              key: "staff",
              header: "Staff",
              cell: (o) => <span className="font-mono">{o._count.members}</span>,
            },
            {
              key: "managers",
              header: "Managers",
              cell: (o) => <span className="font-mono">{o._count.roles}</span>,
            },
            { key: "since", header: "Added", cell: (o) => formatDate(o.createdAt), hideOnMobile: true },
          ]}
        />
      )}
    </div>
  );
}
