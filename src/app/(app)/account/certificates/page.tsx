import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/server/guards";
import { myCertificates } from "@/server/certificates/service";
import { BRAND } from "@/lib/brand";
import { formatDate } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { CategoryTag, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const { user } = await requireUser();
  const certs = await myCertificates(user.id);
  return (
    <div className="space-y-8">
      <p className="text-muted">
        You get a Certificate of Completion for every course you complete. Anyone you share it with can check
        it at{" "}
        <Link href="/verify" className="text-fg underline underline-offset-4">
          the verification page
        </Link>{" "}
        using its code.
      </p>
      {certs.length === 0 ? (
        <p className="border-line-strong border border-dashed px-5 py-8 text-center">
          Complete a course to get your first certificate.
        </p>
      ) : (
        <ul className="space-y-4">
          {certs.map((c) => (
            <li
              key={c.code}
              data-category={c.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
              className="border-line bg-surface flex flex-col gap-4 border p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <CategoryTag category={c.category} />
                <p className="font-display text-h3 mt-2 break-words">{c.courseTitle}</p>
                <p className="text-muted mt-1 text-sm">
                  Completed {formatDate(c.completedAt)} ·{" "}
                  <span className="text-fg font-mono tracking-wide">{c.code}</span>
                </p>
              </div>
              {c.revokedAt ? (
                <Tag tone="danger">Revoked</Tag>
              ) : (
                <a
                  href={`/certificates/${c.code}`}
                  className={buttonClasses("secondary", "md", "shrink-0")}
                  aria-label={`Download PDF: ${c.courseTitle} certificate`}
                >
                  <Download aria-hidden className="size-4" /> Download PDF
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted border-line border-t pt-4 text-sm">{BRAND.nonAccreditationStatement}</p>
    </div>
  );
}
