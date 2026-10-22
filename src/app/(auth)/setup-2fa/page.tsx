import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { authStage, requiresTwoFactor } from "@/server/rbac";
import { pendingTotpEnrolment } from "@/server/auth/totp";
import { getOwnIdentity } from "@/server/pii/users";
import { EnrolForm } from "./enrol-form";

export const metadata: Metadata = { title: "Set up two-step verification" };

export default async function SetupTwoFactorPage() {
  const session = await getCurrentSession();
  const stage = authStage(session);
  if (stage === "anonymous") redirect("/login");
  if (stage === "needs-2fa") redirect("/login/2fa");
  if (session!.user.totpEnabled) redirect("/account/security");

  const identity = await getOwnIdentity(session!.user.id);
  const { qrSvg, manualKey } = await pendingTotpEnrolment(session!.user.id, identity.email);
  const required = requiresTwoFactor(session!.user.roles);

  return (
    <>
      <p className="eyebrow">{required ? "Required for your role" : "Recommended"}</p>
      <h1 className="font-display text-h1 mt-3">Protect your account</h1>
      <p className="text-muted mt-3">
        {required
          ? "Trainers and administrators handle learners' personal information, so a second step is required when signing in."
          : "Add a second step when signing in, using an authenticator app on your phone."}
      </p>

      <ol className="mt-8 space-y-6">
        <li>
          <p className="font-medium">1. Install an authenticator app</p>
          <p className="text-muted mt-1 text-sm">
            Google Authenticator, Microsoft Authenticator, or any TOTP app.
          </p>
        </li>
        <li>
          <p className="font-medium">2. Scan this code</p>
          <div
            className="border-line mt-3 inline-block border bg-white p-3 [&_svg]:size-44"
            role="img"
            aria-label="QR code for your authenticator app"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-muted mt-3 text-sm">Can&apos;t scan? Enter this key in the app:</p>
          <p className="mt-1 font-mono text-sm break-all select-all">{manualKey}</p>
        </li>
        <li>
          <p className="font-medium">3. Enter the 6-digit code it shows</p>
          <EnrolForm />
        </li>
      </ol>
    </>
  );
}
