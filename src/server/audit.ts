import "server-only";
import { env } from "@/server/env";
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
  | "user.erased"
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
  | "report.exported"
  | "announcement.posted"
  | "discussion.moderated"
  | "rating.submitted"
  | "ratings.viewed"
  | "certificate.issued"
  | "certificate.revoked"
  | "certificate.downloaded"
  | "enquiry.received"
  | "enquiry.updated";

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

/**
 * The client's address as seen by our own outermost proxy. Proxies append to X-Forwarded-For,
 * so only the last `hops` entries were written by infrastructure we control.
 */
export function clientIpFrom(forwardedFor: string | null, hops: number): string | null {
  if (!forwardedFor || hops < 1) return null;
  const chain = forwardedFor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? chain[0] ?? null;
}

export async function clientIp(): Promise<string | null> {
  try {
    // Imported lazily so scripts (seed, jobs) can use audit() outside Next.js.
    const { headers } = await import("next/headers");
    const h = await headers();
    return clientIpFrom(h.get("x-forwarded-for"), env().TRUSTED_PROXY_HOPS);
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
