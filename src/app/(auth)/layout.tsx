import Link from "next/link";
import { Monogram } from "@/ui/monogram";
import { ThemeToggle } from "@/ui/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Editorial brand panel — the "black card". */}
      <aside className="bg-ink text-paper relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <Monogram className="h-8 w-auto" decorative />
          <span className="font-mono text-xs tracking-[0.3em] uppercase">Yari Group</span>
        </Link>
        <Monogram
          className="pointer-events-none absolute -right-24 bottom-24 h-[70%] w-auto opacity-[0.06]"
          decorative
        />
        <div className="relative max-w-md">
          <p className="font-display text-[3.5rem] leading-[0.95] tracking-tight">
            Learn the work.
            <br />
            <span className="text-amber">Keep people safe.</span>
            <br />
            <span className="text-teal">Work smarter.</span>
          </p>
          <div className="text-paper/70 mt-10 flex gap-8 border-t border-white/20 pt-6 font-mono text-xs tracking-wider uppercase">
            <span>Health &amp; Safety</span>
            <span>AI &amp; Digital</span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 lg:invisible">
            <Monogram className="h-7 w-auto" decorative />
            <span className="font-display text-lg">YARI Academy</span>
          </Link>
          <ThemeToggle />
        </header>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:px-8"
        >
          <div className="animate-rise w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
