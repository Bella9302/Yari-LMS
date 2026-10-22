import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { clientIp } from "@/server/audit";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { hashIp } from "@/server/crypto/blind-index";
import { verifyCertificate } from "@/server/certificates/service";
import { BRAND } from "@/lib/brand";
import { formatDuration } from "@/lib/certificates";
import { formatDate } from "@/lib/format";
import { CategoryTag, Notice } from "@/ui/primitives";
import { VerifyForm } from "@/ui/verify-form";

// Holders' names are shown here by design, but search engines shouldn't index them.
export const metadata: Metadata = { title: "Certificate check", robots: { index: false, follow: false } };

export default async function VerifyResultPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Generous for people, slow for anyone trying to guess codes.
  const allowed = await consumeRateLimit(`verify:${hashIp(await clientIp()) ?? "unknown"}`, 60, 15 * 60_000);
  const result = allowed ? await verifyCertificate(decodeURIComponent(code)) : null;

  return (
    <section className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6 sm:py-20">
      <Link href="/verify" className="eyebrow hover:text-fg">
        ← Verify a certificate
      </Link>

      {!result && (
        <Notice tone="danger">
          Too many checks from your connection. Please try again in a few minutes.
        </Notice>
      )}

      {result?.status === "invalid" && (
        <>
          <h1 className="font-display text-h1 flex items-center gap-3">
            <XCircle aria-hidden className="text-danger size-9 shrink-0" /> Not found
          </h1>
          <p className="text-muted text-lg">
            No YARI Academy certificate has this code. Check it against the certificate and try again.
          </p>
          <VerifyForm defaultValue={decodeURIComponent(code)} />
        </>
      )}

      {result?.status === "revoked" && (
        <>
          <h1 className="font-display text-h1 flex items-center gap-3">
            <XCircle aria-hidden className="text-danger size-9 shrink-0" /> Not valid
          </h1>
          <Notice
            tone="danger"
            title={`Certificate ${result.code} was withdrawn on ${formatDate(result.revokedAt)}.`}
          >
            It was issued for {result.courseTitle} but is no longer valid. If you were given this certificate,
            ask the holder for a current one.
          </Notice>
        </>
      )}

      {result?.status === "valid" && (
        <>
          <div>
            <p className="text-success flex items-center gap-2 font-medium">
              <CheckCircle2 aria-hidden className="size-5" /> Genuine certificate
            </p>
            <h1 className="sr-only">Certificate {result.code} is genuine</h1>
          </div>
          <article
            data-category={result.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
            className="border-fg bg-surface relative border p-6 sm:p-10"
            aria-label={result.wording.heading}
          >
            <span aria-hidden className="bg-accent absolute -top-px left-0 h-1 w-32" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="eyebrow">{result.wording.heading}</p>
              <CategoryTag category={result.category} />
            </div>
            <p className="text-muted mt-8">This certifies that</p>
            <p className="font-display mt-1 text-[clamp(2rem,7vw,3.5rem)] leading-[1.05] break-words">
              {result.learnerName}
            </p>
            <p className="text-muted mt-5">has completed</p>
            <p className="font-display text-h2 mt-1 break-words">{result.courseTitle}</p>
            <dl className="border-fg mt-8 grid gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-3">
              <div>
                <dt className="eyebrow">Completed</dt>
                <dd className="mt-1">{formatDate(result.completedAt)}</dd>
              </div>
              {formatDuration(result.durationMinutes) && (
                <div>
                  <dt className="eyebrow">Course length</dt>
                  <dd className="mt-1">{formatDuration(result.durationMinutes)}</dd>
                </div>
              )}
              <div>
                <dt className="eyebrow">Code</dt>
                <dd className="mt-1 font-mono tracking-wide">{result.code}</dd>
              </div>
            </dl>
            <div className="border-fg mt-8 border-l-2 pl-4">
              <p className="font-medium">{result.wording.statement}</p>
              {result.wording.details.map((d) => (
                <p key={d} className="text-muted text-sm">
                  {d}
                </p>
              ))}
              <p className="text-muted mt-2 text-sm">
                Issued by {BRAND.companyName} through {result.academyName} on {formatDate(result.issuedAt)}.
              </p>
            </div>
          </article>
          <p className="text-muted text-sm">
            This page confirms the certificate details held by {BRAND.companyName}. If anything here differs
            from the document you were shown, the document has been altered.
          </p>
        </>
      )}
    </section>
  );
}
