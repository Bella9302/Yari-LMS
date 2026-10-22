import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { isSuperAdmin } from "@/server/rbac";
import { editableCoursesWhere } from "@/server/courses/access";
import { formatDate } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { CategoryTag, EmptyState, PageHeader, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Courses" };

export default async function TeachPage() {
  const { user } = await requireRole("TRAINER", "SUPER_ADMIN");
  const actor = { id: user.id, roles: user.roles };
  const [courses, templates] = await Promise.all([
    db.course.findMany({
      where: { ...editableCoursesWhere(actor), isTemplate: false },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { _count: { select: { enrolments: { where: { status: { not: "WITHDRAWN" } } } } } },
    }),
    isSuperAdmin(user.roles)
      ? db.course.findMany({ where: { isTemplate: true }, orderBy: { title: "asc" } })
      : [],
  ]);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Teaching"
        title="Courses"
        description="Build, publish and run your courses."
        actions={
          <>
            <Link href="/teach/ratings" className={buttonClasses("secondary")}>
              Your ratings
            </Link>
            <Link href="/teach/new" className={buttonClasses("primary")}>
              <Plus className="size-4" aria-hidden /> New course
            </Link>
          </>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          action={
            <Link href="/teach/new" className={buttonClasses("primary")}>
              Create your first course
            </Link>
          }
        >
          Start from a template like SHE Rep Practical Training, or from a blank course.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((c) => (
            <li key={c.id} data-category={c.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}>
              <Link
                href={`/teach/courses/${c.id}`}
                className="group border-line bg-surface hover:border-fg flex h-full flex-col border p-5 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <CategoryTag category={c.category} />
                  <Tag tone={c.status === "PUBLISHED" ? "success" : "neutral"}>{c.status.toLowerCase()}</Tag>
                </div>
                <p className="font-display text-h3 mt-4 group-hover:underline group-hover:underline-offset-4">
                  {c.title}
                </p>
                <p className="text-muted mt-auto pt-4 font-mono text-xs">
                  {c._count.enrolments} {c._count.enrolments === 1 ? "learner" : "learners"} · updated{" "}
                  {formatDate(c.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {templates.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-h2">Templates</h2>
          <p className="text-muted">
            Trainers start new courses from these. Only administrators can edit them.
          </p>
          <ul className="divide-line border-line divide-y border-y">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <CategoryTag category={t.category} />
                <Link href={`/teach/courses/${t.id}`} className="flex-1 underline-offset-4 hover:underline">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
