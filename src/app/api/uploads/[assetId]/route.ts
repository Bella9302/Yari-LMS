import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { storage } from "@/server/storage";
import { LocalStorage, TooLargeError } from "@/server/storage/local";
import { verifyUploadSignature } from "@/server/storage/signing";

// Receives file bytes for the local storage driver. (With S3/R2 the browser uploads directly to the bucket.)
export async function PUT(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const url = new URL(request.url);
  if (
    !verifyUploadSignature(assetId, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")
  ) {
    return new Response("Upload link expired", { status: 403 });
  }
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in again", { status: 401 });

  const driver = storage();
  if (!(driver instanceof LocalStorage)) return new Response("Not found", { status: 404 });

  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.uploadedById !== session!.user.id || asset.scanStatus !== "PENDING") {
    return new Response("Not found", { status: 404 });
  }
  if (!request.body) return new Response("Empty upload", { status: 400 });

  try {
    await driver.write(asset.storageKey, Readable.fromWeb(request.body as WebReadableStream), asset.bytes);
  } catch (err) {
    if (err instanceof TooLargeError) return new Response("File larger than declared", { status: 413 });
    throw err;
  }
  return new Response(null, { status: 204 });
}
