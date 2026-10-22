import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardList, LineChart, Users } from "lucide-react";
import { publicCourses } from "@/server/public/catalogue";
import { siteSettings } from "@/server/settings";
import { BRAND } from "@/lib/brand";
import { SERVICES } from "@/lib/services";
import { buttonClasses } from "@/ui/button";
import { EnquiryForm } from "@/ui/enquiry-form";
import { Monogram } from "@/ui/monogram";
import { PublicCourseCard } from "@/ui/public-course-card";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Tell us what you need",
    body: "Send an enquiry or call us. We'll agree the courses, dates and sites that suit your team.",
  },
  {
    icon: Users,
    title: "We enrol your people",
    body: "Your staff get a personal invitation. They learn on their phones on site, or join a practical session.",
  },
  {
    icon: LineChart,
    title: "You see the progress",
    body: "Your company dashboard shows who's done what, who's overdue, and exports a compliance report.",
  },
  {
    icon: BadgeCheck,
    title: "Certificates anyone can check",
    body: "Each completion earns a Certificate of Completion with a QR code that links to a public check.",
  },
];

function ServiceColumn({
  index,
  service,
  category,
}: {
  index: string;
  service: (typeof SERVICES)["she"] | (typeof SERVICES)["tech"];
  category: string;
}) {
  return (
    <div data-category={category} className="relative">
      <span aria-hidden className="bg-accent block h-1 w-20" />
      <p className="text-muted mt-6 font-mono text-sm">{index}</p>
      <h3 className="font-display text-h2 mt-2">{service.name}</h3>
      <p className="text-muted mt-3 max-w-md text-lg">{service.intro}</p>
      <ul className="border-line mt-8 border-t">
        {service.items.map((item, i) => (
          <li key={item} className="border-line flex items-baseline gap-4 border-b py-3">
            <span className="text-accent-text w-6 shrink-0 font-mono text-xs">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function HomePage() {
  const [courses, site] = await Promise.all([publicCourses(), siteSettings()]);

  return (
    <>
      {/* Hero: asymmetric, type-led, with the monogram as the only image. */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.5fr_1fr] lg:items-end lg:pb-24">
        <div className="animate-rise">
          <p className="eyebrow">{BRAND.companyName} · Training &amp; consultancy</p>
          <h1 className="font-display text-display mt-6">
            Practical training for <span className="text-hs-text">safer sites</span> and{" "}
            <span className="text-ai-text">smarter work</span>.
          </h1>
          <p className="text-muted mt-6 max-w-xl text-lg">
            {site.academyName} brings {BRAND.companyName}&apos;s Health &amp; Safety and AI &amp; Digital
            expertise to your people: short courses, practical sessions on site, and progress you can see.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/courses" className={buttonClasses("primary", "lg")}>
              Browse courses <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/enquire" className={buttonClasses("secondary", "lg")}>
              Talk to us
            </Link>
          </div>
        </div>
        <div className="border-fg relative hidden border-l pl-10 lg:block" aria-hidden>
          <Monogram className="h-64 w-auto" decorative />
          <dl className="mt-10 space-y-4 font-mono text-xs">
            <div className="flex gap-4" data-category="health-safety">
              <dt className="text-accent-text">01</dt>
              <dd>Environmental Health &amp; Safety</dd>
            </div>
            <div className="flex gap-4" data-category="ai-digital">
              <dt className="text-accent-text">02</dt>
              <dd>Tech &amp; IT</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Services */}
      <section id="services" aria-labelledby="services-heading" className="border-line scroll-mt-8 border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <p className="eyebrow">What we do</p>
            <h2 id="services-heading" className="font-display text-h1 max-w-2xl">
              Two practices, one standard: it has to work on site.
            </h2>
          </div>
          <div className="mt-16 grid gap-16 lg:grid-cols-[1.25fr_1fr] lg:gap-20">
            <ServiceColumn index="01" service={SERVICES.she} category="health-safety" />
            <div className="lg:pt-24">
              <ServiceColumn index="02" service={SERVICES.tech} category="ai-digital" />
            </div>
          </div>
        </div>
      </section>

      {/* How it works for companies (inverted, echoing the black business card). */}
      <section aria-labelledby="how-heading" className="bg-inverse text-on-inverse">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase opacity-70">For companies</p>
          <h2 id="how-heading" className="font-display text-h1 mt-4 max-w-2xl">
            Train a whole team without the paperwork.
          </h2>
          <ol className="mt-14 grid gap-px sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-on-inverse/20 border-t pt-5 pr-6 pb-8">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm opacity-60">{String(i + 1).padStart(2, "0")}</span>
                  <s.icon aria-hidden className="size-5" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-h3 mt-4">{s.title}</h3>
                <p className="mt-2 text-[0.95rem] opacity-80">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Catalogue preview */}
      <section aria-labelledby="courses-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Course catalogue</p>
            <h2 id="courses-heading" className="font-display text-h1 mt-4">
              Courses
            </h2>
          </div>
          {courses.length > 0 && (
            <Link href="/courses" className="flex min-h-11 items-center gap-2 underline underline-offset-4">
              All {courses.length} courses <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
        {courses.length === 0 ? (
          <p className="text-muted mt-8 max-w-xl">
            Our course list is being prepared. Tell us what your team needs and we&apos;ll put it together.
          </p>
        ) : (
          <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <PublicCourseCard course={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Certificates, stated plainly. */}
      <section aria-labelledby="cert-heading" className="border-line border-y">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.5fr] lg:items-center">
          <h2 id="cert-heading" className="font-display text-h2">
            Certificates you can check
          </h2>
          <div className="space-y-4">
            <p className="text-lg">
              Every completed course earns a Certificate of Completion with a unique code and QR link, so an
              employer or inspector can confirm it in seconds.
            </p>
            <p className="text-muted border-fg border-l-2 pl-4">{BRAND.nonAccreditationStatement}</p>
            <Link
              href="/verify"
              className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
            >
              Verify a certificate <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Enquiry */}
      <section id="enquire" aria-labelledby="enquire-heading" className="scroll-mt-8">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="eyebrow">Enquire</p>
            <h2 id="enquire-heading" className="font-display text-h1 mt-4">
              Let&apos;s talk about your team.
            </h2>
            <p className="text-muted mt-4 text-lg">
              Training is by arrangement: we enrol your people once we&apos;ve agreed what they need.
            </p>
            {(site.contactEmail || site.contactPhone) && (
              <dl className="mt-8 space-y-3">
                {site.contactEmail && (
                  <div>
                    <dt className="eyebrow">Email</dt>
                    <dd>
                      <a href={`mailto:${site.contactEmail}`} className="underline underline-offset-4">
                        {site.contactEmail}
                      </a>
                    </dd>
                  </div>
                )}
                {site.contactPhone && (
                  <div>
                    <dt className="eyebrow">Phone</dt>
                    <dd>
                      <a
                        href={`tel:${site.contactPhone.replace(/[^+0-9]/g, "")}`}
                        className="underline underline-offset-4"
                      >
                        {site.contactPhone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
          <EnquiryForm courses={courses.map(({ id, title, category }) => ({ id, title, category }))} />
        </div>
      </section>
    </>
  );
}
