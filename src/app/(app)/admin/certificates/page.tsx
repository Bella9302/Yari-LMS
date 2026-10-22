import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/guards";
import { adminCertificates } from "@/server/certificates/service";
import { reissueCertificateAction } from "@/server/actions/public";
import { formatDate } from "@/lib/format";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { EmptyState, PageHeader, Tag } from "@/ui/primitives";
import { RevokeForm } from "./revoke-form";

export const metadata: Metadata = { title: "Certificates" };

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user } = await requireRole("SUPER_ADMIN");
  const q = (await searchParams).q ?? "";
  const rows = await adminCertificates({ id: user.id, roles: user.roles }, q);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Certificates"
        description="Issued automatically when a learner completes a course. Revoke one if it was issued in error; reissue to correct a name."
      />
      <form className="flex flex-col gap-3 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">
          Code or course
        </label>
        <Input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Code (YG-…) or course title"
          className="sm:max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q ? "No certificates match" : "No certificates yet"} />
      ) : (
        <ul className="border-line divide-line divide-y border-y">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono tracking-wide">{c.code}</span>
                  {c.revokedAt ? <Tag tone="danger">Revoked</Tag> : <Tag tone="success">Valid</Tag>}
                  {c.accredited && <Tag tone="accent">Accredited</Tag>}
                </p>
                <p className="mt-1 font-medium break-words">{c.learnerName}</p>
                <p className="text-muted text-sm break-words">
                  {c.courseTitle} · completed {formatDate(c.completedAt)} · issued {formatDate(c.issuedAt)}
                </p>
                {c.revokedAt && (
                  <p className="text-muted text-sm">
                    Revoked {formatDate(c.revokedAt)}: {c.revokeReason}
                  </p>
                )}
              </div>
              {!c.revokedAt && (
                <div className="flex flex-wrap items-start gap-2 md:max-w-sm md:justify-end">
                  <Link href={`/verify/${c.code}`} className="text-sm underline underline-offset-4">
                    Public page
                  </Link>
                  <a href={`/certificates/${c.code}`} className="text-sm underline underline-offset-4">
                    PDF
                  </a>
                  {c.reissuable && (
                    <form action={reissueCertificateAction}>
                      <input type="hidden" name="code" value={c.code} />
                      <Button type="submit" variant="ghost" size="sm">
                        Reissue
                      </Button>
                    </form>
                  )}
                  <RevokeForm code={c.code} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
