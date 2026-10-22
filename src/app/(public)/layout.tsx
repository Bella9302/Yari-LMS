import Link from "next/link";
import { Monogram } from "@/ui/monogram";
import { ThemeToggle } from "@/ui/theme";
import { buttonClasses } from "@/ui/button";
import { BRAND } from "@/lib/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Monogram className="h-7 w-auto" decorative />
            <span className="font-display text-lg">{BRAND.academyName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className={buttonClasses("primary", "md")}>
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-line border-t">
        <div className="text-muted mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {BRAND.companyName}
          </p>
          <nav aria-label="Legal" className="flex gap-6">
            <Link href="/privacy" className="hover:text-fg">
              Privacy notice
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms of use
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
