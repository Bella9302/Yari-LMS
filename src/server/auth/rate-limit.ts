import "server-only";
import { db } from "@/server/db";
import { blindIndex } from "@/server/crypto/blind-index";

const keyOf = (rawKey: string) => blindIndex("rate-limit", rawKey);

/**
 * Fixed-window-ish limiter backed by Postgres (one VPS, no Redis).
 * Records the hit first and then counts, so a burst of parallel requests can't all slip
 * under the limit. Returns true if the action is allowed.
 */
export async function consumeRateLimit(rawKey: string, limit: number, windowMs: number): Promise<boolean> {
  const key = keyOf(rawKey);
  await db.rateLimitHit.create({ data: { key } });
  const hits = await recentHitsByKey(key, windowMs);
  if (Math.random() < 0.01) {
    await db.rateLimitHit.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  }
  return hits <= limit;
}

function recentHitsByKey(key: string, windowMs: number) {
  return db.rateLimitHit.count({ where: { key, at: { gte: new Date(Date.now() - windowMs) } } });
}

/** Counts hits without recording one. */
export function recentHits(rawKey: string, windowMs: number) {
  return recentHitsByKey(keyOf(rawKey), windowMs);
}

export async function recordHit(rawKey: string) {
  await db.rateLimitHit.create({ data: { key: keyOf(rawKey) } });
}

export const LOGIN_LIMITS = {
  /** Failed sign-ins for one email from one connection. */
  perConnection: { max: 5, windowMs: 15 * 60_000 },
  /** Failed sign-ins for one email from anywhere (slows distributed guessing). */
  perEmail: { max: 30, windowMs: 60 * 60_000 },
} as const;

/**
 * Whether sign-in for this email should be refused for now. It is driven by failures for the
 * email (whether or not an account exists), so it never reveals which emails are registered,
 * and someone elsewhere can't lock a learner out for longer than an hour.
 */
export function loginThrottled(failures: { perConnection: number; perEmail: number }) {
  return (
    failures.perConnection >= LOGIN_LIMITS.perConnection.max || failures.perEmail >= LOGIN_LIMITS.perEmail.max
  );
}
