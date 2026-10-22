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
import { COVER_RULE, ITEM_FILE_RULES, type FileRule } from "@/lib/file-types";

export class UploadError extends Error {}

export interface StartUploadInput {
  courseId: string;
  /** Set for item files; omitted for a course cover image. */
  itemId?: string;
  filename: string;
  mime: string;
  bytes: number;
}

function kindFor(mime: string): AssetKind {
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("image/")) return "IMAGE";
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
  await assertCanEditCourse(actor, input.courseId);
  let rule: FileRule = COVER_RULE;
  if (input.itemId) {
    const item = await db.item.findFirst({
      where: { id: input.itemId, module: { courseId: input.courseId } },
    });
    const itemRule = item && ITEM_FILE_RULES[item.type];
    if (!itemRule) throw new UploadError("This item doesn't take a file.");
    rule = itemRule;
  }
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
 * learners for whom an item using it is visible and unlocked.
 */
export async function canReadAsset(actor: Actor, assetId: string): Promise<boolean> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      uploadedById: true,
      items: { select: { id: true, module: { select: { course: { select: { id: true, slug: true } } } } } },
      coverOf: { select: { id: true, slug: true } },
    },
  });
  if (!asset) return false;
  if (isSuperAdmin(actor.roles) || asset.uploadedById === actor.id) return true;

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
