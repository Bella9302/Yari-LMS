import type { Metadata } from "next";
import { requireRole } from "@/server/guards";
import { accreditationSettings, siteSettings } from "@/server/settings";
import { BRAND } from "@/lib/brand";
import { Notice, PageHeader } from "@/ui/primitives";
import { AccreditationForm, SiteSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireRole("SUPER_ADMIN");
  const [site, accreditation] = await Promise.all([siteSettings(), accreditationSettings()]);
  return (
    <div className="space-y-12">
      <PageHeader eyebrow="Administration" title="Settings" />
      <section aria-labelledby="site-heading" className="grid gap-6 lg:grid-cols-[18rem_minmax(0,32rem)]">
        <div>
          <h2 id="site-heading" className="font-display text-h3">
            Platform
          </h2>
          <p className="text-muted mt-2 text-sm">The name and contact details people see.</p>
        </div>
        <SiteSettingsForm current={site} />
      </section>
      <section
        aria-labelledby="accreditation-heading"
        className="border-line grid gap-6 border-t pt-10 lg:grid-cols-[18rem_minmax(0,32rem)]"
      >
        <div>
          <h2 id="accreditation-heading" className="font-display text-h3">
            Accreditation
          </h2>
          <p className="text-muted mt-2 text-sm">
            Only switch this on once YARI GROUP is accredited. It applies to new certificates for courses that
            list unit standards; every other certificate keeps the statement below.
          </p>
        </div>
        <div className="space-y-5">
          <Notice title={accreditation.enabled ? "Accreditation is ON" : "Certificates are not accredited"}>
            {accreditation.enabled
              ? `New certificates for courses with unit standards show ${accreditation.body}, provider number ${accreditation.providerNumber}.`
              : `Every certificate says: “${BRAND.nonAccreditationStatement}”`}
          </Notice>
          <AccreditationForm current={accreditation} />
        </div>
      </section>
    </div>
  );
}
