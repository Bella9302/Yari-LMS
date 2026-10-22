import Link from "next/link";
import { connection } from "next/server";
import { Monogram } from "@/ui/monogram";
import { ThemeToggle } from "@/ui/theme";
import { buttonClasses } from "@/ui/button";
import { BRAND } from "@/lib/brand";
import { siteSettings } from "@/server/settings";

const NAV = [
  { href: "/courses", label: "Courses" },
  { href: "/#services", label: "Services" },
  { href: "/verify", label: "Verify" },
  { href: "/enquire", label: "Enquire" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Settings are editable by admins, so render per request rather than at build time.
  await connection();
  const site = await siteSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Monogram className="h-7 w-auto" decorative />
            <span className="font-display text-lg">{site.academyName}</span>
          </Link>
          <nav aria-label="Main" className="ml-6 hidden md:block">
            <ul className="flex gap-6 text-[0.95rem]">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-fg text-muted transition-colors">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className={buttonClasses("primary", "md")}>
              Sign in
            </Link>
          </div>
        </div>
        {/* Phones: the same links in a second row, so nothing hides behind a menu button. */}
        <nav aria-label="Main" className="border-line border-t md:hidden">
          <ul className="flex justify-between px-4 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-muted hover:text-fg flex min-h-11 items-center px-1">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="bg-inverse text-on-inverse">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-4">
            <Monogram className="h-12 w-auto" decorative />
            <p className="max-w-sm text-sm opacity-80">
              {BRAND.companyName}: Environmental Health &amp; Safety, and Tech &amp; IT. Training and
              consultancy across South Africa.
            </p>
          </div>
          <nav aria-label="Footer">
            <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase opacity-70">Academy</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/courses" className="hover:underline">
                  Course catalogue
                </Link>
              </li>
              <li>
                <Link href="/verify" className="hover:underline">
                  Verify a certificate
                </Link>
              </li>
              <li>
                <Link href="/enquire" className="hover:underline">
                  Make an enquiry
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:underline">
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
          <div>
            <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase opacity-70">Contact</p>
            <ul className="mt-3 space-y-2 text-sm">
              {site.contactEmail && (
                <li>
                  <a href={`mailto:${site.contactEmail}`} className="hover:underline">
                    {site.contactEmail}
                  </a>
                </li>
              )}
              {site.contactPhone && (
                <li>
                  <a href={`tel:${site.contactPhone.replace(/[^+0-9]/g, "")}`} className="hover:underline">
                    {site.contactPhone}
                  </a>
                </li>
              )}
              <li>
                <Link href="/enquire" className="hover:underline">
                  Send us a message
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-on-inverse/15 border-t">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs opacity-75 sm:flex-row sm:justify-between sm:px-6">
            <p>
              © {new Date().getFullYear()} {BRAND.companyName}. Our certificates are records of attendance and
              completion, not accredited qualifications.
            </p>
            <nav aria-label="Legal" className="flex gap-6">
              <Link href="/privacy" className="hover:underline">
                Privacy notice
              </Link>
              <Link href="/terms" className="hover:underline">
                Terms of use
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
