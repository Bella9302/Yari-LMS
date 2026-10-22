import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { managedOrgIds } from "@/server/rbac";
import { requireRole } from "@/server/guards";
import { PageHeader } from "@/ui/primitives";
import { SubNav } from "@/ui/sub-nav";
import { cn } from "@/ui/cn";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const { orgId } = await params;
  const managed = managedOrgIds(user.roles);
  if (!managed.includes(orgId)) notFound();
  const orgs = await db.organization.findMany({
    where: { id: { in: managed }, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const org = orgs.find((o) => o.id === orgId);
  if (!org) notFound();
  const base = `/org/${orgId}`;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="My company" title={org.name} />
      {orgs.length > 1 && (
        <nav aria-label="Companies" className="flex flex-wrap gap-2">
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/org/${o.id}`}
              aria-current={o.id === orgId ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-sm border px-4 text-sm",
                o.id === orgId ? "border-fg bg-inverse text-on-inverse" : "border-line-strong",
              )}
            >
              {o.name}
            </Link>
          ))}
        </nav>
      )}
      <SubNav
        label="Company sections"
        items={[
          { href: base, label: "Overview", exact: true },
          { href: `${base}/staff`, label: "Staff" },
          { href: `${base}/enrol`, label: "Enrol staff" },
          { href: `${base}/report`, label: "Compliance report" },
        ]}
      />
      {children}
    </div>
  );
}
