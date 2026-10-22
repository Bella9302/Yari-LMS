"use client";

import { useActionState, useState } from "react";
import { saveMarkAction } from "@/server/actions/assessment";
import { FEEDBACK_FILE_RULE } from "@/lib/file-types";
import { initialFormState } from "@/lib/form-state";
import { AudioRecorder } from "@/ui/audio-recorder";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { FileUploader, type UploadedFile } from "@/ui/file-uploader";
import { Notice } from "@/ui/primitives";
import { SubmitButton } from "@/ui/submit-button";
import { cn } from "@/ui/cn";

interface Criterion {
  id: string;
  title: string;
  description: string;
  levels: { id: string; label: string; points: number; description: string }[];
}

export function GraderForm({
  courseId,
  itemId,
  submissionId,
  maxPoints,
  passPct,
  nextHref,
  rubric,
  mark,
}: {
  courseId: string;
  itemId: string;
  submissionId: string;
  maxPoints: number;
  passPct: number;
  nextHref: string;
  rubric: Criterion[] | null;
  mark: {
    score: number;
    selections: Record<string, string>;
    feedbackText: string;
    feedbackFile: { id: string; filename: string } | null;
    audioId: string | null;
    status: string;
  } | null;
}) {
  const [state, action] = useActionState(saveMarkAction, initialFormState);
  const [selections, setSelections] = useState<Record<string, string>>(mark?.selections ?? {});
  const [score, setScore] = useState(mark && !rubric ? String(mark.score) : "");
  const [file, setFile] = useState<UploadedFile | null>(
    mark?.feedbackFile ? { ...mark.feedbackFile, bytes: 0, mime: "" } : null,
  );
  const [audio, setAudio] = useState<UploadedFile | null>(
    mark?.audioId ? { id: mark.audioId, filename: "", bytes: 0, mime: "" } : null,
  );

  const rubricTotal = rubric
    ? rubric.reduce((sum, c) => sum + (c.levels.find((l) => l.id === selections[c.id])?.points ?? 0), 0)
    : null;
  const complete = rubric ? rubric.every((c) => selections[c.id]) : score !== "";
  const total = rubricTotal ?? (score === "" ? null : Number(score));
  const pct = total !== null && maxPoints > 0 ? Math.round((total / maxPoints) * 100) : null;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="nextHref" value={nextHref} />
      <input type="hidden" name="rubricSelections" value={JSON.stringify(selections)} />
      <input type="hidden" name="feedbackAssetId" value={file?.id ?? ""} />
      <input type="hidden" name="audioAssetId" value={audio?.id ?? ""} />

      {rubric ? (
        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">Rubric</legend>
          {rubric.map((c) => (
            <div key={c.id} role="radiogroup" aria-label={c.title} className="space-y-2">
              <p className="font-medium">{c.title}</p>
              {c.description && <p className="text-muted text-sm">{c.description}</p>}
              <div className="grid gap-1.5">
                {c.levels.map((l) => {
                  const on = selections[c.id] === l.id;
                  return (
                    <label
                      key={l.id}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-2 text-sm",
                        on ? "border-fg bg-accent text-ink" : "border-line hover:bg-sunk",
                      )}
                    >
                      <input
                        type="radio"
                        name={`level-${c.id}`}
                        checked={on}
                        onChange={() => setSelections({ ...selections, [c.id]: l.id })}
                        className="mt-0.5 size-4 accent-current"
                      />
                      <span className="flex-1">
                        <span className="font-medium">{l.label}</span>
                        {l.description && <span className="block opacity-80">{l.description}</span>}
                      </span>
                      <span className="font-mono">{l.points}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
      ) : (
        <Field label={`Mark (out of ${maxPoints})`} name="score">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={maxPoints}
              step="0.5"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="max-w-32 font-mono text-xl"
            />
          )}
        </Field>
      )}

      <div className="border-fg flex items-baseline justify-between border-y py-3" aria-live="polite">
        <span className="eyebrow">Total</span>
        <span className="font-mono">
          <span className="text-2xl">{total ?? "—"}</span> / {maxPoints}
          {pct !== null && (
            <span className={cn("ml-3", pct >= passPct ? "text-success" : "text-danger")}>
              {pct}% · {pct >= passPct ? "pass" : "below pass mark"}
            </span>
          )}
        </span>
      </div>

      <Field label="Written feedback" name="feedbackText" optional>
        {(p) => <Textarea {...p} defaultValue={mark?.feedbackText} className="min-h-32" maxLength={20000} />}
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">Audio note</p>
        <AudioRecorder courseId={courseId} itemId={itemId} value={audio} onChange={setAudio} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Feedback file</p>
        {file ? (
          <div className="flex items-center gap-2 text-sm">
            <a
              href={`/api/files/${file.id}`}
              target="_blank"
              rel="noopener"
              className="flex-1 truncate underline"
            >
              {file.filename || "Attached file"}
            </a>
            <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
              Remove
            </Button>
          </div>
        ) : (
          <FileUploader
            purpose="feedback"
            courseId={courseId}
            itemId={itemId}
            rule={FEEDBACK_FILE_RULE}
            label="Attach a marked-up copy or notes"
            onUploaded={setFile}
          />
        )}
      </div>

      {state.error && <Notice tone="danger">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="release" disabled={!complete} pendingLabel="Releasing…">
          Release &amp; next
        </SubmitButton>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingLabel="Saving…">
          Save draft
        </SubmitButton>
        <SubmitButton
          name="intent"
          value="return"
          variant="ghost"
          disabled={!complete}
          pendingLabel="Returning…"
        >
          Return for resubmission
        </SubmitButton>
      </div>
      {mark?.status === "RELEASED" && (
        <p className="text-muted text-xs">Already released — saving again updates what the learner sees.</p>
      )}
    </form>
  );
}
