"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentQrAction } from "@/server/actions/tracking";
import { Monogram } from "@/ui/monogram";

type Qr = Awaited<ReturnType<typeof currentQrAction>>;

/** Full-screen, high-contrast check-in code that changes every 30 seconds. */
export function QrPresenter({
  sessionId,
  backHref,
  title,
  subtitle,
  initial,
}: {
  sessionId: string;
  backHref: string;
  title: string;
  subtitle: string;
  initial: Qr;
}) {
  const [qr, setQr] = useState(initial);
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async (delay: number) => {
      timer = setTimeout(async () => {
        try {
          const next = await currentQrAction(sessionId);
          setQr(next);
          setError(false);
          void refresh(Math.max(1000, next.refreshInMs + 300));
        } catch {
          setError(true);
          void refresh(5000);
        }
      }, delay);
    };
    void refresh(Math.max(1000, initial.refreshInMs + 300));
    return () => clearTimeout(timer);
  }, [sessionId, initial.refreshInMs]);

  return (
    <div className="bg-paper text-ink fixed inset-0 z-50 flex flex-col">
      <header className="border-ink/10 flex items-center gap-3 border-b px-6 py-4">
        <Monogram className="h-7 w-auto" decorative />
        <span className="font-display flex-1 truncate text-xl">{title}</span>
        <Link href={backHref} className="text-sm underline underline-offset-4">
          Close
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="eyebrow !text-ink/70">{subtitle}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,4rem)] leading-none">Scan to check in</h1>
        {qr.open ? (
          <div
            className="aspect-square w-[min(70vh,80vw)] bg-white p-4 [&_svg]:size-full"
            role="img"
            aria-label="Check-in QR code"
            data-checkin-url={qr.url}
            dangerouslySetInnerHTML={{ __html: qr.svg }}
          />
        ) : (
          <p className="max-w-md text-lg">Check-in opens 30 minutes before the session starts.</p>
        )}
        <p className="text-ink/70 font-mono text-sm" aria-live="polite">
          {qr.present} checked in · the code changes every 30 seconds{error && " · reconnecting…"}
        </p>
      </main>
    </div>
  );
}
