import Link from "next/link";
import { buttonClasses } from "@/ui/button";
import { Monogram } from "@/ui/monogram";

// Placeholder front page for Phase 1. The full landing page, catalogue and enquiry form arrive in Phase 6.
export default function HomePage() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.4fr_1fr] lg:items-end">
      <div className="animate-rise">
        <p className="eyebrow">YARI GROUP · Training</p>
        <h1 className="font-display text-display mt-5">
          Practical training for <span className="text-hs-text">safer sites</span> and{" "}
          <span className="text-ai-text">smarter work</span>.
        </h1>
        <p className="text-muted mt-6 max-w-xl text-lg">
          Health &amp; Safety and AI &amp; Digital courses from YARI GROUP, for individuals and client
          companies.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/login" className={buttonClasses("primary", "lg")}>
            Sign in to YARI Academy
          </Link>
        </div>
      </div>
      <div className="hidden justify-end lg:flex" aria-hidden>
        <Monogram className="h-72 w-auto" decorative />
      </div>
    </section>
  );
}
