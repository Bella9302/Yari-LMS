import { isSuperAdmin } from "@/server/rbac";
import type { RoleGrant } from "@/server/auth/session";

/** A rule of quizzes, assignments or marking that the user can act on (message is shown to them). */
export class AssessmentError extends Error {}

/**
 * A trainer who is also enrolled on their own course must not mark or override their own work
 * (it would let them award themselves a certificate). Super Admins may, e.g. to fix a record.
 */
export function assertNotOwnWork(actor: { id: string; roles: RoleGrant[] }, learnerUserId: string) {
  if (learnerUserId === actor.id && !isSuperAdmin(actor.roles)) {
    throw new AssessmentError("You can't mark your own work. Ask another trainer on the course.");
  }
}
