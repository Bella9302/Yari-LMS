import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { listMyCourses } from "@/server/courses/learner";
import { CourseCard } from "@/ui/course-card";
import { EmptyState, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "My courses" };

export default async function LearnPage() {
  const { user } = await requireUser();
  const courses = await listMyCourses(user.id);
  const active = courses.filter((c) => c.status !== "COMPLETED");
  const completed = courses.filter((c) => c.status === "COMPLETED");

  return (
    <div className="space-y-12">
      <PageHeader eyebrow="Learning" title="My courses" />
      {courses.length === 0 && (
        <EmptyState title="No courses yet">
          When you&apos;re enrolled on a course it will appear here.
        </EmptyState>
      )}
      {active.length > 0 && (
        <section className="space-y-4" aria-labelledby="active-heading">
          <h2 id="active-heading" className="font-display text-h2">
            In progress
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {active.map((c) => (
              <li key={c.slug}>
                <CourseCard course={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {completed.length > 0 && (
        <section className="space-y-4" aria-labelledby="done-heading">
          <h2 id="done-heading" className="font-display text-h2">
            Completed
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {completed.map((c) => (
              <li key={c.slug}>
                <CourseCard course={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
