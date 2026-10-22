"use client";

import { finishUploadAction, startUploadAction } from "@/server/actions/uploads";
import type { UploadPurpose } from "@/lib/file-types";

export interface UploadedFile {
  id: string;
  filename: string;
  bytes: number;
  mime: string;
}

/**
 * Uploads straight to storage (presigned S3 URL or the signed local route), then asks the
 * server to verify and virus-scan the file. Throws an Error with a user-facing message.
 */
export async function uploadFile(
  file: File,
  opts: {
    purpose: UploadPurpose;
    courseId: string;
    itemId?: string;
    mime?: string;
    onProgress?: (pct: number) => void;
    onChecking?: () => void;
  },
): Promise<UploadedFile> {
  const mime = opts.mime ?? (file.type || guessMime(file.name));
  const start = await startUploadAction({
    purpose: opts.purpose,
    courseId: opts.courseId,
    itemId: opts.itemId,
    filename: file.name,
    mime,
    bytes: file.size,
  });
  if (!start.ok) throw new Error(start.error);

  const ok = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(start.target.method, start.target.url);
    for (const [k, v] of Object.entries(start.target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
  if (!ok) throw new Error("The upload didn't finish. Check your connection and try again.");

  opts.onChecking?.();
  const done = await finishUploadAction({
    purpose: opts.purpose,
    courseId: opts.courseId,
    assetId: start.assetId,
    itemId: opts.itemId,
  });
  if (!done.ok) throw new Error(done.error);
  return done.asset;
}

// Some browsers leave File.type empty for less common extensions.
export function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    mp4: "video/mp4",
    webm: "video/webm",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
