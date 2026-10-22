import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicCourse } from "@/server/public/catalogue";
import { BRAND } from "@/lib/brand";
import { formatDuration } from "@/lib/certificates";
import { buttonClasses } from "@/ui/button";
import { ITEM_TYPE_META } from "@/ui/item-type";
import { CategoryTag } from "@/ui/primitives";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await publicCourse((await params).slug);
  return course
    ? { title: course.title, description: course.summary || undefined }
    : { title: "Course not found" };
}

export default async function PublicCoursePage({ params }: Props) {
  const course = await publicCourse((await params).slug);
  if (!course) notFound();
  const duration = formatDuration(course.estMinutes);
  const items = course.modules.reduce((n, m) => n + m.items.length, 0);
  const category = course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital";

  return (
    <article data-category={category}>
      <header className="border-line border-b">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <div className="animate-rise">
            <Link href="/courses" className="eyebrow hover:text-fg">
              ← All courses
            </Link>
            <div className="mt-6">
              <CategoryTag category={course.category} />
            </div>
            <h1 className="font-display text-display mt-4 break-words">{course.title}</h1>
            {course.summary && <p className="text-muted mt-6 max-w-2xl text-lg">{course.summary}</p>}
          </div>
          <div className="border-fg space-y-6 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <dl className="grid grid-cols-2 gap-6">
              <div>
                <dt className="eyebrow">Modules</dt>
                <dd className="mt-1 font-mono text-3xl tabular-nums">{course.modules.length}</dd>
              </div>
              <div>
                <dt className="eyebrow">{duration ? "Length" : "Items"}</dt>
                <dd className="mt-1 font-mono text-3xl tabular-nums">{duration ?? items}</dd>
              </div>
            </dl>
            <Link
              href={`/enquire?course=${course.slug}`}
              className={buttonClasses("primary", "lg", "w-full")}
            >
              Enquire about this course
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="outline-heading">
          <h2 id="outline-heading" className="font-display text-h2">
            What&apos;s covered
          </h2>
          <ol className="mt-8 space-y-8">
            {course.modules.map((m, i) => (
              <li key={m.id}>
                <div className="border-fg flex items-baseline gap-4 border-b pb-2">
                  <span className="text-accent-text font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-h3">{m.title}</h3>
                </div>
                {m.items.length > 0 && (
                  <ul className="divide-line mt-1 divide-y">
                    {m.items.map((it, j) => {
                      const meta = ITEM_TYPE_META[it.type];
                      return (
                        <li key={j} className="flex items-center gap-3 py-2.5">
                          <meta.icon aria-hidden className="text-muted size-4 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{it.title}</span>
                          <span className="text-muted shrink-0 font-mono text-xs">{meta.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
        <aside className="space-y-6 lg:pt-16">
          <div className="border-line bg-surface border p-6">
            <h2 className="font-display text-h3">How enrolment works</h2>
            <p className="text-muted mt-2">
              We run this course for companies and groups. Send an enquiry and we&apos;ll agree dates, then
              invite your people to {BRAND.companyName}&apos;s learning platform.
            </p>
          </div>
          <div className="border-fg border-l-2 pl-4">
            <p className="font-medium">Certificate of Completion</p>
            <p className="text-muted mt-1 text-sm">{BRAND.nonAccreditationStatement}</p>
          </div>
        </aside>
      </div>
    </article>
  );
}
