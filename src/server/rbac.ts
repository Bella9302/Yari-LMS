import "server-only";
// Pure role/permission rules. Page and action guards that redirect live in @/server/guards.
import type { Role } from "@/generated/prisma/client";
import { ROLES_REQUIRING_2FA } from "@/lib/roles";
import type { RoleGrant, ValidSession } from "@/server/auth/session";

export function hasRole(roles: RoleGrant[], role: Role): boolean {
  return roles.some((r) => r.role === role);
}

export function isSuperAdmin(roles: RoleGrant[]): boolean {
  return hasRole(roles, "SUPER_ADMIN");
}

export function requiresTwoFactor(roles: RoleGrant[]): boolean {
  return roles.some((r) => ROLES_REQUIRING_2FA.includes(r.role));
}

/** Organisations this user manages as a Client Manager. */
export function managedOrgIds(roles: RoleGrant[]): string[] {
  return roles.filter((r) => r.role === "CLIENT_MANAGER" && r.organizationId).map((r) => r.organizationId!);
}

/**
 * Org-scoped access check. Super Admins see every organisation; Client Managers
 * only the ones they manage. Everyone else sees none.
 */
export function canAccessOrg(roles: RoleGrant[], orgId: string): boolean {
  return isSuperAdmin(roles) || managedOrgIds(roles).includes(orgId);
}

/** Prisma `where` fragment restricting organisation ids to what this user may see. */
export function orgScope(roles: RoleGrant[]): { in: string[] } | undefined {
  return isSuperAdmin(roles) ? undefined : { in: managedOrgIds(roles) };
}

export type AuthStage = "anonymous" | "needs-2fa" | "needs-2fa-setup" | "ok";

export function authStage(session: ValidSession | null): AuthStage {
  if (!session) return "anonymous";
  if (session.user.totpEnabled && !session.twoFactorVerified) return "needs-2fa";
  if (!session.user.totpEnabled && requiresTwoFactor(session.user.roles)) return "needs-2fa-setup";
  return "ok";
}
