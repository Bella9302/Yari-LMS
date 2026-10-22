import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/guards";
import { getCompanyOverview, COMPANY_INACTIVE_DAYS } from "@/server/tracking/company";
import { formatDate } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { DataTable } from "@/ui/data-table";
import { CategoryTag, EmptyState, Stat } from "@/ui/primitives";
import { ProgressRing } from "@/ui/progress-ring";
import { TrainingStateTag } from "@/ui/training-state";

export const metadata: Metadata = { title: "Company overview" };

export default async function OrgOverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const { orgId } = await params;
  const { stats, courses, attention } = await getCompanyOverview({ id: user.id, roles: user.roles }, orgId);

  if (stats.enrolments === 0) {
    return (
      <EmptyState
        title="No training yet"
        action={
          <Link href={`/org/${orgId}/enrol`} className={buttonClasses("primary")}>
            Enrol staff on a course
          </Link>
        }
      >
        {stats.staff
          ? `${stats.staff} staff member${stats.staff === 1 ? " is" : "s are"} on YARI Academy.`
          : "Invite your staff first, then enrol them on courses."}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <ProgressRing value={stats.completionRate} label="Training completed" size={128} stroke={8} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          <Stat label="Staff" value={stats.staff} />
          <Stat label="Completed" value={stats.completed} hint={`of ${stats.enrolments} enrolments`} />
          <Stat label="Overdue" value={stats.overdue} />
          <Stat label="Inactive" value={stats.inactive} hint={`${COMPANY_INACTIVE_DAYS}+ days`} />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="font-display text-h2">
          Needs follow-up
        </h2>
        {attention.length === 0 ? (
          <p className="text-muted">Everyone is on track.</p>
        ) : (
          <ul className="divide-line border-line divide-y border-y">
            {attention.map((r) => (
              <li key={r.enrolmentId}>
                <Link
                  href={`/org/${orgId}/staff/${r.userId}`}
                  className="hover:bg-sunk flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-2 sm:px-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.name}</span>
                    <span className="text-muted block text-sm">{r.course.title}</span>
                  </span>
                  <span className="text-muted font-mono text-xs">
                    {r.state === "overdue"
                      ? `due ${formatDate(r.dueAt)}`
                      : `last active ${formatDate(r.lastActiveAt)}`}{" "}
                    · {r.progressPct}%
                  </span>
                  <TrainingStateTag state={r.state} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="font-display text-h2">
          By course
        </h2>
        <DataTable
          caption="Courses"
          rows={courses}
          rowKey={(c) => c.id}
          columns={[
            {
              key: "title",
              header: "Course",
              cell: (c) => (
                <span>
                  <CategoryTag category={c.category} />
                  <span className="block font-medium">{c.title}</span>
                </span>
              ),
            },
            {
              key: "enrolled",
              header: "Enrolled",
              cell: (c) => <span className="font-mono">{c.enrolled}</span>,
            },
            {
              key: "completed",
              header: "Completed",
              cell: (c) => <span className="font-mono">{c.completed}</span>,
            },
            {
              key: "overdue",
              header: "Overdue",
              cell: (c) => <span className={`font-mono ${c.overdue ? "text-danger" : ""}`}>{c.overdue}</span>,
            },
            {
              key: "avg",
              header: "Average progress",
              cell: (c) => <span className="font-mono">{c.avgProgress}%</span>,
            },
          ]}
        />
      </section>
    </div>
  );
}
