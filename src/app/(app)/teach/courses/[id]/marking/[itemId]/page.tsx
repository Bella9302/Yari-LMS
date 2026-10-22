import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { getMarkingQueue } from "@/server/assessment/assignments";
import { dec } from "@/server/pii/fields";
import { formatDateTime } from "@/lib/format";
import { DataTable } from "@/ui/data-table";
import { EmptyState, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Marking queue" };

export default async function MarkingQueuePage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const { id, itemId } = await params;
  await getEditableCourse(actor, id);
  const item = await db.item.findFirst({
    where: { id: itemId, module: { courseId: id } },
    select: { title: true, type: true },
  });
  if (!item || (item.type !== "QUIZ" && item.type !== "ASSIGNMENT")) notFound();
  const base = `/teach/courses/${id}/marking`;

  if (item.type === "ASSIGNMENT") {
    const queue = await getMarkingQueue(actor, itemId);
    return (
      <div className="space-y-6">
        <Link href={base} className="eyebrow hover:text-fg">
          ← Marking
        </Link>
        <h2 className="font-display text-h2">{item.title}</h2>
        {queue.length === 0 ? (
          <EmptyState title="No submissions yet" />
        ) : (
          <DataTable
            caption="Submissions"
            rows={queue}
            rowKey={(r) => r.submissionId}
            columns={[
              {
                key: "learner",
                header: "Learner",
                cell: (r) => (
                  <Link
                    href={`${base}/submission/${r.submissionId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.learnerName}
                  </Link>
                ),
              },
              {
                key: "when",
                header: "Handed in",
                cell: (r) => <span className="font-mono text-sm">{formatDateTime(r.submittedAt)}</span>,
              },
              {
                key: "attempt",
                header: "Attempt",
                cell: (r) => <span className="font-mono">{r.attemptNo}</span>,
                hideOnMobile: true,
              },
              {
                key: "status",
                header: "Status",
                cell: (r) => (
                  <span className="flex flex-wrap gap-1.5">
                    {r.status === "SUBMITTED" && r.markStatus !== "RELEASED" ? (
                      <Tag tone="accent">{r.markStatus === "DRAFT" ? "Draft mark" : "To mark"}</Tag>
                    ) : r.status === "RETURNED" ? (
                      <Tag>Returned</Tag>
                    ) : (
                      <Tag tone="success">Marked{r.score !== null ? ` · ${r.score}` : ""}</Tag>
                    )}
                    {r.isLate && <Tag tone="danger">Late</Tag>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
    );
  }

  const attempts = await db.quizAttempt.findMany({
    where: {
      quizId: itemId,
      status: { in: ["NEEDS_MARKING", "MARKED"] },
      enrolment: { status: { not: "WITHDRAWN" } },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    take: 200,
    include: {
      enrolment: { select: { user: { select: { id: true, profile: { select: { fullNameEnc: true } } } } } },
    },
  });
  const needs = attempts.filter((a) => a.status === "NEEDS_MARKING");
  return (
    <div className="space-y-6">
      <Link href={base} className="eyebrow hover:text-fg">
        ← Marking
      </Link>
      <h2 className="font-display text-h2">{item.title}</h2>
      <p className="text-muted">
        Quizzes mark themselves. Attempts appear here when a short answer didn&apos;t match an accepted
        answer.
      </p>
      {needs.length === 0 ? (
        <EmptyState title="Nothing waiting" />
      ) : (
        <ul className="divide-line border-line divide-y border-y">
          {needs.map((a) => (
            <li key={a.id}>
              <Link
                href={`${base}/attempt/${a.id}`}
                className="hover:bg-sunk flex min-h-14 items-center gap-4 py-3 sm:px-2"
              >
                <span className="flex-1 font-medium">
                  {a.enrolment.user.profile
                    ? dec.fullName(a.enrolment.user.id, a.enrolment.user.profile.fullNameEnc)
                    : ""}
                </span>
                <span className="text-muted font-mono text-xs">
                  Attempt {a.attemptNo} · {formatDateTime(a.submittedAt)}
                </span>
                <Tag tone="accent">To mark</Tag>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
