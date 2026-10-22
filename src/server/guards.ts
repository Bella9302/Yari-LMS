import "server-only";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { getCurrentSession, type SessionUser, type ValidSession } from "@/server/auth/session";
import { authStage, hasRole, type AuthStage } from "@/server/rbac";

const STAGE_REDIRECT: Record<Exclude<AuthStage, "ok">, string> = {
  anonymous: "/login",
  "needs-2fa": "/login/2fa",
  "needs-2fa-setup": "/setup-2fa",
};

/** Use at the top of every protected page, layout and server action. */
export async function requireUser(): Promise<{ session: ValidSession; user: SessionUser }> {
  const session = await getCurrentSession();
  const stage = authStage(session);
  if (stage !== "ok") redirect(STAGE_REDIRECT[stage]);
  return { session: session!, user: session!.user };
}

/** Like requireUser, but also requires one of the given roles. Responds 404 rather than revealing the page. */
export async function requireRole(...roles: Role[]) {
  const ctx = await requireUser();
  if (!roles.some((r) => hasRole(ctx.user.roles, r))) notFound();
  return ctx;
}
