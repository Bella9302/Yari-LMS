import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <p className="eyebrow">Account recovery</p>
      <h1 className="font-display text-h1 mt-3">Reset your password</h1>
      <p className="text-muted mt-3">
        Enter the email address you sign in with and we&apos;ll send you a link.
      </p>
      <ForgotForm />
      <p className="border-line text-muted mt-8 border-t pt-6 text-sm">
        Remembered it?{" "}
        <Link href="/login" className="text-fg underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
