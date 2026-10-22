import type { AssignmentOverview } from "@/server/assessment/assignments";
import { formatBytes } from "@/lib/file-types";
import { formatDateTime } from "@/lib/format";
import { Notice, Stat, Tag } from "@/ui/primitives";
import { RichTextView } from "@/ui/rich-text-view";
import { SubmitAssignmentForm } from "./submit-assignment";

export function AssignmentPanel({
  slug,
  itemId,
  courseId,
  instructions,
  data,
}: {
  slug: string;
  itemId: string;
  courseId: string;
  instructions: unknown;
  data: AssignmentOverview;
}) {
  const overdue = data.dueAt && new Date() > data.dueAt;
  return (
    <div className="space-y-8">
      {instructions ? <RichTextView doc={instructions} /> : null}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Stat
          label="Due"
          value={data.dueAt ? formatDateTime(data.dueAt).split(",")[0] : "—"}
          hint={data.dueAt ? formatDateTime(data.dueAt) : "No due date"}
        />
        <Stat label="Pass mark" value={`${data.passPct}%`} />
        <Stat label="Marks" value={data.maxPoints} hint={data.rubric ? "Marked with a rubric" : undefined} />
      </div>

      {data.rubric && (
        <details className="border-line border">
          <summary className="cursor-pointer px-4 py-3 font-medium">How this will be marked</summary>
          <div className="border-line space-y-4 border-t p-4">
            {data.rubric.criteria.map((c) => (
              <div key={c.id}>
                <p className="font-medium">{c.title}</p>
                {c.description && <p className="text-muted text-sm">{c.description}</p>}
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
                  {c.levels.map((l) => (
                    <li key={l.id} className="border-line border px-3 py-2">
                      <span className="font-mono">{l.points}</span> · {l.label}
                      {l.description && <span className="text-muted block">{l.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {data.grade.passed && (
        <Notice tone="success" title={`Passed — ${Math.round(data.grade.scorePct ?? 0)}%`}>
          This item is complete.
        </Notice>
      )}

      {data.canSubmit ? (
        <section aria-labelledby="hand-in-heading" className="space-y-3">
          <h2 id="hand-in-heading" className="font-display text-h2">
            {data.submissions.length ? "Hand in again" : "Hand in your work"}
          </h2>
          {overdue && (
            <Notice tone="danger">
              The due date has passed. You can still hand in, but it will be marked as late.
            </Notice>
          )}
          <SubmitAssignmentForm
            slug={slug}
            itemId={itemId}
            courseId={courseId}
            allowText={data.allowText}
            allowFiles={data.allowFiles}
            maxFiles={data.maxFiles}
          />
        </section>
      ) : (
        data.blockedReason &&
        !data.grade.passed && (
          <Notice tone={data.submissions[0]?.status === "SUBMITTED" ? "success" : "neutral"}>
            {data.blockedReason}
          </Notice>
        )
      )}

      {data.submissions.length > 0 && (
        <section aria-labelledby="history-heading" className="space-y-4">
          <h2 id="history-heading" className="font-display text-h2">
            Your submissions
          </h2>
          {data.submissions.map((s) => (
            <article key={s.id} className="border-line bg-surface border">
              <header className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-3">
                <span className="text-muted font-mono text-sm">#{s.attemptNo}</span>
                <span className="flex-1 text-sm">{formatDateTime(s.submittedAt)}</span>
                {s.isLate && <Tag tone="danger">Late</Tag>}
                {s.feedback ? (
                  <span className="font-mono">
                    {s.feedback.score} / {s.feedback.maxPoints}
                  </span>
                ) : (
                  <Tag>{s.status === "RETURNED" ? "Returned" : "Waiting to be marked"}</Tag>
                )}
              </header>
              <div className="space-y-3 p-4">
                {s.text && <p className="whitespace-pre-wrap">{s.text}</p>}
                {s.files.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {s.files.map((f) => (
                      <li key={f.id}>
                        <a
                          href={`/api/files/${f.id}`}
                          target="_blank"
                          rel="noopener"
                          className="underline underline-offset-4"
                        >
                          {f.filename}
                        </a>{" "}
                        <span className="text-muted font-mono text-xs">{formatBytes(f.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.feedback && (
                  <div className="border-line space-y-3 border-t pt-3">
                    <p className="eyebrow">Feedback</p>
                    {s.feedback.rubric.length > 0 && (
                      <ul className="space-y-1 text-sm">
                        {s.feedback.rubric.map((r) => (
                          <li key={r.criterion} className="flex justify-between gap-3">
                            <span>
                              {r.criterion}: <strong className="font-medium">{r.level}</strong>
                            </span>
                            <span className="font-mono">
                              {r.points}/{r.max}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.feedback.text && <p className="whitespace-pre-wrap">{s.feedback.text}</p>}
                    {s.feedback.audioId && (
                      <audio
                        src={`/api/files/${s.feedback.audioId}`}
                        controls
                        preload="none"
                        className="w-full"
                        aria-label="Audio feedback"
                      />
                    )}
                    {s.feedback.file && (
                      <a
                        href={`/api/files/${s.feedback.file.id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-sm underline underline-offset-4"
                      >
                        Feedback file: {s.feedback.file.filename}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
