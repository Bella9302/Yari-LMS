import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { getCourseProgress } from "@/server/tracking/progress";
import { formatDuration } from "@/server/tracking/activity";
import { RULE_INFO } from "@/server/tracking/at-risk";
import { dismissFlagAction, recheckAction } from "@/server/actions/tracking";
import { formatDate } from "@/lib/format";
import { AtRiskType } from "@/generated/prisma/enums";
import { Button } from "@/ui/button";
import { DataTable } from "@/ui/data-table";
import { EmptyState, Tag } from "@/ui/primitives";
import { RuleEditor } from "./rule-editor";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const { id } = await params;
  await getEditableCourse(actor, id);
  const [rows, rules, openFlags] = await Promise.all([
    getCourseProgress(actor, id),
    db.atRiskRule.findMany({ where: { courseId: id } }),
    db.atRiskFlag.findMany({
      where: { resolvedAt: null, rule: { courseId: id } },
      include: { rule: { select: { type: true } }, enrolment: { select: { id: true, userId: true } } },
      orderBy: { raisedAt: "asc" },
    }),
  ]);
  const nameOf = new Map(rows.map((r) => [r.enrolmentId, r.name]));

  return (
    <div className="space-y-12">
      <section className="space-y-4" aria-labelledby="attention-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="attention-heading" className="font-display text-h2 flex-1">
            Needs attention
          </h2>
          <form action={recheckAction}>
            <input type="hidden" name="courseId" value={id} />
            <Button type="submit" variant="ghost" size="sm">
              Re-check now
            </Button>
          </form>
        </div>
        {rules.every((r) => !r.active) ? (
          <EmptyState title="No alert rules yet">
            Turn on a rule below to flag learners who fall behind.
          </EmptyState>
        ) : openFlags.length === 0 ? (
          <p className="text-muted">
            No one is flagged right now. Rules are checked nightly and whenever you change them.
          </p>
        ) : (
          <ul className="space-y-2">
            {openFlags.map((f) => (
              <li key={f.id} className="border-line bg-surface flex flex-wrap items-start gap-3 border p-4">
                <AlertTriangle className="text-accent-text mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/teach/courses/${id}/gradebook/${f.enrolment.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {nameOf.get(f.enrolment.id)}
                  </Link>
                  <p className="text-sm">
                    <Tag className="mr-2">{RULE_INFO[f.rule.type].label}</Tag>
                    {f.reason}
                  </p>
                  <p className="text-muted mt-1 font-mono text-xs">Flagged {formatDate(f.raisedAt)}</p>
                </div>
                <form action={dismissFlagAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="courseId" value={id} />
                  <input type="hidden" name="flagId" value={f.id} />
                  <label className="sr-only" htmlFor={`note-${f.id}`}>
                    Note
                  </label>
                  <input
                    id={`note-${f.id}`}
                    name="note"
                    placeholder="Note (optional)"
                    maxLength={500}
                    className="border-line-strong bg-surface min-h-10 w-44 rounded-sm border px-2 text-sm"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Dismiss for 7 days
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="everyone-heading">
        <h2 id="everyone-heading" className="font-display text-h2">
          Everyone
        </h2>
        {rows.length === 0 ? (
          <EmptyState title="No learners yet" />
        ) : (
          <DataTable
            caption="Learner progress"
            rows={rows}
            rowKey={(r) => r.enrolmentId}
            columns={[
              {
                key: "name",
                header: "Learner",
                cell: (r) => (
                  <Link
                    href={`/teach/courses/${id}/gradebook/${r.enrolmentId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.name}
                    <span className="text-muted block text-xs font-normal">
                      {r.organization ?? "Individual"}
                    </span>
                  </Link>
                ),
              },
              {
                key: "progress",
                header: "Complete",
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <span className="bg-line h-1 w-16" aria-hidden>
                      <span className="bg-accent block h-1" style={{ width: `${r.progressPct}%` }} />
                    </span>
                    <span className="font-mono text-sm">{r.progressPct}%</span>
                  </span>
                ),
              },
              {
                key: "viewed",
                header: "Opened",
                cell: (r) => (
                  <span className="font-mono text-sm">
                    {r.viewed}/{r.total}
                  </span>
                ),
              },
              {
                key: "time",
                header: "Time",
                cell: (r) => <span className="font-mono text-sm">{formatDuration(r.timeSpentSec)}</span>,
              },
              { key: "active", header: "Last active", cell: (r) => formatDate(r.lastActiveAt) },
              {
                key: "status",
                header: "Status",
                cell: (r) => (
                  <span className="flex flex-wrap gap-1.5">
                    {r.status === "COMPLETED" ? (
                      <Tag tone="success">Completed</Tag>
                    ) : r.overdue ? (
                      <Tag tone="danger">Overdue</Tag>
                    ) : (
                      <Tag>{r.dueAt ? `Due ${formatDate(r.dueAt)}` : "In progress"}</Tag>
                    )}
                    {r.flags.length > 0 && <Tag tone="accent">At risk</Tag>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      <section className="space-y-4" aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-h2">
          Alert rules
        </h2>
        <p className="text-muted max-w-2xl">
          Flags are for trainers only. You get a daily email when someone new is flagged.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {Object.values(AtRiskType).map((type) => {
            const rule = rules.find((r) => r.type === type);
            return (
              <RuleEditor
                key={type}
                courseId={id}
                type={type}
                info={RULE_INFO[type]}
                threshold={rule?.threshold ?? RULE_INFO[type].defaultThreshold}
                active={rule?.active ?? false}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
