import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getOwnIdentity, peekToken } from "@/server/pii/users";
import { countryOptions } from "@/lib/countries";
import { buttonClasses } from "@/ui/button";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await peekToken(token, "INVITE");

  if (!invite) {
    return (
      <>
        <h1 className="font-display text-h1">This invitation has expired</h1>
        <p className="text-muted mt-3">
          Invitations last 7 days and work once. Ask the person who invited you to send a new one.
        </p>
        <Link href="/login" className={buttonClasses("secondary", "lg", "mt-8 w-full")}>
          Go to sign in
        </Link>
      </>
    );
  }

  // The token proves the visitor controls this inbox, so showing their own name/email is fine.
  const identity = await getOwnIdentity(invite.userId);
  const roles = await db.roleAssignment.findMany({
    where: { userId: invite.userId },
    select: { role: true },
  });
  const isLearner = roles.some((r) => r.role === "LEARNER");

  return (
    <>
      <p className="eyebrow">You&apos;re invited</p>
      <h1 className="font-display text-h1 mt-3">Set up your account</h1>
      <p className="text-muted mt-3">
        Signing in as <span className="text-fg font-medium">{identity.email}</span>
      </p>
      <AcceptInviteForm
        token={token}
        defaultName={identity.fullName}
        requireId={isLearner}
        countries={countryOptions()}
      />
    </>
  );
}
