"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { finishUploadAction, startUploadAction } from "@/server/actions/courses";
import { formatBytes, type FileRule } from "@/lib/file-types";
import { Notice } from "@/ui/primitives";
import { cn } from "@/ui/cn";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "checking" }
  | { kind: "error"; message: string };

/** Picks a file, uploads it straight to storage with progress, then has the server verify and virus-scan it. */
export function FileUploader({
  courseId,
  itemId,
  rule,
  label,
}: {
  courseId: string;
  itemId?: string;
  rule: FileRule;
  label: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function upload(file: File) {
    if (file.size > rule.maxBytes)
      return setPhase({
        kind: "error",
        message: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(rule.maxBytes)}.`,
      });
    const mime = file.type || guessMime(file.name);
    const start = await startUploadAction({ courseId, itemId, filename: file.name, mime, bytes: file.size });
    if (!start.ok) return setPhase({ kind: "error", message: start.error });

    setPhase({ kind: "uploading", pct: 0 });
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(start.target.method, start.target.url);
      for (const [k, v] of Object.entries(start.target.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) =>
        e.lengthComputable && setPhase({ kind: "uploading", pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok)
      return setPhase({
        kind: "error",
        message: "The upload didn't finish. Check your connection and try again.",
      });

    setPhase({ kind: "checking" });
    const done = await finishUploadAction({ courseId, assetId: start.assetId, itemId });
    if (!done.ok) return setPhase({ kind: "error", message: done.error ?? "Upload failed." });
    setPhase({ kind: "idle" });
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const busy = phase.kind === "uploading" || phase.kind === "checking";
  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        className={cn(
          "border-line-strong hover:bg-sunk flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-6 text-center",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <Upload className="text-muted size-5" aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="text-muted text-sm">{rule.label}</span>
      </label>
      <input
        id={inputId}
        ref={input}
        type="file"
        accept={rule.accept}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {phase.kind === "uploading" && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={phase.pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-line h-1">
            <div className="bg-accent h-1 transition-[width]" style={{ width: `${phase.pct}%` }} />
          </div>
          <p className="text-muted mt-1 font-mono text-xs">Uploading {phase.pct}%</p>
        </div>
      )}
      {phase.kind === "checking" && (
        <p className="text-muted font-mono text-xs" role="status">
          Checking the file for viruses…
        </p>
      )}
      {phase.kind === "error" && <Notice tone="danger">{phase.message}</Notice>}
    </div>
  );
}

// Some browsers leave File.type empty for less common extensions.
function guessMime(name: string) {
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
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
