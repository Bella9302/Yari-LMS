import "server-only";
import { createHash } from "node:crypto";
import { PassThrough, type Readable } from "node:stream";
import type { AssetKind } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { isSuperAdmin } from "@/server/rbac";
import type { Actor } from "@/server/pii/users";
import { assertCanEditCourse, canEditCourse } from "@/server/courses/access";
import { getLearnerItem } from "@/server/courses/learner";
import { storage } from "@/server/storage";
import type { UploadTarget } from "@/server/storage/driver";
import { contentMatchesType, SNIFF_BYTES } from "@/server/storage/sniff";
import { scanStream } from "@/server/storage/clamav";
import {
  AUDIO_RULE,
  COVER_RULE,
  FEEDBACK_FILE_RULE,
  ITEM_FILE_RULES,
  SUBMISSION_RULE,
  type FileRule,
  type UploadPurpose,
} from "@/lib/file-types";

export class UploadError extends Error {}

export interface StartUploadInput {
  purpose: UploadPurpose;
  courseId: string;
  /** The item the file belongs to (item files, assignment submissions, feedback). */
  itemId?: string;
  filename: string;
  mime: string;
  bytes: number;
}

function kindFor(mime: string): AssetKind {
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime === "application/pdf") return "DOCUMENT";
  return "FILE";
}

function cleanFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 120) || "file";
}

export async function startUpload(
  actor: Actor,
  input: StartUploadInput,
): Promise<{ assetId: string; target: UploadTarget }> {
  const rule = await ruleFor(actor, input);
  if (!rule.mimes.includes(input.mime))
    throw new UploadError(`That file type isn't allowed here. Use: ${rule.label}.`);
  if (!Number.isInteger(input.bytes) || input.bytes <= 0) throw new UploadError("That file is empty.");
  if (input.bytes > rule.maxBytes) throw new UploadError(`That file is too large. Use: ${rule.label}.`);

  const asset = await db.asset.create({
    data: {
      storageKey: `uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}`,
      filename: cleanFilename(input.filename),
      mime: input.mime,
      kind: kindFor(input.mime),
      bytes: input.bytes,
      uploadedById: actor.id,
    },
  });
  const target = await storage().createUploadTarget(asset.storageKey, {
    assetId: asset.id,
    contentType: asset.mime,
    bytes: asset.bytes,
  });
  return { assetId: asset.id, target };
}

/** Checks the uploader may upload for this purpose and returns the file rule that applies. */
async function ruleFor(actor: Actor, input: StartUploadInput): Promise<FileRule> {
  const item = input.itemId
    ? await db.item.findFirst({
        where: { id: input.itemId, module: { courseId: input.courseId } },
        include: { assignment: true, module: { select: { course: { select: { slug: true } } } } },
      })
    : null;
  if (input.itemId && !item) throw new UploadError("That item no longer exists.");

  switch (input.purpose) {
    case "cover":
      await assertCanEditCourse(actor, input.courseId);
      return COVER_RULE;
    case "item": {
      await assertCanEditCourse(actor, input.courseId);
      const rule = item && ITEM_FILE_RULES[item.type];
      if (!rule) throw new UploadError("This item doesn't take a file.");
      return rule;
    }
    case "feedback":
    case "audio":
      await assertCanEditCourse(actor, input.courseId);
      if (item?.type !== "ASSIGNMENT") throw new UploadError("Feedback files belong to an assignment.");
      return input.purpose === "audio" ? AUDIO_RULE : FEEDBACK_FILE_RULE;
    case "submission": {
      // Learners: enrolled, item unlocked and accepting files.
      if (!item?.assignment?.allowFiles) throw new UploadError("This assignment doesn't take files.");
      const view = await getLearnerItem(actor, item.module.course.slug, item.id);
      if (!view || view.course.preview || !view.item.lock.unlocked || !view.course.enrolment) {
        throw new UploadError("You can't hand in work for this item.");
      }
      return SUBMISSION_RULE;
    }
  }
}

async function readHead(stream: Readable, n: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
    total += (chunk as Buffer).length;
    if (total >= n) break;
  }
  stream.destroy();
  return Buffer.concat(chunks).subarray(0, n);
}

/**
 * Verifies the uploaded bytes (size, real file type) and virus-scans them.
 * Files are only served once their status is CLEAN (or SKIPPED in development).
 */
export async function finishUpload(actor: Actor, assetId: string) {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.uploadedById !== actor.id) throw new UploadError("Upload not found.");
  if (asset.scanStatus !== "PENDING") return asset;

  const reject = async (detail: string, status: "INFECTED" | "FAILED" = "FAILED") => {
    await storage()
      .delete(asset.storageKey)
      .catch(() => {});
    const updated = await db.asset.update({
      where: { id: assetId },
      data: { scanStatus: status, scanDetail: detail, scannedAt: new Date() },
    });
    await audit({
      actorId: actor.id,
      action: "asset.rejected",
      entityType: "Asset",
      entityId: assetId,
      meta: { status, detail },
    });
    return updated;
  };

  const size = await storage().size(asset.storageKey);
  if (size === null) throw new UploadError("The file didn't finish uploading. Try again.");
  if (size !== asset.bytes) return reject("Size doesn't match the declared size");

  const head = await readHead(await storage().read(asset.storageKey), SNIFF_BYTES);
  if (!contentMatchesType(asset.mime, head)) return reject("File contents don't match its type");

  // One pass: hash and scan from the same stream.
  const { CLAMAV_HOST, CLAMAV_PORT } = env();
  const hash = createHash("sha256");
  const source = await storage().read(asset.storageKey);
  const tee = new PassThrough();
  source.on("data", (c) => hash.update(c));
  source.on("error", (e) => tee.destroy(e));
  source.pipe(tee);

  let status: "CLEAN" | "SKIPPED" = "SKIPPED";
  let detail: string | null = "No virus scanner configured (development)";
  if (CLAMAV_HOST) {
    try {
      const result = await scanStream(tee, { host: CLAMAV_HOST, port: CLAMAV_PORT });
      if (!result.clean) return reject(`Virus found: ${result.signature}`, "INFECTED");
      status = "CLEAN";
      detail = null;
    } catch (err) {
      return reject(`Scan failed: ${(err as Error).message}`);
    }
  } else {
    for await (const chunk of tee) void chunk; // drain to finish the hash
  }

  const updated = await db.asset.update({
    where: { id: assetId },
    data: { scanStatus: status, scanDetail: detail, scannedAt: new Date(), sha256: hash.digest("hex") },
  });
  await audit({
    actorId: actor.id,
    action: "asset.uploaded",
    entityType: "Asset",
    entityId: assetId,
    meta: { mime: asset.mime, bytes: asset.bytes, status },
  });
  return updated;
}

/**
 * Who may download a file: admins; its uploader; staff of a course using it;
 * learners for whom an item using it is visible and unlocked; for handed-in work and
 * feedback, see the comments below.
 */
export async function canReadAsset(actor: Actor, assetId: string): Promise<boolean> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      uploadedById: true,
      items: { select: { id: true, module: { select: { course: { select: { id: true, slug: true } } } } } },
      coverOf: { select: { id: true, slug: true } },
      submissionFiles: {
        select: { submission: { select: { enrolment: { select: { userId: true, courseId: true } } } } },
      },
      feedbackFor: {
        select: {
          status: true,
          submission: { select: { enrolment: { select: { userId: true, courseId: true } } } },
        },
      },
      audioFor: {
        select: {
          status: true,
          submission: { select: { enrolment: { select: { userId: true, courseId: true } } } },
        },
      },
    },
  });
  if (!asset) return false;
  if (isSuperAdmin(actor.roles) || asset.uploadedById === actor.id) return true;

  // Handed-in work: the learner who submitted it, and the course's trainers.
  for (const f of asset.submissionFiles) {
    const e = f.submission.enrolment;
    if (e.userId === actor.id || (await canEditCourse(actor, e.courseId))) return true;
  }
  // Feedback: the course's trainers, and the learner once the mark is released.
  for (const m of [...asset.feedbackFor, ...asset.audioFor]) {
    const e = m.submission.enrolment;
    if ((e.userId === actor.id && m.status === "RELEASED") || (await canEditCourse(actor, e.courseId)))
      return true;
  }

  const courseIds = new Set([
    ...asset.items.map((i) => i.module.course.id),
    ...asset.coverOf.map((c) => c.id),
  ]);
  for (const courseId of courseIds) if (await canEditCourse(actor, courseId)) return true;

  for (const cover of asset.coverOf) {
    const enrolled = await db.enrolment.findFirst({
      where: { courseId: cover.id, userId: actor.id, status: { not: "WITHDRAWN" } },
    });
    if (enrolled) return true;
  }
  for (const item of asset.items) {
    const view = await getLearnerItem(actor, item.module.course.slug, item.id);
    if (view && !view.course.preview && view.item.lock.unlocked) return true;
  }
  return false;
}
