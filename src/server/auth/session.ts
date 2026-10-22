import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { generateToken, sha256 } from "@/server/crypto/tokens";
import type { Role, UserStatus } from "@/generated/prisma/client";

const SESSION_DAYS = 14;
const REFRESH_WHEN_DAYS_LEFT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-yari_session" : "yari_session";

export interface RoleGrant {
  role: Role;
  organizationId: string | null;
}

export interface SessionUser {
  id: string;
  status: UserStatus;
  totpEnabled: boolean;
  roles: RoleGrant[];
}

export interface ValidSession {
  sessionId: string;
  twoFactorVerified: boolean;
  expiresAt: Date;
  user: SessionUser;
}

export async function createSession(
  userId: string,
  opts: { twoFactorVerified: boolean; ipHash?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.authSession.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt,
      twoFactorVerified: opts.twoFactorVerified,
      ipHash: opts.ipHash ?? null,
      userAgent: opts.userAgent?.slice(0, 255) ?? null,
    },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<ValidSession | null> {
  const sessionId = sha256(token);
  const row = await db.authSession.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          totpEnabledAt: true,
          roles: { select: { role: true, organizationId: true } },
        },
      },
    },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now() || row.user.status !== "ACTIVE") {
    await db.authSession.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }
  let expiresAt = row.expiresAt;
  if (expiresAt.getTime() - Date.now() < REFRESH_WHEN_DAYS_LEFT * DAY_MS) {
    expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
    await db.authSession.update({ where: { id: sessionId }, data: { expiresAt } });
  }
  return {
    sessionId,
    twoFactorVerified: row.twoFactorVerified,
    expiresAt,
    user: {
      id: row.user.id,
      status: row.user.status,
      totpEnabled: row.user.totpEnabledAt != null,
      roles: row.user.roles,
    },
  };
}

export async function markSessionTwoFactorVerified(sessionId: string) {
  await db.authSession.update({ where: { id: sessionId }, data: { twoFactorVerified: true } });
}

export async function invalidateSession(sessionId: string) {
  await db.authSession.deleteMany({ where: { id: sessionId } });
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string) {
  await db.authSession.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** The current request's session (memoised per request). */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
