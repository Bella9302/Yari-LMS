"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadFile, type UploadedFile } from "@/ui/upload-client";

export type { UploadedFile };
import { formatBytes, type FileRule, type UploadPurpose } from "@/lib/file-types";
import { Notice } from "@/ui/primitives";
import { cn } from "@/ui/cn";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "checking" }
  | { kind: "error"; message: string };

/** Picks a file, uploads it straight to storage with progress, then has the server verify and virus-scan it. */
export function FileUploader({
  purpose,
  courseId,
  itemId,
  rule,
  label,
  onUploaded,
  disabled,
}: {
  purpose: UploadPurpose;
  courseId: string;
  itemId?: string;
  rule: FileRule;
  label: string;
  /** Called with the verified file. Without it the page refreshes (the server attached the file). */
  onUploaded?: (file: UploadedFile) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function upload(file: File) {
    if (file.size > rule.maxBytes) {
      return setPhase({
        kind: "error",
        message: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(rule.maxBytes)}.`,
      });
    }
    setPhase({ kind: "uploading", pct: 0 });
    try {
      const asset = await uploadFile(file, {
        purpose,
        courseId,
        itemId,
        onProgress: (pct) => setPhase({ kind: "uploading", pct }),
        onChecking: () => setPhase({ kind: "checking" }),
      });
      setPhase({ kind: "idle" });
      if (input.current) input.current.value = "";
      if (onUploaded) onUploaded(asset);
      else router.refresh();
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message });
    }
  }

  const busy = phase.kind === "uploading" || phase.kind === "checking" || Boolean(disabled);
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
