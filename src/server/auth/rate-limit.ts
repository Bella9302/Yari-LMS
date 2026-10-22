import "server-only";
import { db } from "@/server/db";
import { blindIndex } from "@/server/crypto/blind-index";

/**
 * Fixed-window-ish limiter backed by Postgres (one VPS, no Redis).
 * Returns true if the action is allowed and records the hit.
 */
export async function consumeRateLimit(rawKey: string, limit: number, windowMs: number): Promise<boolean> {
  const key = blindIndex("rate-limit", rawKey);
  const since = new Date(Date.now() - windowMs);
  const hits = await db.rateLimitHit.count({ where: { key, at: { gte: since } } });
  if (hits >= limit) return false;
  await db.rateLimitHit.create({ data: { key } });
  if (Math.random() < 0.01) {
    await db.rateLimitHit.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  }
  return true;
}

/** Lockout after repeated failures on one account: 5 failures -> 15 min, doubling, capped at 24h. */
export function lockoutUntil(failedLogins: number, now = Date.now()): Date | null {
  if (failedLogins < 5) return null;
  const minutes = Math.min(15 * 2 ** (failedLogins - 5), 24 * 60);
  return new Date(now + minutes * 60 * 1000);
}
