import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { getUserDetail } from "@/server/pii/users";
import { setUserStatusAction } from "@/server/actions/admin";
import { actorNames } from "@/server/audit-read";
import { ROLE_LABELS } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { DetailItem, PageHeader, Tag } from "@/ui/primitives";
import { UserStatusTag } from "@/ui/status-tag";

export const metadata: Metadata = { title: "Person" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const person = await getUserDetail({ id: user.id, roles: user.roles }, id);
  if (!person) notFound();

  const [orgs, history] = await Promise.all([
    db.organization.findMany({ select: { id: true, name: true } }),
    db.auditLog.findMany({ where: { entityType: "User", entityId: id }, orderBy: { at: "desc" }, take: 25 }),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const names = await actorNames(history.map((h) => h.actorId));

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Person"
        title={person.fullName}
        description={person.email}
        actions={
          person.id !== user.id &&
          (person.status === "ACTIVE" || person.status === "SUSPENDED") && (
            <form action={setUserStatusAction}>
              <input type="hidden" name="userId" value={person.id} />
              <input
                type="hidden"
                name="status"
                value={person.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
              />
              <Button type="submit" variant={person.status === "ACTIVE" ? "danger" : "secondary"}>
                {person.status === "ACTIVE" ? "Suspend access" : "Restore access"}
              </Button>
            </form>
          )
        }
      />

      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="Status" value={<UserStatusTag status={person.status} />} />
        <DetailItem
          label="Roles"
          value={
            <span className="flex flex-wrap gap-2">
              {person.roles.map((r) => (
                <Tag key={`${r.role}-${r.organizationId}`}>
                  {ROLE_LABELS[r.role]}
                  {r.organizationId ? ` · ${orgName.get(r.organizationId)}` : ""}
                </Tag>
              ))}
            </span>
          }
        />
        <DetailItem
          label="Company"
          value={person.organizations.map((o) => o.name).join(", ") || "Individual"}
        />
        <DetailItem
          label={
            person.idType === "PASSPORT" ? `Passport (${person.passportCountry ?? "—"})` : "SA ID number"
          }
          value={person.idNumber ? <span className="font-mono tracking-wider">{person.idNumber}</span> : "—"}
        />
        <DetailItem label="Mobile" value={person.phone ?? "—"} />
        <DetailItem label="Two-step verification" value={person.totpEnabled ? "On" : "Off"} />
        <DetailItem label="Joined" value={formatDate(person.createdAt)} />
        <DetailItem label="Last sign-in" value={formatDateTime(person.lastLoginAt)} />
      </dl>

      <section>
        <h2 className="font-display text-h3">Recent activity on this account</h2>
        <ol className="divide-line border-line mt-4 divide-y border-y text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-4 gap-y-1 py-3">
              <span className="text-muted w-40 shrink-0 font-mono text-xs">{formatDateTime(h.at)}</span>
              <span className="font-mono text-xs">{h.action}</span>
              <span className="text-muted">
                by {h.actorId ? (names.get(h.actorId) ?? "unknown") : "anonymous"}
              </span>
              {h.fields.length > 0 && <span className="text-muted">fields: {h.fields.join(", ")}</span>}
            </li>
          ))}
        </ol>
        <Link
          href={`/admin/audit?entityId=${person.id}`}
          className="mt-4 inline-block text-sm underline underline-offset-4"
        >
          Full audit history
        </Link>
      </section>
    </div>
  );
}
