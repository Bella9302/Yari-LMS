import "server-only";
import { db } from "@/server/db";
import { dec } from "@/server/pii/fields";

/** Resolves actor ids to names for audit views (admin-only screens). */
export async function actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const profiles = await db.userProfile.findMany({
    where: { userId: { in: unique } },
    select: { userId: true, fullNameEnc: true },
  });
  return new Map(profiles.map((p) => [p.userId, dec.fullName(p.userId, p.fullNameEnc)]));
}
