import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { createDataRequestAction, setMarketingConsentAction } from "@/server/actions/account";
import { formatDate } from "@/lib/format";
import { Button } from "@/ui/button";
import { Notice, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Privacy" };

const CONSENT_LABELS = {
  TERMS: "Terms of use",
  PRIVACY: "Privacy notice",
  MARKETING: "Course news by email",
} as const;

export default async function AccountPrivacyPage() {
  const { user } = await requireUser();
  const [consents, requests] = await Promise.all([
    db.consent.findMany({ where: { userId: user.id }, orderBy: { grantedAt: "desc" } }),
    db.dataRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const marketingOn = consents.some((c) => c.purpose === "MARKETING" && !c.withdrawnAt);
  const openRequest = (type: "EXPORT" | "DELETE") =>
    requests.find((r) => r.type === type && (r.status === "PENDING" || r.status === "IN_PROGRESS"));

  return (
    <div className="space-y-12">
      <section>
        <h2 className="font-display text-h3">Your consents</h2>
        <ul className="divide-line border-line mt-4 divide-y border-y">
          {consents.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                {CONSENT_LABELS[c.purpose]}{" "}
                <span className="text-muted font-mono text-xs">v{c.policyVersion}</span>
              </span>
              <span className="text-muted text-sm">
                {c.withdrawnAt
                  ? `Withdrawn ${formatDate(c.withdrawnAt)}`
                  : `Given ${formatDate(c.grantedAt)}`}
              </span>
            </li>
          ))}
        </ul>
        <form action={setMarketingConsentAction} className="mt-5 flex flex-wrap items-center gap-4">
          <input type="hidden" name="enabled" value={marketingOn ? "false" : "true"} />
          <p className="flex-1 text-[0.95rem]">
            Course news by email is <strong>{marketingOn ? "on" : "off"}</strong>.
          </p>
          <Button type="submit" variant="secondary" size="sm">
            {marketingOn ? "Turn off" : "Turn on"}
          </Button>
        </form>
        <p className="text-muted mt-4 text-sm">
          Read the{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy notice
          </Link>{" "}
          to see how we use your information.
        </p>
      </section>

      <section className="border-line border-t pt-8">
        <h2 className="font-display text-h3">Your information</h2>
        <p className="text-muted mt-2">
          Under POPIA you can ask for a copy of what we hold about you, or ask us to delete your account. We
          respond within 30 days.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <RequestCard
            type="EXPORT"
            title="Download my data"
            body="We'll prepare a copy of your profile, training records and activity."
            open={Boolean(openRequest("EXPORT"))}
          />
          <RequestCard
            type="DELETE"
            title="Delete my account"
            body="We'll remove your personal details. Completion records may be kept where the law requires."
            open={Boolean(openRequest("DELETE"))}
          />
        </div>
        {requests.length > 0 && (
          <ul className="mt-8 space-y-2 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <Tag>{r.status.replace("_", " ").toLowerCase()}</Tag>
                <span>{r.type === "EXPORT" ? "Data copy" : "Account deletion"}</span>
                <span className="text-muted">requested {formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestCard({
  type,
  title,
  body,
  open,
}: {
  type: "EXPORT" | "DELETE";
  title: string;
  body: string;
  open: boolean;
}) {
  return (
    <form action={createDataRequestAction} className="border-line flex flex-col border p-5">
      <input type="hidden" name="type" value={type} />
      <p className="font-medium">{title}</p>
      <p className="text-muted mt-1 flex-1 text-sm">{body}</p>
      {open ? (
        <Notice className="mt-4">Request received — we&apos;re working on it.</Notice>
      ) : (
        <Button
          type="submit"
          variant={type === "DELETE" ? "danger" : "secondary"}
          size="sm"
          className="mt-4 self-start"
        >
          Request
        </Button>
      )}
    </form>
  );
}
