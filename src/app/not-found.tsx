import Link from "next/link";
import { buttonClasses } from "@/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
      <p className="text-muted font-mono text-sm">404</p>
      <h1 className="font-display text-h1 mt-3">We couldn&apos;t find that page.</h1>
      <p className="text-muted mt-3">It may have moved, or you may not have access to it.</p>
      <Link href="/dashboard" className={buttonClasses("primary", "lg", "mt-8 self-start")}>
        Go home
      </Link>
    </main>
  );
}
