import { Readable } from "node:stream";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { storage } from "@/server/storage";
import { canReadAsset } from "@/server/storage/assets";
import { contentDisposition } from "@/server/storage/s3";
import { INLINE_MIMES } from "@/lib/file-types";

const notFound = () => new Response("Not found", { status: 404 });

/** Serves an uploaded file after checking the viewer may see it. Supports byte ranges (video seeking). */
export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in", { status: 401 });

  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || !["CLEAN", "SKIPPED"].includes(asset.scanStatus)) return notFound();
  if (!(await canReadAsset({ id: session!.user.id, roles: session!.user.roles }, assetId))) return notFound();

  const forceDownload = new URL(request.url).searchParams.has("download");
  const inline = INLINE_MIMES.has(asset.mime) && !forceDownload;

  const direct = await storage().directDownloadUrl(asset.storageKey, {
    filename: asset.filename,
    contentType: asset.mime,
    inline,
  });
  if (direct) return Response.redirect(direct, 302);

  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Content-Disposition": contentDisposition(asset.filename, inline),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    // Downloads get a sandbox so they can never run as a page on our origin. (Inline types are
    // limited to PDF/image/video and verified by content; Chrome won't render PDFs when sandboxed.)
    // Inline files (PDFs in the item viewer) may only be framed by our own pages.
    "Content-Security-Policy": inline ? "frame-ancestors 'self'" : "sandbox; default-src 'none'",
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const size = asset.bytes;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end)
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = await storage().read(asset.storageKey, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = await storage().read(asset.storageKey);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(asset.bytes) },
  });
}
