import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { hashIp } from "@/server/crypto/blind-index";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.locked"
  | "auth.2fa_enabled"
  | "auth.2fa_disabled"
  | "auth.2fa_failed"
  | "auth.recovery_code_used"
  | "auth.recovery_codes_regenerated"
  | "auth.password_reset_requested"
  | "auth.password_changed"
  | "user.invited"
  | "user.invite_accepted"
  | "user.updated"
  | "user.suspended"
  | "user.reactivated"
  | "user.roles_changed"
  | "pii.viewed"
  | "pii.updated"
  | "org.created"
  | "org.updated"
  | "consent.granted"
  | "consent.withdrawn"
  | "data_request.created"
  | "data_request.updated"
  | "settings.updated"
  | "course.created"
  | "course.status_changed"
  | "course.deleted"
  | "course.staff_changed"
  | "enrolment.created"
  | "enrolment.withdrawn"
  | "enrolment.completed"
  | "asset.uploaded"
  | "asset.rejected"
  | "quiz.submitted"
  | "quiz.marked"
  | "assignment.submitted"
  | "assignment.marked"
  | "assignment.returned"
  | "grade.overridden"
  | "gradebook.exported"
  | "atrisk.dismissed"
  | "session.created"
  | "session.updated"
  | "session.cancelled"
  | "attendance.recorded"
  | "report.exported";

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Names of personal-data fields read or written (never their values). */
  fields?: string[];
  orgId?: string | null;
  meta?: Prisma.InputJsonValue;
}

export async function clientIp(): Promise<string | null> {
  try {
    // Imported lazily so scripts (seed, jobs) can use audit() outside Next.js.
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null; // outside a request (scripts, tests)
  }
}

export async function audit(entry: AuditEntry, tx: Tx = db): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      fields: entry.fields ?? [],
      orgId: entry.orgId ?? null,
      meta: entry.meta,
      ipHash: hashIp(await clientIp()),
    },
  });
}
