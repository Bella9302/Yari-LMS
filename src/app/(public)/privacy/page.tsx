import type { Metadata } from "next";
import { PRIVACY_VERSION } from "@/lib/policies";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy notice" };

// DRAFT wording for YARI GROUP to review with its Information Officer before launch.
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="eyebrow">Version {PRIVACY_VERSION}</p>
      <h1 className="font-display text-h1 mt-3">Privacy notice</h1>
      <p className="text-muted mt-4 text-lg">
        How {BRAND.companyName} handles your personal information on {BRAND.academyName}, in line with the
        Protection of Personal Information Act (POPIA).
      </p>

      <div className="[&_h2]:font-display [&_h2]:text-h3 mt-10 space-y-8 leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
        <section>
          <h2>Who we are</h2>
          <p>
            {BRAND.companyName} is the responsible party for personal information processed on this platform.
            Contact our Information Officer at{" "}
            <a className="underline" href={`mailto:privacy@${BRAND.domain}`}>
              privacy@{BRAND.domain}
            </a>
            .
          </p>
        </section>
        <section>
          <h2>What we collect</h2>
          <ul>
            <li>Your name, email address and mobile number.</li>
            <li>Your South African ID number, or passport number and issuing country.</li>
            <li>Your employer, if your company enrolled you.</li>
            <li>Your course progress, submissions, marks, attendance and ratings you give.</li>
            <li>Security records such as sign-in times and a one-way hash of your IP address.</li>
          </ul>
        </section>
        <section>
          <h2>Why we use it</h2>
          <ul>
            <li>To run your training: enrolment, progress, marking and completion records.</li>
            <li>To issue certificates of attendance and completion, and let others verify them.</li>
            <li>To report your training progress to your employer when they enrolled you.</li>
            <li>To keep the platform secure and meet our legal obligations.</li>
            <li>With your separate, optional consent: to tell you about new courses.</li>
          </ul>
        </section>
        <section>
          <h2>Who can see it</h2>
          <p>
            Your trainers see what they need to teach and mark you. If your employer enrolled you, your
            company&apos;s manager sees your progress, completion and results — never another company&apos;s
            staff. Only YARI administrators can see your full ID or passport number. Every view of your
            personal details is logged.
          </p>
        </section>
        <section>
          <h2>Certificates</h2>
          <p>
            Each certificate has a verification code. Anyone with the code can confirm that the certificate is
            genuine and see the name on it, the course and the date. Search engines are asked not to index
            these pages, and if your account is deleted your certificates stop verifying and your name is
            removed. Certificates are records of attendance and completion, not accredited qualifications.
          </p>
        </section>
        <section>
          <h2>Enquiries</h2>
          <p>
            If you use the enquiry form, we keep your name, contact details and message only to reply to you
            and arrange training. They are encrypted, seen only by YARI administrators, and deleted 12 months
            after your enquiry was last dealt with.
          </p>
        </section>
        <section>
          <h2>How we protect it</h2>
          <p>
            Personal details are encrypted in our database with keys stored separately, passwords are never
            stored in readable form, and staff accounts use two-step verification. Our servers are in South
            Africa.
          </p>
        </section>
        <section>
          <h2>Your rights</h2>
          <p>
            You may ask to see the information we hold about you, correct it, or have it deleted, and you may
            withdraw optional consent at any time — from your account&apos;s Privacy page or by contacting us.
            Some records (such as completed training) may need to be kept for a period required by law. You
            may also complain to the Information Regulator (inforegulator.org.za).
          </p>
        </section>
      </div>
    </article>
  );
}
