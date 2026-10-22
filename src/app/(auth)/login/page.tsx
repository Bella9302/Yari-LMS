import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { Notice } from "@/ui/primitives";
import { safeNextPath } from "@/lib/form-state";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;
  if (authStage(await getCurrentSession()) === "ok") redirect(safeNextPath(next));

  return (
    <>
      <p className="eyebrow">Welcome back</p>
      <h1 className="font-display text-h1 mt-3">Sign in</h1>
      <p className="text-muted mt-3">Accounts are by invitation from YARI GROUP or your company.</p>
      {reset && (
        <Notice tone="success" className="mt-6">
          Your password has been changed. Sign in with your new password.
        </Notice>
      )}
      <LoginForm next={next} />
      <p className="border-line text-muted mt-8 border-t pt-6 text-sm">
        Trouble signing in?{" "}
        <Link href="/forgot-password" className="text-fg underline underline-offset-4">
          Reset your password
        </Link>
        .
      </p>
    </>
  );
}
