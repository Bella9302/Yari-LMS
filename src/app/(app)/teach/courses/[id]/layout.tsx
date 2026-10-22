import Link from "next/link";
import { Eye } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { buttonClasses } from "@/ui/button";
import { CategoryTag, Tag } from "@/ui/primitives";
import { SubNav } from "@/ui/sub-nav";
import { StatusControl } from "./status-control";

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireUser();
  const { id } = await params;
  const course = await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const base = `/teach/courses/${id}`;

  return (
    <div
      className="space-y-8"
      data-category={course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
    >
      <header className="animate-rise border-line space-y-4 border-b pb-6">
        <Link href="/teach" className="eyebrow hover:text-fg">
          ← Courses
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <CategoryTag category={course.category} />
          {course.isTemplate ? (
            <Tag>Template</Tag>
          ) : (
            <Tag tone={course.status === "PUBLISHED" ? "success" : "neutral"}>
              {course.status.toLowerCase()}
            </Tag>
          )}
          <span className="text-muted font-mono text-xs">
            {course._count.enrolments} {course._count.enrolments === 1 ? "learner" : "learners"}
          </span>
        </div>
        <h1 className="font-display text-h1 break-words">{course.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {!course.isTemplate && <StatusControl courseId={course.id} status={course.status} />}
          {!course.isTemplate && (
            <Link href={`/learn/${course.slug}`} className={buttonClasses("ghost", "md")}>
              <Eye className="size-4" aria-hidden /> Preview as learner
            </Link>
          )}
        </div>
      </header>
      <SubNav
        label="Course sections"
        items={[
          { href: base, label: "Content", exact: true },
          { href: `${base}/settings`, label: "Settings" },
          ...(course.isTemplate ? [] : [{ href: `${base}/people`, label: "People" }]),
        ]}
      />
      {children}
    </div>
  );
}
