import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { gradeFor } from "@/server/assessment/grades";
import { gradeLabel } from "@/server/assessment/gradebook";
import { dec } from "@/server/pii/fields";
import { formatDateTime } from "@/lib/format";
import { ItemTypeIcon } from "@/ui/item-type";
import { Tag } from "@/ui/primitives";
import { OverrideForm } from "./override-form";

export const metadata: Metadata = { title: "Learner grades" };

export default async function LearnerGradesPage({
  params,
}: {
  params: Promise<{ id: string; enrolmentId: string }>;
}) {
  const { user } = await requireUser();
  const { id, enrolmentId } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const enrolment = await db.enrolment.findFirst({
    where: { id: enrolmentId, courseId: id },
    include: {
      user: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
      organization: { select: { name: true } },
    },
  });
  if (!enrolment) notFound();
  const items = await db.item.findMany({
    where: { module: { courseId: id }, type: { in: ["QUIZ", "ASSIGNMENT"] } },
    orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
    include: {
      quiz: { include: { attempts: { where: { enrolmentId }, orderBy: { attemptNo: "asc" } } } },
      assignment: {
        include: {
          submissions: { where: { enrolmentId }, orderBy: { attemptNo: "asc" }, include: { mark: true } },
        },
      },
      overrides: { where: { enrolmentId } },
    },
  });
  const grades = await Promise.all(items.map((i) => gradeFor(enrolmentId, i.id)));
  const base = `/teach/courses/${id}`;

  return (
    <div className="max-w-3xl space-y-8">
      <Link href={`${base}/gradebook`} className="eyebrow hover:text-fg">
        ← Gradebook
      </Link>
      <header>
        <h2 className="font-display text-h2">
          {enrolment.user.profile ? dec.fullName(enrolment.user.id, enrolment.user.profile.fullNameEnc) : ""}
        </h2>
        <p className="text-muted">
          {enrolment.organization?.name ?? "Individual"} · {enrolment.progressPct}% complete ·{" "}
          {enrolment.status.toLowerCase()}
        </p>
      </header>
      <ol className="space-y-6">
        {items.map((item, i) => {
          const grade = grades[i]!;
          const override = item.overrides[0];
          return (
            <li key={item.id} className="border-line bg-surface border p-5">
              <div className="flex flex-wrap items-center gap-3">
                <ItemTypeIcon type={item.type} className="text-muted size-4" />
                <h3 className="font-display text-h3 flex-1">{item.title}</h3>
                <span className="font-mono text-lg">{gradeLabel(grade)}</span>
                {grade.passed === true && <Tag tone="success">Pass</Tag>}
                {grade.passed === false && grade.state === "graded" && <Tag tone="danger">Below pass</Tag>}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {item.quiz?.attempts.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-3">
                    <span className="text-muted font-mono">Attempt {a.attemptNo}</span>
                    <span>
                      {a.status === "IN_PROGRESS"
                        ? "in progress"
                        : a.scorePct !== null
                          ? `${Math.round(a.scorePct)}%`
                          : ""}
                    </span>
                    {a.status === "NEEDS_MARKING" && (
                      <Link href={`${base}/marking/attempt/${a.id}`} className="underline">
                        Mark short answers
                      </Link>
                    )}
                    <span className="text-muted">{formatDateTime(a.submittedAt)}</span>
                  </li>
                ))}
                {item.assignment?.submissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-3">
                    <span className="text-muted font-mono">Attempt {s.attemptNo}</span>
                    <Link href={`${base}/marking/submission/${s.id}`} className="underline">
                      {s.mark?.status === "RELEASED"
                        ? `${s.mark.score} / ${item.assignment!.maxPoints}`
                        : "Mark"}
                    </Link>
                    {s.isLate && <Tag tone="danger">Late</Tag>}
                    <span className="text-muted">{formatDateTime(s.submittedAt)}</span>
                  </li>
                ))}
                {grade.attempts === 0 && <li className="text-muted">Nothing handed in yet.</li>}
              </ul>
              <details className="border-line mt-4 border-t pt-3" open={Boolean(override)}>
                <summary className="text-muted cursor-pointer text-sm">
                  {override ? `Overridden: ${override.reason}` : "Override grade"}
                </summary>
                <OverrideForm
                  courseId={id}
                  enrolmentId={enrolmentId}
                  itemId={item.id}
                  current={override ? { scorePct: override.scorePct, reason: override.reason } : null}
                />
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
