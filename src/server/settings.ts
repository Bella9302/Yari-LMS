import "server-only";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isSuperAdmin } from "@/server/rbac";
import { PermissionError, type Actor } from "@/server/pii/users";
import { BRAND } from "@/lib/brand";
import { platformAccreditationSchema, type PlatformAccreditation } from "@/lib/certificates";

// Admin-editable platform settings, stored as JSON in PlatformSetting and validated on every
// read so a bad row can never break a page (it falls back to the defaults).

export const siteSettingsSchema = z.object({
  academyName: z.string().trim().min(2).max(60).default(BRAND.academyName),
  /** Shown on the public site and certificates when set. */
  contactEmail: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
  contactPhone: z.string().trim().max(30).default(""),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

const SCHEMAS = { site: siteSettingsSchema, accreditation: platformAccreditationSchema } as const;
type Key = keyof typeof SCHEMAS;
type Value<K extends Key> = z.infer<(typeof SCHEMAS)[K]>;

async function read<K extends Key>(key: K): Promise<Value<K>> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  const parsed = SCHEMAS[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SCHEMAS[key].parse({})) as Value<K>;
}

/** Per-request cached reads. */
export const siteSettings = cache((): Promise<SiteSettings> => read("site"));
export const accreditationSettings = cache((): Promise<PlatformAccreditation> => read("accreditation"));

export async function updateSettings<K extends Key>(actor: Actor, key: K, input: unknown): Promise<Value<K>> {
  if (!isSuperAdmin(actor.roles)) throw new PermissionError();
  const value = SCHEMAS[key].parse(input) as Value<K>;
  if (key === "accreditation") {
    const a = value as PlatformAccreditation;
    if (a.enabled && (!a.body || !a.providerNumber)) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["providerNumber"],
          message: "Enter the accrediting body and provider number first.",
          input,
        },
      ]);
    }
  }
  await db.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await audit({
    actorId: actor.id,
    action: "settings.updated",
    entityType: "PlatformSetting",
    entityId: key,
    meta: value,
  });
  return value;
}
