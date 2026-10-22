import "server-only";
import { db } from "@/server/db";
import { evaluateAllCourses, sendNewFlagDigests } from "@/server/tracking/at-risk";

const DAY = 24 * 60 * 60 * 1000;

/** Removes expired security records that are no longer useful. */
export async function housekeeping(now = new Date()) {
  const [sessions, tokens, hits] = await Promise.all([
    db.authSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - 30 * DAY) } },
          { usedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
        ],
      },
    }),
    db.rateLimitHit.deleteMany({ where: { at: { lt: new Date(now.getTime() - DAY) } } }),
  ]);
  return { sessions: sessions.count, tokens: tokens.count, rateLimitHits: hits.count };
}

/** Run once a day (see scripts/nightly.ts and the deployment notes). Safe to run more often. */
export async function runNightly(now = new Date()) {
  const atRisk = await evaluateAllCourses(now);
  const digests = await sendNewFlagDigests(now);
  const cleaned = await housekeeping(now);
  return { atRisk, digests, cleaned };
}
