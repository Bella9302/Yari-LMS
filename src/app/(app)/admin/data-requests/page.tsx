import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { updateDataRequestAction } from "@/server/actions/admin";
import { actorNames } from "@/server/audit-read";
import { daysRemaining, formatDate } from "@/lib/format";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Data requests" };

export default async function DataRequestsPage() {
  await requireRole("SUPER_ADMIN");
  const requests = await db.dataRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  const names = await actorNames(requests.map((r) => r.userId));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Data requests"
        description="POPIA requests from learners to receive a copy of, or delete, their information. Respond within 30 days."
      />
      {requests.length === 0 ? (
        <EmptyState title="No requests" />
      ) : (
        <ul className="divide-line border-line divide-y border-y">
          {requests.map((r) => {
            const open = r.status === "PENDING" || r.status === "IN_PROGRESS";
            const daysLeft = daysRemaining(r.createdAt, 30);
            return (
              <li key={r.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
                <div className="flex-1">
                  <p className="font-medium">
                    <Link href={`/admin/users/${r.userId}`} className="underline-offset-4 hover:underline">
                      {names.get(r.userId) ?? "Unknown"}
                    </Link>{" "}
                    — {r.type === "EXPORT" ? "copy of their data" : "delete their account"}
                  </p>
                  <p className="text-muted mt-1 text-sm">
                    Requested {formatDate(r.createdAt)}
                    {open && (
                      <span className={daysLeft <= 7 ? "text-danger" : undefined}>
                        {" "}
                        · {daysLeft} days left
                      </span>
                    )}
                  </p>
                </div>
                <Tag
                  tone={r.status === "COMPLETED" ? "success" : r.status === "REJECTED" ? "danger" : "neutral"}
                >
                  {r.status.replace("_", " ").toLowerCase()}
                </Tag>
                {open && (
                  <div className="flex gap-2">
                    {r.status === "PENDING" && <StatusButton id={r.id} status="IN_PROGRESS" label="Start" />}
                    <StatusButton id={r.id} status="COMPLETED" label="Mark done" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={updateDataRequestAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  );
}
