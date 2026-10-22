"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Home, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Monogram } from "@/ui/monogram";
import { ThemeToggle } from "@/ui/theme";
import { cn } from "@/ui/cn";

export type NavKey = "home" | "org" | "admin" | "account";

const NAV: Record<NavKey, { href: string; label: string; icon: typeof Home }> = {
  home: { href: "/dashboard", label: "Home", icon: Home },
  org: { href: "/org", label: "Company", icon: Building2 },
  admin: { href: "/admin", label: "Admin", icon: ShieldCheck },
  account: { href: "/account", label: "Account", icon: UserRound },
};

export function AppShell({
  nav,
  displayName,
  roleLabel,
  logout,
  children,
}: {
  nav: NavKey[];
  displayName: string;
  roleLabel: string;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line bg-bg/90 supports-[backdrop-filter]:bg-bg/75 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Monogram className="h-7 w-auto" decorative />
            <span className="font-display sr-only text-lg tracking-tight sm:not-sr-only">YARI Academy</span>
          </Link>

          <nav aria-label="Main" className="hidden flex-1 md:block">
            <ul className="flex items-center gap-1">
              {nav.map((key) => {
                const item = NAV[key];
                const active = isActive(item.href);
                return (
                  <li key={key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative inline-flex h-16 items-center px-3 text-[0.95rem] transition-colors",
                        active ? "text-fg" : "text-muted hover:text-fg",
                        "after:bg-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:transition-transform",
                        active ? "after:scale-x-100" : "after:scale-x-0",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <div className="mr-2 hidden text-right leading-tight lg:block">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-muted font-mono text-[0.65rem] tracking-wider uppercase">{roleLabel}</p>
            </div>
            <ThemeToggle />
            <form action={logout}>
              <button
                type="submit"
                className="hover:bg-sunk inline-grid size-11 place-items-center rounded-sm"
                aria-label="Sign out"
              >
                <LogOut className="size-5" strokeWidth={1.5} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-28 sm:px-6 sm:pt-12 md:pb-16">
        {children}
      </main>

      {/* Mobile tab bar: thumb-reachable, large targets. */}
      <nav
        aria-label="Main"
        className="border-line bg-bg/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map((key) => {
            const item = NAV[key];
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] tracking-wide",
                    active ? "text-fg" : "text-muted",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.5} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
