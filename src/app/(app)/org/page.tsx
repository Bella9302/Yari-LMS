import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { managedOrgIds } from "@/server/rbac";
import { requireRole } from "@/server/guards";

/** Sends a Client Manager to their (first) company. */
export default async function OrgIndex() {
  const { user } = await requireRole("CLIENT_MANAGER");
  const org = await db.organization.findFirst({
    where: { id: { in: managedOrgIds(user.roles) }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (!org) notFound();
  redirect(`/org/${org.id}`);
}
