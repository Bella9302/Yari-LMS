import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { env } from "@/server/env";
import { isSuperAdmin } from "@/server/rbac";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { hashIp } from "@/server/crypto/blind-index";
import {
  aad,
  decryptField,
  decryptOptional,
  encryptField,
  encryptOptional,
} from "@/server/crypto/field-encryption";
import { dec } from "@/server/pii/fields";
import { PermissionError, type Actor } from "@/server/pii/users";
import { notify } from "@/server/engagement/notifications";
import { sendEmailBatch } from "@/server/email/send";
import { enquiryEmail } from "@/server/email/templates";

export const INTEREST_LABELS = {
  SHE: "Health & Safety",
  TECH: "AI & Digital",
  BOTH: "Both",
} as const;

export const ENQUIRY_STATUS_TONE = { NEW: "accent", CONTACTED: "neutral", CLOSED: "success" } as const;

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine(
      (v) => v === "" || /^[+0-9 ()-]{7,30}$/.test(v),
      "Enter a valid phone number, or leave it blank.",
    ),
  company: z.string().trim().max(160),
  interest: z.enum(["SHE", "TECH", "BOTH"], { message: "Choose what you're interested in." }),
  courseId: z.string().trim().max(40),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000),
  consent: z.literal(true, { message: "Please agree so we can reply to you." }),
});
export type EnquiryInput = z.input<typeof enquirySchema>;

export class EnquiryRejected extends Error {}

const ctx = (id: string, field: string) => aad("Enquiry", field, id);

/**
 * Stores an enquiry from the public form. Contact details and the message are encrypted, and
 * the people who handle enquiries are told there is one, without the details leaving the platform.
 */
export async function submitEnquiry(raw: unknown, ip: string | null) {
  const input = enquirySchema.parse(raw);
  if (!(await consumeRateLimit(`enquiry:${hashIp(ip) ?? "unknown"}`, 5, 60 * 60_000))) {
    throw new EnquiryRejected(
      "We've received several enquiries from your connection. Please try again later.",
    );
  }
  const course = input.courseId
    ? await db.course.findFirst({
        where: { id: input.courseId, status: "PUBLISHED", visibility: "PUBLIC", isTemplate: false },
        select: { id: true, title: true },
      })
    : null;
  const id = randomUUID();
  await db.enquiry.create({
    data: {
      id,
      nameEnc: encryptField(input.name, ctx(id, "name")),
      emailEnc: encryptField(input.email, ctx(id, "email")),
      phoneEnc: encryptOptional(input.phone || null, ctx(id, "phone")),
      company: input.company || null,
      interest: input.interest,
      courseId: course?.id ?? null,
      messageEnc: encryptField(input.message, ctx(id, "message")),
      consentAt: new Date(),
    },
  });
  await audit({
    actorId: null,
    action: "enquiry.received",
    entityType: "Enquiry",
    entityId: id,
    meta: { interest: input.interest },
  });

  const admins = await db.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
    select: { id: true, emailEnc: true },
  });
  const href = `/admin/enquiries/${id}`;
  const from = input.company || "a member of the public";
  await notify(
    admins.map((a) => a.id),
    { type: "ENQUIRY", title: `New enquiry from ${from} (${INTEREST_LABELS[input.interest]})`, href },
  );
  try {
    await sendEmailBatch(
      admins.map((a) =>
        enquiryEmail({
          to: dec.email(a.id, a.emailEnc),
          from,
          interest: INTEREST_LABELS[input.interest],
          course: course?.title ?? null,
          url: `${env().APP_URL}${href}`,
        }),
      ),
    );
  } catch (err) {
    console.error("[enquiry] email failed", id, err);
  }
  return { id };
}

function assertAdmin(actor: Actor) {
  if (!isSuperAdmin(actor.roles)) throw new PermissionError();
}

type Row = Awaited<ReturnType<typeof db.enquiry.findFirstOrThrow>> & { course: { title: string } | null };

function open(e: Row) {
  return {
    id: e.id,
    name: decryptField(e.nameEnc, ctx(e.id, "name")),
    email: decryptField(e.emailEnc, ctx(e.id, "email")),
    phone: decryptOptional(e.phoneEnc, ctx(e.id, "phone")),
    company: e.company,
    interest: e.interest,
    course: e.course?.title ?? null,
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function listEnquiries(actor: Actor, status?: "NEW" | "CONTACTED" | "CLOSED") {
  assertAdmin(actor);
  const rows = await db.enquiry.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { course: { select: { title: true } } },
  });
  if (rows.length) {
    await audit({
      actorId: actor.id,
      action: "pii.viewed",
      entityType: "EnquiryList",
      entityId: null,
      fields: ["fullName", "email"],
      meta: { count: rows.length },
    });
  }
  return rows.map(open);
}

export async function getEnquiry(actor: Actor, id: string) {
  assertAdmin(actor);
  const e = await db.enquiry.findUnique({ where: { id }, include: { course: { select: { title: true } } } });
  if (!e) return null;
  await audit({
    actorId: actor.id,
    action: "pii.viewed",
    entityType: "Enquiry",
    entityId: id,
    fields: ["fullName", "email", "phone"],
  });
  return { ...open(e), message: decryptField(e.messageEnc, ctx(e.id, "message")) };
}

export async function setEnquiryStatus(actor: Actor, id: string, status: "NEW" | "CONTACTED" | "CLOSED") {
  assertAdmin(actor);
  await db.enquiry.update({ where: { id }, data: { status, handledById: actor.id } });
  await audit({
    actorId: actor.id,
    action: "enquiry.updated",
    entityType: "Enquiry",
    entityId: id,
    meta: { status },
  });
}

export async function deleteEnquiry(actor: Actor, id: string) {
  assertAdmin(actor);
  await db.enquiry.delete({ where: { id } });
  await audit({
    actorId: actor.id,
    action: "enquiry.updated",
    entityType: "Enquiry",
    entityId: id,
    meta: { deleted: true },
  });
}
