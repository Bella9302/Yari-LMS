import type { Metadata } from "next";
import { TERMS_VERSION } from "@/lib/policies";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of use" };

// DRAFT wording for YARI GROUP to review before launch.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="eyebrow">Version {TERMS_VERSION}</p>
      <h1 className="font-display text-h1 mt-3">Terms of use</h1>
      <div className="[&_h2]:font-display [&_h2]:text-h3 mt-10 space-y-6 leading-relaxed [&_p]:mt-2">
        <section>
          <h2>Your account</h2>
          <p>
            Accounts on {BRAND.academyName} are personal. Keep your password and authenticator to yourself,
            and tell us if you think someone else has used your account.
          </p>
        </section>
        <section>
          <h2>Course material</h2>
          <p>
            Course content belongs to {BRAND.companyName} or its licensors. You may use it for your own
            learning and work, but not resell or republish it.
          </p>
        </section>
        <section>
          <h2>Certificates</h2>
          <p>{BRAND.nonAccreditationStatement}</p>
        </section>
        <section>
          <h2>Fair use</h2>
          <p>
            Don&apos;t upload anything unlawful or harmful, submit someone else&apos;s work as your own, or
            try to access information that isn&apos;t yours.
          </p>
        </section>
      </div>
    </article>
  );
}
