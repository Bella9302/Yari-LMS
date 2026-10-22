import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { env } from "@/server/env";
import { canAccessOrg, isSuperAdmin } from "@/server/rbac";
import { aad, decryptField, encryptField } from "@/server/crypto/field-encryption";
import { dec } from "@/server/pii/fields";
import { PermissionError, type Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { notify } from "@/server/engagement/notifications";
import { sendEmail } from "@/server/email/send";
import { certificateEmail } from "@/server/email/templates";
import { accreditationSettings, siteSettings } from "@/server/settings";
import { accreditationFor, certificateWording, makeCode, normaliseCode } from "@/lib/certificates";

interface Holder {
  learnerName: string;
  trainers: string[];
}

const holderCtx = (code: string) => aad("Certificate", "holder", code);
const sealHolder = (code: string, h: Holder) => encryptField(JSON.stringify(h), holderCtx(code));
function openHolder(code: string, holderEnc: string | null): Holder | null {
  return holderEnc ? (JSON.parse(decryptField(holderEnc, holderCtx(code))) as Holder) : null;
}

const fullName = (u: { id: string; profile: { fullNameEnc: string } | null }) =>
  u.profile ? dec.fullName(u.id, u.profile.fullNameEnc) : "";

async function newCode(): Promise<string> {
  for (;;) {
    const code = makeCode(randomInt);
    if (!(await db.certificate.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
}

/**
 * Issues the certificate for a completed enrolment (idempotent: returns the active one if it
 * exists). Everything printed is frozen now: name, course, trainers, accreditation.
 */
export async function issueCertificate(enrolmentId: string, opts: { notify?: boolean } = {}) {
  const existing = await db.certificate.findFirst({ where: { enrolmentId, revokedAt: null } });
  if (existing) return existing;

  const e = await db.enrolment.findUniqueOrThrow({
    where: { id: enrolmentId },
    include: {
      user: {
        select: { id: true, emailEnc: true, status: true, profile: { select: { fullNameEnc: true } } },
      },
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          estMinutes: true,
          accreditation: true,
          staff: {
            where: { user: { roles: { some: { role: "TRAINER" } } } },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: { user: { select: { id: true, profile: { select: { fullNameEnc: true } } } } },
          },
        },
      },
    },
  });
  if (e.status !== "COMPLETED" || !e.completedAt) throw new AssessmentError("The course isn't complete yet.");
  if (e.user.status === "DELETED") throw new AssessmentError("This account has been deleted.");

  const code = await newCode();
  const holder: Holder = {
    learnerName: fullName(e.user),
    trainers: e.course.staff.map((s) => fullName(s.user)).filter(Boolean),
  };
  const accreditation = accreditationFor(await accreditationSettings(), e.course.accreditation);

  let cert;
  try {
    cert = await db.certificate.create({
      data: {
        code,
        enrolmentId,
        userId: e.userId,
        courseId: e.courseId,
        holderEnc: sealHolder(code, holder),
        courseTitle: e.course.title,
        category: e.course.category,
        durationMinutes: e.course.estMinutes,
        completedAt: e.completedAt,
        accreditation: (accreditation ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Two completions racing: the partial unique index lets only one through.
    const again = await db.certificate.findFirst({ where: { enrolmentId, revokedAt: null } });
    if (again) return again;
    throw err;
  }
  await audit({
    actorId: null,
    action: "certificate.issued",
    entityType: "Certificate",
    entityId: cert.id,
    meta: { code, enrolmentId },
  });

  if (opts.notify !== false) {
    const href = "/account/certificates";
    await notify([e.userId], {
      type: "CERTIFICATE",
      title: `Your certificate for ${e.course.title} is ready`,
      href,
    });
    try {
      await sendEmail(
        certificateEmail({
          to: dec.email(e.user.id, e.user.emailEnc),
          name: holder.learnerName.split(" ")[0] || holder.learnerName,
          course: e.course.title,
          url: `${env().APP_URL}${href}`,
        }),
      );
    } catch (err) {
      console.error("[certificate] email failed", cert.id, err);
    }
  }
  return cert;
}

/** Issues certificates for completed enrolments that never had one (e.g. completed before Phase 6). */
export async function backfillCertificates(where: Prisma.EnrolmentWhereInput = {}) {
  const missing = await db.enrolment.findMany({
    where: {
      ...where,
      status: "COMPLETED",
      completedAt: { not: null },
      certificates: { none: {} },
      user: { status: { not: "DELETED" } },
    },
    select: { id: true },
    take: 500,
  });
  for (const m of missing) await issueCertificate(m.id, { notify: false });
  return missing.length;
}

export async function myCertificates(userId: string) {
  await backfillCertificates({ userId });
  return db.certificate.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    select: {
      code: true,
      courseTitle: true,
      category: true,
      completedAt: true,
      issuedAt: true,
      revokedAt: true,
      course: { select: { slug: true } },
    },
  });
}

/** The active certificate for one of the learner's own enrolments, if any. */
export async function certificateForEnrolment(userId: string, courseId: string) {
  const e = await db.enrolment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true, status: true },
  });
  if (!e || e.status !== "COMPLETED") return null;
  return (
    (await db.certificate.findFirst({
      where: { enrolmentId: e.id, revokedAt: null },
      select: { code: true },
    })) ?? issueCertificate(e.id, { notify: false }).then((c) => ({ code: c.code }))
  );
}

export interface CertificateDocument {
  code: string;
  learnerName: string;
  trainers: string[];
  courseTitle: string;
  category: "HEALTH_SAFETY" | "AI_DIGITAL";
  durationMinutes: number | null;
  completedAt: Date;
  issuedAt: Date;
  academyName: string;
  wording: ReturnType<typeof certificateWording>;
  verifyUrl: string;
}

/**
 * The PDF may be downloaded by the holder, a Super Admin, or a Client Manager of the company
 * that enrolled them. Revoked certificates can't be downloaded.
 */
export async function certificateForDownload(actor: Actor, rawCode: string): Promise<CertificateDocument> {
  const code = normaliseCode(rawCode);
  const cert = code
    ? await db.certificate.findUnique({
        where: { code },
        include: { enrolment: { select: { organizationId: true } } },
      })
    : null;
  if (!cert || cert.revokedAt || !cert.holderEnc) throw new PermissionError();
  const orgId = cert.enrolment?.organizationId;
  const allowed =
    cert.userId === actor.id ||
    isSuperAdmin(actor.roles) ||
    (orgId ? canAccessOrg(actor.roles, orgId) : false);
  if (!allowed) throw new PermissionError();
  if (cert.userId !== actor.id) {
    await audit({
      actorId: actor.id,
      action: "certificate.downloaded",
      entityType: "Certificate",
      entityId: cert.id,
      orgId: orgId ?? null,
      fields: ["fullName"],
    });
  }
  return toDocument(cert, openHolder(cert.code, cert.holderEnc)!);
}

async function toDocument(
  cert: {
    code: string;
    courseTitle: string;
    category: "HEALTH_SAFETY" | "AI_DIGITAL";
    durationMinutes: number | null;
    completedAt: Date;
    issuedAt: Date;
    accreditation: unknown;
  },
  holder: Holder,
): Promise<CertificateDocument> {
  return {
    code: cert.code,
    learnerName: holder.learnerName,
    trainers: holder.trainers,
    courseTitle: cert.courseTitle,
    category: cert.category,
    durationMinutes: cert.durationMinutes,
    completedAt: cert.completedAt,
    issuedAt: cert.issuedAt,
    academyName: (await siteSettings()).academyName,
    wording: certificateWording(cert.accreditation),
    verifyUrl: `${env().APP_URL}/verify/${cert.code}`,
  };
}

export type Verification =
  | { status: "invalid" }
  | { status: "revoked"; code: string; revokedAt: Date; courseTitle: string }
  | ({ status: "valid" } & Omit<CertificateDocument, "trainers" | "verifyUrl">);

/**
 * Public check. Shows the holder's full name (agreed with YARI GROUP, as on comparable
 * certificate services) but not trainers, contact details or the reason for a revocation.
 */
export async function verifyCertificate(rawCode: string): Promise<Verification> {
  const code = normaliseCode(rawCode);
  if (!code) return { status: "invalid" };
  const cert = await db.certificate.findUnique({ where: { code } });
  if (!cert) return { status: "invalid" };
  if (cert.revokedAt || !cert.holderEnc) {
    return {
      status: "revoked",
      code,
      revokedAt: cert.revokedAt ?? cert.issuedAt,
      courseTitle: cert.courseTitle,
    };
  }
  const doc = await toDocument(cert, openHolder(code, cert.holderEnc)!);
  // Trainers' names and the internal link are for the PDF only.
  return {
    status: "valid",
    code: doc.code,
    learnerName: doc.learnerName,
    courseTitle: doc.courseTitle,
    category: doc.category,
    durationMinutes: doc.durationMinutes,
    completedAt: doc.completedAt,
    issuedAt: doc.issuedAt,
    academyName: doc.academyName,
    wording: doc.wording,
  };
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

function assertAdmin(actor: Actor) {
  if (!isSuperAdmin(actor.roles)) throw new PermissionError();
}

export async function adminCertificates(actor: Actor, query: string) {
  assertAdmin(actor);
  const code = normaliseCode(query);
  const q = query.trim();
  const rows = await db.certificate.findMany({
    where: code ? { code } : q ? { courseTitle: { contains: q, mode: "insensitive" } } : {},
    orderBy: { issuedAt: "desc" },
    take: 100,
  });
  if (rows.length) {
    await audit({
      actorId: actor.id,
      action: "pii.viewed",
      entityType: "CertificateList",
      entityId: null,
      fields: ["fullName"],
      meta: { count: rows.length, query: q.slice(0, 60) },
    });
  }
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    learnerName: openHolder(r.code, r.holderEnc)?.learnerName ?? "Erased",
    courseTitle: r.courseTitle,
    completedAt: r.completedAt,
    issuedAt: r.issuedAt,
    revokedAt: r.revokedAt,
    revokeReason: r.revokeReason,
    accredited: certificateWording(r.accreditation).accredited,
    reissuable: Boolean(r.enrolmentId) && !r.revokedAt,
  }));
}

export async function revokeCertificate(actor: Actor, rawCode: string, reason: string) {
  assertAdmin(actor);
  const why = reason.trim();
  if (why.length < 3) throw new AssessmentError("Give a reason for revoking.");
  const code = normaliseCode(rawCode);
  const cert = code ? await db.certificate.findUnique({ where: { code } }) : null;
  if (!cert || cert.revokedAt) throw new AssessmentError("Certificate not found or already revoked.");
  await db.certificate.update({
    where: { id: cert.id },
    data: { revokedAt: new Date(), revokedById: actor.id, revokeReason: why.slice(0, 500) },
  });
  await audit({
    actorId: actor.id,
    action: "certificate.revoked",
    entityType: "Certificate",
    entityId: cert.id,
    meta: { code, reason: why },
  });
  return cert;
}

/** Replaces a certificate with a fresh one (e.g. after a name correction). The old code stops verifying. */
export async function reissueCertificate(actor: Actor, rawCode: string) {
  const old = await revokeCertificate(actor, rawCode, "Replaced by a reissued certificate");
  if (!old.enrolmentId) throw new AssessmentError("This certificate's enrolment no longer exists.");
  return issueCertificate(old.enrolmentId, { notify: false });
}

/** For account deletion (POPIA): revoke and erase the name from all of a person's certificates. */
export async function eraseCertificateHolder(userId: string) {
  await db.certificate.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: "Holder's account deleted" },
  });
  await db.certificate.updateMany({ where: { userId }, data: { holderEnc: null, userId: null } });
}
