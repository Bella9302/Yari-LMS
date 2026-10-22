import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const stage = authStage(await getCurrentSession());
  if (stage === "anonymous") redirect("/login");
  if (stage !== "needs-2fa") redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <>
      <p className="eyebrow">Step 2 of 2</p>
      <h1 className="font-display text-h1 mt-3">Enter your code</h1>
      <p className="text-muted mt-3">
        Open your authenticator app and enter the 6-digit code for YARI Academy. Lost your phone? Enter one of
        your recovery codes instead.
      </p>
      <TwoFactorForm next={next} />
    </>
  );
}
