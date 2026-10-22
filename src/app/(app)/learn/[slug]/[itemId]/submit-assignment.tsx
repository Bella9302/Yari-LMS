"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { submitAssignmentAction } from "@/server/actions/assessment";
import { formatBytes, SUBMISSION_RULE } from "@/lib/file-types";
import { initialFormState } from "@/lib/form-state";
import { Field, Textarea } from "@/ui/field";
import { FileUploader, type UploadedFile } from "@/ui/file-uploader";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";

export function SubmitAssignmentForm({
  slug,
  itemId,
  courseId,
  allowText,
  allowFiles,
  maxFiles,
}: {
  slug: string;
  itemId: string;
  courseId: string;
  allowText: boolean;
  allowFiles: boolean;
  maxFiles: number;
}) {
  const [state, action] = useActionState(submitAssignmentAction, initialFormState);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  if (state.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="border-line bg-surface space-y-5 border p-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="itemId" value={itemId} />
      {files.map((f) => (
        <input key={f.id} type="hidden" name="assetId" value={f.id} />
      ))}
      {allowText && (
        <Field label="Your answer" name="text" optional={allowFiles}>
          {(p) => <Textarea {...p} className="min-h-40" maxLength={50000} />}
        </Field>
      )}
      {allowFiles && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            Files {maxFiles > 1 && <span className="text-muted font-normal">(up to {maxFiles})</span>}
          </p>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                  <span className="text-muted font-mono text-xs">{formatBytes(f.bytes)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((x) => x.id !== f.id))}
                    aria-label={`Remove ${f.filename}`}
                    className="hover:bg-sunk inline-grid size-10 place-items-center rounded-sm"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length < maxFiles && (
            <FileUploader
              purpose="submission"
              courseId={courseId}
              itemId={itemId}
              rule={SUBMISSION_RULE}
              label="Add a document or a photo of your work"
              onUploaded={(f) => setFiles((prev) => [...prev, f])}
            />
          )}
        </div>
      )}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton size="lg" pendingLabel="Handing in…">
        Hand in
      </SubmitButton>
    </form>
  );
}
