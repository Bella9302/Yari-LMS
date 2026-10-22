import type { Metadata } from "next";
import { requireRole } from "@/server/guards";
import { listTrainers } from "@/server/courses/roster";
import { adminRatings, averages, CRITERIA, CRITERIA_LABELS } from "@/server/engagement/ratings";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";
import { DataTable } from "@/ui/data-table";
import { EmptyState, PageHeader, Stat } from "@/ui/primitives";

export const metadata: Metadata = { title: "Trainer ratings" };

export default async function AdminRatingsPage({
  searchParams,
}: {
  searchParams: Promise<{ trainer?: string }>;
}) {
  const { user } = await requireRole("SUPER_ADMIN");
  const { trainer } = await searchParams;
  const [trainers, rows] = await Promise.all([
    listTrainers(),
    adminRatings({ id: user.id, roles: user.roles }, trainer || undefined),
  ]);
  const summary = rows.length
    ? averages(rows.map((r) => ({ ...r.scores, courseId: "", createdAt: r.createdAt, comment: r.comment })))
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Trainer ratings"
        description="Full detail, including who gave each rating. Trainers only see anonymous averages. Viewing this page is recorded in the audit log."
      />
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="space-y-1.5 sm:w-80">
          <label htmlFor="trainer" className="text-sm font-medium">
            Trainer
          </label>
          <Select id="trainer" name="trainer" defaultValue={trainer ?? ""}>
            <option value="">All trainers</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {summary && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-6">
          <Stat label="Overall" value={summary.overall.toFixed(1)} />
          <Stat label="Ratings" value={summary.count} />
          {CRITERIA.map((c) => (
            <Stat key={c} label={CRITERIA_LABELS[c]} value={summary.byCriterion[c].toFixed(1)} />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No ratings yet" />
      ) : (
        <DataTable
          caption="Trainer ratings"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "trainer",
              header: "Trainer",
              cell: (r) => <span className="font-medium">{r.trainer}</span>,
            },
            {
              key: "for",
              header: "For",
              cell: (r) => (r.session ? `${r.session} · ${r.course}` : r.course),
            },
            { key: "rater", header: "Rated by", cell: (r) => r.rater },
            {
              key: "scores",
              header: "K / C / R / E",
              cell: (r) => (
                <span
                  className="font-mono text-sm tabular-nums"
                  title="Knowledge / Clarity / Practical relevance / Engagement"
                >
                  {CRITERIA.map((c) => r.scores[c]).join(" / ")}
                </span>
              ),
            },
            {
              key: "overall",
              header: "Overall",
              cell: (r) => <span className="font-mono tabular-nums">{r.overall.toFixed(1)}</span>,
            },
            {
              key: "comment",
              header: "Comment",
              cell: (r) => r.comment ?? "—",
              className: "max-w-xs break-words",
            },
            {
              key: "at",
              header: "When",
              cell: (r) => <span className="font-mono text-xs">{formatDateTime(r.createdAt)}</span>,
              hideOnMobile: true,
            },
          ]}
        />
      )}
    </div>
  );
}
