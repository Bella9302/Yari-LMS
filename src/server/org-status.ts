import "server-only";
import { db } from "@/server/db";
import { PermissionError } from "@/server/pii/users";

/**
 * Role checks (rbac.ts) only say someone manages a company. An archived company's managers
 * keep their role but must not act for it, so services that act for a company check this too.
 */
export async function assertActiveOrg(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { status: true } });
  if (org?.status !== "ACTIVE") throw new PermissionError("This company's access has ended.");
}
