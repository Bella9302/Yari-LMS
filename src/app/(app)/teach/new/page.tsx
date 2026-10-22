import type { Metadata } from "next";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { isSuperAdmin } from "@/server/rbac";
import { PageHeader } from "@/ui/primitives";
import { NewCourseForm } from "./new-course-form";

export const metadata: Metadata = { title: "New course" };

export default async function NewCoursePage() {
  const { user } = await requireRole("TRAINER", "SUPER_ADMIN");
  const templates = await db.course.findMany({
    where: { isTemplate: true },
    orderBy: { title: "asc" },
    select: { id: true, title: true, summary: true, category: true, _count: { select: { modules: true } } },
  });
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader eyebrow="Teaching" title="New course" />
      <NewCourseForm
        templates={templates.map((t) => ({
          id: t.id,
          title: t.title,
          summary: t.summary,
          category: t.category,
          modules: t._count.modules,
        }))}
        canMakeTemplate={isSuperAdmin(user.roles)}
      />
    </div>
  );
}
