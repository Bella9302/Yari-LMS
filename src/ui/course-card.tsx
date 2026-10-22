import Link from "next/link";
import type { MyCourse } from "@/server/courses/learner";
import { formatDate } from "@/lib/format";
import { ProgressRing } from "@/ui/progress-ring";
import { CategoryTag, Tag } from "@/ui/primitives";

export function CourseCard({ course }: { course: MyCourse }) {
  const done = course.status === "COMPLETED";
  return (
    <Link
      href={`/learn/${course.slug}`}
      data-category={course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
      className="group border-line bg-surface hover:border-fg flex items-center gap-5 border p-5 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <ProgressRing value={course.progressPct} label={`${course.title} progress`} size={64} />
      <span className="min-w-0 flex-1">
        <CategoryTag category={course.category} />
        <span className="font-display text-h3 mt-1.5 block break-words group-hover:underline group-hover:underline-offset-4">
          {course.title}
        </span>
        <span className="text-muted mt-1 flex flex-wrap gap-x-3 text-sm">
          {done ? (
            <Tag tone="success">Completed</Tag>
          ) : course.dueAt ? (
            <span>Due {formatDate(course.dueAt)}</span>
          ) : null}
          {!done && <span>{course.lastActiveAt ? "Continue" : "Start"} →</span>}
        </span>
      </span>
    </Link>
  );
}
