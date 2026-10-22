import type { Metadata } from "next";
import { publicCourses } from "@/server/public/catalogue";
import { siteSettings } from "@/server/settings";
import { EnquiryForm } from "@/ui/enquiry-form";

export const metadata: Metadata = {
  title: "Enquire",
  description: "Ask YARI GROUP about Health & Safety or AI & Digital training for your team.",
};

export default async function EnquirePage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const [courses, site, sp] = await Promise.all([publicCourses(), siteSettings(), searchParams]);
  const chosen = courses.find((c) => c.slug === sp.course);
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.6fr]">
      <div>
        <p className="eyebrow">Enquire</p>
        <h1 className="font-display text-h1 mt-4">Let&apos;s talk about your team.</h1>
        <p className="text-muted mt-4 text-lg">
          {chosen
            ? `Tell us a little about who needs ${chosen.title}, where and when.`
            : "Tell us what you need. We usually reply within two working days."}
        </p>
        {site.contactPhone && (
          <p className="mt-6">
            Prefer to call?{" "}
            <a
              href={`tel:${site.contactPhone.replace(/[^+0-9]/g, "")}`}
              className="underline underline-offset-4"
            >
              {site.contactPhone}
            </a>
          </p>
        )}
      </div>
      <EnquiryForm
        courses={courses.map(({ id, title, category }) => ({ id, title, category }))}
        defaultCourseId={chosen?.id}
        defaultInterest={chosen ? (chosen.category === "HEALTH_SAFETY" ? "SHE" : "TECH") : undefined}
      />
    </section>
  );
}
