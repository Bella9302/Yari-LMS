import Link from "next/link";
import type { UserListRow } from "@/server/pii/users";
import { formatDate } from "@/lib/format";
import { DataTable } from "@/ui/data-table";
import { UserStatusTag } from "@/ui/status-tag";

export function StaffTable({ rows, linkBase }: { rows: UserListRow[]; linkBase?: string }) {
  return (
    <DataTable
      caption="Staff"
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        {
          key: "name",
          header: "Name",
          cell: (r) => {
            const body = (
              <>
                {r.fullName}
                <span className="text-muted block text-sm font-normal">{r.email}</span>
              </>
            );
            return linkBase ? (
              <Link href={`${linkBase}/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                {body}
              </Link>
            ) : (
              <span className="font-medium">{body}</span>
            );
          },
        },
        { key: "status", header: "Status", cell: (r) => <UserStatusTag status={r.status} /> },
        { key: "last", header: "Last sign-in", cell: (r) => formatDate(r.lastLoginAt) },
      ]}
    />
  );
}
