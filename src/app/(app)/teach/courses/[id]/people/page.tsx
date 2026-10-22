import type { Metadata } from "next";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { isSuperAdmin } from "@/server/rbac";
import { withdrawAction } from "@/server/actions/courses";
import { getEditableCourse } from "@/server/courses/queries";
import { getCourseRoster, listTrainers } from "@/server/courses/roster";
import { dec } from "@/server/pii/fields";
import { listUsers } from "@/server/pii/users";
import { formatDate } from "@/lib/format";
import { Button } from "@/ui/button";
import { DataTable } from "@/ui/data-table";
import { EmptyState, Tag } from "@/ui/primitives";
import { EnrolForm } from "@/ui/enrol-form";
import { StaffForms } from "./staff-forms";

export const metadata: Metadata = { title: "Course people" };

export default async function CoursePeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const { id } = await params;
  const course = await getEditableCourse(actor, id);
  const admin = isSuperAdmin(user.roles);

  const [staff, roster, trainers, learners] = await Promise.all([
    db.courseStaff.findMany({
      where: { courseId: id },
      include: { user: { select: { id: true, profile: { select: { fullNameEnc: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    getCourseRoster(actor, id),
    listTrainers(),
    admin ? listUsers(actor, { role: "LEARNER" }) : Promise.resolve([]),
  ]);
  const enrolledIds = new Set(roster.map((r) => r.userId));

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h2 className="font-display text-h2">Trainers</h2>
        <StaffForms
          courseId={id}
          staff={staff.map((s) => ({
            userId: s.userId,
            role: s.role,
            fullName: s.user.profile ? dec.fullName(s.user.id, s.user.profile.fullNameEnc) : "",
          }))}
          trainers={trainers.filter((t) => !staff.some((s) => s.userId === t.id))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-h2">Learners</h2>
        {admin && (
          <details className="group border-line bg-surface border" open={roster.length === 0}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium">
              Enrol learners
              <span aria-hidden className="font-mono text-xl transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-line border-t p-5">
              <EnrolForm
                courseId={id}
                people={learners
                  .filter((l) => !enrolledIds.has(l.id))
                  .map((l) => ({
                    id: l.id,
                    name: l.fullName,
                    detail: l.organizations.map((o) => o.name).join(", ") || l.email,
                  }))}
                disabledReason={
                  course.status === "DRAFT"
                    ? "Learners can be enrolled now, but they'll only see the course once it's published."
                    : undefined
                }
              />
            </div>
          </details>
        )}
        {!admin && (
          <p className="text-muted text-sm">
            Learners are enrolled by YARI administrators or their company&apos;s manager.
          </p>
        )}
        {roster.length === 0 ? (
          <EmptyState title="No learners yet" />
        ) : (
          <DataTable
            caption="Enrolled learners"
            rows={roster}
            rowKey={(r) => r.enrolmentId}
            columns={[
              {
                key: "name",
                header: "Learner",
                cell: (r) => (
                  <span className="font-medium">
                    {r.fullName}
                    <span className="text-muted block text-sm font-normal">{r.organization ?? r.email}</span>
                  </span>
                ),
              },
              {
                key: "progress",
                header: "Progress",
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <span className="bg-line h-1 w-20" aria-hidden>
                      <span className="bg-accent block h-1" style={{ width: `${r.progressPct}%` }} />
                    </span>
                    <span className="font-mono text-sm">{r.progressPct}%</span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (r) => (
                  <Tag tone={r.status === "COMPLETED" ? "success" : "neutral"}>{r.status.toLowerCase()}</Tag>
                ),
              },
              { key: "due", header: "Due", cell: (r) => formatDate(r.dueAt), hideOnMobile: true },
              {
                key: "active",
                header: "Last active",
                cell: (r) => formatDate(r.lastActiveAt),
                hideOnMobile: true,
              },
              {
                key: "actions",
                header: "",
                cell: (r) => (
                  <form action={withdrawAction}>
                    <input type="hidden" name="courseId" value={id} />
                    <input type="hidden" name="enrolmentId" value={r.enrolmentId} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Withdraw ${r.fullName}`}>
                      Withdraw
                    </Button>
                  </form>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
