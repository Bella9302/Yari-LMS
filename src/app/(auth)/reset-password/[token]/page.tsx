import type { Metadata } from "next";
import Link from "next/link";
import { peekToken } from "@/server/pii/users";
import { buttonClasses } from "@/ui/button";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await peekToken(token, "PASSWORD_RESET");

  if (!valid) {
    return (
      <>
        <h1 className="font-display text-h1">This link has expired</h1>
        <p className="text-muted mt-3">
          Reset links work once and last an hour. Request a new one to continue.
        </p>
        <Link href="/forgot-password" className={buttonClasses("primary", "lg", "mt-8 w-full")}>
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">Account recovery</p>
      <h1 className="font-display text-h1 mt-3">Choose a new password</h1>
      <p className="text-muted mt-3">You&apos;ll be signed out everywhere else once it&apos;s changed.</p>
      <ResetForm token={token} />
    </>
  );
}
