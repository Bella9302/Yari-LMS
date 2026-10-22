import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireRole } from "@/server/guards";
import { getComplianceRows } from "@/server/tracking/company";
import { audit } from "@/server/audit";
import { formatDate } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { DataTable } from "@/ui/data-table";
import { EmptyState } from "@/ui/primitives";
import { TrainingStateTag } from "@/ui/training-state";

export const metadata: Metadata = { title: "Compliance report" };

export default async function ReportPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const { orgId } = await params;
  const { rows } = await getComplianceRows({ id: user.id, roles: user.roles }, orgId);
  if (rows.length)
    await audit({
      actorId: user.id,
      action: "pii.viewed",
      entityType: "ComplianceReport",
      entityId: orgId,
      orgId,
      fields: ["fullName"],
    });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted flex-1">
          Every staff member&apos;s training for your company: use it for audits and Department of Employment
          and Labour visits.
        </p>
        <a href={`/org/${orgId}/report/export?format=pdf`} className={buttonClasses("primary", "sm")}>
          <Download className="size-4" aria-hidden /> PDF
        </a>
        <a href={`/org/${orgId}/report/export?format=csv`} className={buttonClasses("secondary", "sm")}>
          <Download className="size-4" aria-hidden /> CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to report yet" />
      ) : (
        <DataTable
          caption="Compliance report"
          rows={rows.map((r, i) => ({ ...r, key: String(i) }))}
          rowKey={(r) => r.key}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (r) => (
                <span className="font-medium">
                  {r.name}
                  <span className="text-muted block text-xs font-normal">{r.department ?? ""}</span>
                </span>
              ),
            },
            { key: "course", header: "Course", cell: (r) => r.course },
            { key: "state", header: "Status", cell: (r) => <TrainingStateTag state={r.state} /> },
            {
              key: "progress",
              header: "Progress",
              cell: (r) => <span className="font-mono">{r.progressPct}%</span>,
            },
            { key: "due", header: "Due", cell: (r) => formatDate(r.dueAt) },
            { key: "done", header: "Completed", cell: (r) => formatDate(r.completedAt) },
          ]}
        />
      )}
    </div>
  );
}
