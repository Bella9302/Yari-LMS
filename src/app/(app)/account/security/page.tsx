import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requiresTwoFactor } from "@/server/rbac";
import { requireUser } from "@/server/guards";
import { signOutOtherSessionsAction } from "@/server/auth/actions";
import { buttonClasses, Button } from "@/ui/button";
import { Tag } from "@/ui/primitives";
import { ChangePasswordForm, DisableTwoFactorForm, RegenerateCodesForm } from "./security-forms";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const { session, user } = await requireUser();
  const [otherSessions, codesLeft] = await Promise.all([
    db.authSession.count({
      where: { userId: user.id, id: { not: session.sessionId }, expiresAt: { gt: new Date() } },
    }),
    db.recoveryCode.count({ where: { userId: user.id, usedAt: null } }),
  ]);
  const required = requiresTwoFactor(user.roles);

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-h3">Two-step verification</h2>
          <Tag tone={user.totpEnabled ? "success" : "neutral"}>{user.totpEnabled ? "On" : "Off"}</Tag>
        </div>
        {user.totpEnabled ? (
          <>
            <p className="text-muted mt-2">
              You have <span className="text-fg font-mono">{codesLeft}</span> unused recovery code
              {codesLeft === 1 ? "" : "s"}.
            </p>
            <div className="mt-6 space-y-8">
              <RegenerateCodesForm />
              {!required && <DisableTwoFactorForm />}
            </div>
          </>
        ) : (
          <>
            <p className="text-muted mt-2">
              Add a code from your phone when you sign in, so a stolen password isn&apos;t enough.
            </p>
            <Link href="/setup-2fa" className={buttonClasses("primary", "md", "mt-5")}>
              Set up two-step verification
            </Link>
          </>
        )}
      </section>

      <section className="border-line border-t pt-8">
        <h2 className="font-display text-h3">Password</h2>
        <ChangePasswordForm />
      </section>

      <section className="border-line border-t pt-8">
        <h2 className="font-display text-h3">Other devices</h2>
        <p className="text-muted mt-2">
          You&apos;re signed in on <span className="text-fg font-mono">{otherSessions}</span> other device
          {otherSessions === 1 ? "" : "s"}.
        </p>
        {otherSessions > 0 && (
          <form action={signOutOtherSessionsAction} className="mt-5">
            <Button type="submit" variant="secondary">
              Sign out everywhere else
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
