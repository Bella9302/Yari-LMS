import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getSubmissionForMarking } from "@/server/assessment/assignments";
import { formatBytes } from "@/lib/file-types";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { RichTextView } from "@/ui/rich-text-view";
import { Tag } from "@/ui/primitives";
import { GraderForm } from "./grader-form";

export const metadata: Metadata = { title: "Mark submission" };

export default async function GraderPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { user } = await requireUser();
  const { id, submissionId } = await params;
  const data = await getSubmissionForMarking({ id: user.id, roles: user.roles }, submissionId);
  const { submission, rubric } = data;
  const a = submission.assignment;
  const base = `/teach/courses/${id}/marking`;
  const nextHref = data.nextId ? `${base}/submission/${data.nextId}` : `${base}/${a.itemId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`${base}/${a.itemId}`} className="eyebrow hover:text-fg">
          ← {a.item.title}
        </Link>
        <nav aria-label="Learners" className="flex items-center gap-2">
          {data.prevId ? (
            <Link href={`${base}/submission/${data.prevId}`} className={buttonClasses("ghost", "sm")}>
              <ArrowLeft className="size-4" aria-hidden /> Previous
            </Link>
          ) : null}
          <span className="text-muted font-mono text-xs">
            {data.position > 0 ? `${data.position} of ${data.queueLength}` : "Earlier attempt"}
          </span>
          {data.nextId ? (
            <Link href={`${base}/submission/${data.nextId}`} className={buttonClasses("ghost", "sm")}>
              Next <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </nav>
      </div>

      <header className="border-line flex flex-wrap items-end gap-x-4 gap-y-2 border-b pb-4">
        <h2 className="font-display text-h2">{data.learnerName}</h2>
        <span className="text-muted">{data.organization ?? "Individual"}</span>
        <span className="text-muted font-mono text-xs">
          Attempt {submission.attemptNo} · {formatDateTime(submission.submittedAt)}
        </span>
        {submission.isLate && <Tag tone="danger">Late</Tag>}
        {submission.mark?.status === "RELEASED" && <Tag tone="success">Released</Tag>}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left: the learner's work. */}
        <section aria-label="Submitted work" className="min-w-0 space-y-4">
          {submission.text && (
            <div className="border-line bg-surface border p-5">
              <p className="eyebrow mb-3">Written answer</p>
              <p className="whitespace-pre-wrap">{submission.text}</p>
            </div>
          )}
          {submission.files.map(({ asset }) => {
            const url = `/api/files/${asset.id}`;
            return (
              <div key={asset.id} className="border-line bg-surface border">
                <div className="border-line flex flex-wrap items-center gap-3 border-b px-4 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{asset.filename}</span>
                  <span className="text-muted font-mono text-xs">{formatBytes(asset.bytes)}</span>
                  <a href={`${url}?download`} className={buttonClasses("ghost", "sm")}>
                    <Download className="size-4" aria-hidden /> Download
                  </a>
                </div>
                {asset.mime === "application/pdf" ? (
                  <>
                    <iframe
                      src={url}
                      title={asset.filename}
                      loading="lazy"
                      className="hidden h-[75vh] w-full md:block"
                    />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="block px-4 py-3 underline md:hidden"
                    >
                      Open PDF
                    </a>
                  </>
                ) : asset.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file
                  <img
                    src={url}
                    alt={`Submitted image: ${asset.filename}`}
                    loading="lazy"
                    className="max-h-[75vh] w-full object-contain"
                  />
                ) : (
                  <p className="text-muted px-4 py-3 text-sm">
                    No preview for this file type — download it to read.
                  </p>
                )}
              </div>
            );
          })}
          <details className="border-line border">
            <summary className="text-muted cursor-pointer px-4 py-3 text-sm">Assignment instructions</summary>
            <div className="border-line border-t p-4">
              {a.item.body ? <RichTextView doc={a.item.body} /> : null}
            </div>
          </details>
        </section>

        {/* Right: rubric and feedback (sticky on wide screens). */}
        <section aria-label="Mark and feedback" className="lg:sticky lg:top-24 lg:self-start">
          <GraderForm
            courseId={id}
            itemId={a.itemId}
            submissionId={submission.id}
            maxPoints={a.maxPoints}
            passPct={a.passPct}
            nextHref={nextHref}
            rubric={
              rubric
                ? rubric.criteria.map((c) => ({
                    id: c.id,
                    title: c.title,
                    description: c.description,
                    levels: c.levels,
                  }))
                : null
            }
            mark={
              submission.mark
                ? {
                    score: submission.mark.score,
                    selections: submission.mark.rubricSelections as Record<string, string>,
                    feedbackText: submission.mark.feedbackText ?? "",
                    feedbackFile: submission.mark.feedbackAsset,
                    audioId: submission.mark.audioAssetId,
                    status: submission.mark.status,
                  }
                : null
            }
          />
        </section>
      </div>
    </div>
  );
}
