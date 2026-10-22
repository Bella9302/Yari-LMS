import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { actorNames } from "@/server/audit-read";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/ui/field";
import { Button, buttonClasses } from "@/ui/button";
import { EmptyState, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityId?: string; actorId?: string; before?: string }>;
}) {
  await requireRole("SUPER_ADMIN");
  const sp = await searchParams;
  const rows = await db.auditLog.findMany({
    where: {
      ...(sp.action ? { action: { startsWith: sp.action } } : {}),
      ...(sp.entityId ? { entityId: sp.entityId } : {}),
      ...(sp.actorId ? { actorId: sp.actorId } : {}),
    },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(sp.before ? { cursor: { id: sp.before }, skip: 1 } : {}),
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const names = await actorNames(page.map((r) => r.actorId));
  const nextParams = new URLSearchParams({ ...sp, before: page.at(-1)?.id ?? "" } as Record<string, string>);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Who signed in, and who viewed or changed personal information. Entries can't be edited or deleted."
      />
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" role="search">
        <label className="sr-only" htmlFor="action">
          Action
        </label>
        <Input
          id="action"
          name="action"
          placeholder="Action, e.g. pii. or auth.login"
          defaultValue={sp.action}
        />
        <label className="sr-only" htmlFor="entityId">
          Record id
        </label>
        <Input
          id="entityId"
          name="entityId"
          placeholder="Record id"
          defaultValue={sp.entityId}
          className="font-mono"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {page.length === 0 ? (
        <EmptyState title="Nothing logged for this filter" />
      ) : (
        <ol className="divide-line border-line divide-y border-y">
          {page.map((r) => (
            <li key={r.id} className="grid gap-1 py-3 text-sm md:grid-cols-[11rem_12rem_1fr]">
              <span className="text-muted font-mono text-xs">{formatDateTime(r.at)}</span>
              <span className="font-mono text-xs">{r.action}</span>
              <span>
                {r.actorId ? (
                  <Link href={`/admin/users/${r.actorId}`} className="underline-offset-4 hover:underline">
                    {names.get(r.actorId) ?? r.actorId}
                  </Link>
                ) : (
                  <span className="text-muted">Anonymous</span>
                )}
                <span className="text-muted">
                  {" "}
                  · {r.entityType}
                  {r.entityId ? ` ${r.entityId.slice(0, 8)}…` : ""}
                  {r.fields.length > 0 ? ` · ${r.fields.join(", ")}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {hasMore && (
        <Link href={`/admin/audit?${nextParams}`} className={buttonClasses("secondary")}>
          Older entries
        </Link>
      )}
    </div>
  );
}
