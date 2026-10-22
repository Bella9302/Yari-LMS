import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/guards";
import { getStaffTraining } from "@/server/tracking/company";
import { PermissionError } from "@/server/pii/users";
import { formatDate } from "@/lib/format";
import { CategoryTag, EmptyState, Tag } from "@/ui/primitives";
import { ProgressRing } from "@/ui/progress-ring";
import { TrainingStateTag } from "@/ui/training-state";

export const metadata: Metadata = { title: "Staff training" };

export default async function StaffTrainingPage({
  params,
}: {
  params: Promise<{ orgId: string; userId: string }>;
}) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const { orgId, userId } = await params;
  const data = await getStaffTraining({ id: user.id, roles: user.roles }, orgId, userId).catch((e) => {
    if (e instanceof PermissionError) notFound();
    throw e;
  });

  return (
    <div className="space-y-8">
      <Link href={`/org/${orgId}/staff`} className="eyebrow hover:text-fg">
        ← Staff
      </Link>
      <header>
        <h2 className="font-display text-h2">{data.name}</h2>
        {data.department && <p className="text-muted">{data.department}</p>}
      </header>
      {data.courses.length === 0 ? (
        <EmptyState title="Not enrolled on any company courses" />
      ) : (
        <ul className="space-y-4">
          {data.courses.map((c) => (
            <li
              key={c.enrolmentId}
              className="border-line bg-surface border p-5"
              data-category={c.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
            >
              <div className="flex flex-wrap items-center gap-5">
                <ProgressRing value={c.progressPct} label={`${c.course.title} progress`} size={64} />
                <div className="min-w-0 flex-1">
                  <CategoryTag category={c.course.category} />
                  <p className="font-display text-h3 mt-1">{c.course.title}</p>
                  <p className="text-muted text-sm">
                    {c.completedAt
                      ? `Completed ${formatDate(c.completedAt)}`
                      : c.dueAt
                        ? `Due ${formatDate(c.dueAt)}`
                        : "No due date"}{" "}
                    · last active {formatDate(c.lastActiveAt)}
                    {c.sessions.held > 0 &&
                      ` · attended ${c.sessions.attended} of ${c.sessions.held} sessions`}
                  </p>
                  {c.certificateCode && (
                    <a
                      href={`/certificates/${c.certificateCode}`}
                      className="mt-1 inline-block text-sm underline underline-offset-4"
                    >
                      Certificate {c.certificateCode} (PDF)
                    </a>
                  )}
                </div>
                <TrainingStateTag state={c.state} />
              </div>
              {c.results.length > 0 && (
                <ul className="divide-line border-line mt-4 divide-y border-t text-sm">
                  {c.results.map((r) => (
                    <li key={r.title} className="flex items-center gap-3 py-2">
                      <span className="flex-1">{r.title}</span>
                      <span className="font-mono">
                        {r.scorePct !== null
                          ? `${Math.round(r.scorePct)}%`
                          : r.state === "pending"
                            ? "being marked"
                            : "—"}
                      </span>
                      {r.passed === true && <Tag tone="success">Pass</Tag>}
                      {r.passed === false && r.state === "graded" && <Tag tone="danger">Not yet</Tag>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted text-xs">
        You see progress, results and attendance for training your company arranged. Submitted work and
        trainer feedback stay private to the learner.
      </p>
    </div>
  );
}
