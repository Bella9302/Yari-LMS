import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatDuration } from "@/lib/certificates";
import { CategoryTag } from "@/ui/primitives";

export interface PublicCourse {
  slug: string;
  title: string;
  summary: string;
  category: "HEALTH_SAFETY" | "AI_DIGITAL";
  estMinutes: number | null;
  modules: number;
}

export function PublicCourseCard({ course }: { course: PublicCourse }) {
  const duration = formatDuration(course.estMinutes);
  return (
    <Link
      href={`/courses/${course.slug}`}
      data-category={course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
      className="group border-line bg-surface hover:border-fg relative flex h-full flex-col border p-6 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
    >
      <span
        aria-hidden
        className="bg-accent absolute -top-px left-0 h-1 w-16 transition-[width] duration-300 group-hover:w-32"
      />
      <div className="flex items-start justify-between gap-3">
        <CategoryTag category={course.category} />
        <ArrowUpRight
          aria-hidden
          className="text-muted group-hover:text-fg size-5 shrink-0 transition-colors"
        />
      </div>
      <h3 className="font-display text-h3 mt-4 break-words">{course.title}</h3>
      {course.summary && <p className="text-muted mt-2 line-clamp-3">{course.summary}</p>}
      <p className="text-muted mt-auto pt-6 font-mono text-xs">
        {[course.modules > 0 && `${course.modules} ${course.modules === 1 ? "module" : "modules"}`, duration]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </Link>
  );
}
