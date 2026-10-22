import type { Metadata } from "next";
import Link from "next/link";
import { publicCourses } from "@/server/public/catalogue";
import { cn } from "@/ui/cn";
import { EmptyState } from "@/ui/primitives";
import { PublicCourseCard } from "@/ui/public-course-card";
import { buttonClasses } from "@/ui/button";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Health & Safety and AI & Digital courses from YARI GROUP, for individuals and client companies.",
};

const FILTERS = [
  { value: "", label: "All courses" },
  { value: "health-safety", label: "Health & Safety", category: "HEALTH_SAFETY" },
  { value: "ai-digital", label: "AI & Digital", category: "AI_DIGITAL" },
] as const;

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = (await searchParams).category ?? "";
  const filter = FILTERS.find((f) => f.value === sp) ?? FILTERS[0];
  const courses = await publicCourses("category" in filter ? filter.category : undefined);

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow">Course catalogue</p>
      <h1 className="font-display text-display mt-4">Courses</h1>
      <p className="text-muted mt-4 max-w-2xl text-lg">
        Courses are run for companies and their teams. Find one that fits, then enquire and we&apos;ll arrange
        enrolment.
      </p>
      <nav aria-label="Filter by category" className="mt-10 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === filter.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/courses?category=${f.value}` : "/courses"}
              aria-current={active ? "page" : undefined}
              data-category={f.value || undefined}
              className={cn(
                "border-line-strong flex min-h-11 items-center gap-2 rounded-sm border px-4 text-[0.95rem] transition-colors",
                active ? "bg-inverse text-on-inverse border-fg" : "hover:bg-sunk",
              )}
            >
              {f.value && <span aria-hidden className="bg-accent size-2 rounded-full" />}
              {f.label}
            </Link>
          );
        })}
      </nav>
      {courses.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No courses listed here yet"
            action={
              <Link href="/enquire" className={buttonClasses("primary")}>
                Tell us what you need
              </Link>
            }
          >
            We also build training around your site and your team.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <li key={c.slug}>
              <PublicCourseCard course={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
