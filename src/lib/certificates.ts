// Certificate rules shared by the issuer, the PDF and the public verification page.
//
// YARI GROUP is not accredited. Until a Super Admin switches accreditation on (with the provider
// details) AND the course carries unit standards, every certificate prints the
// non-accreditation statement, and nothing a template or course can set removes it.
import { z } from "zod";
import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// Verification codes: YG-XXXX-XXXX
// ---------------------------------------------------------------------------

/** No 0/O, 1/I/L or U: nothing that can be misread off paper or a phone screen. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_RE = new RegExp(`^YG-[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`);

/** `pick(n)` must return a uniform integer in [0, n). */
export function makeCode(pick: (n: number) => number): string {
  let body = "";
  for (let i = 0; i < 8; i++) body += CODE_ALPHABET[pick(CODE_ALPHABET.length)];
  return `YG-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Accepts what people type ("yg 7k3m q9tp", "7K3MQ9TP") and returns the canonical code, or null. */
export function normaliseCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const body = raw.startsWith("YG") && raw.length === 10 ? raw.slice(2) : raw;
  if (body.length !== 8) return null;
  const code = `YG-${body.slice(0, 4)}-${body.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Accreditation (off until YARI GROUP is accredited)
// ---------------------------------------------------------------------------

export const platformAccreditationSchema = z.object({
  enabled: z.boolean().default(false),
  /** e.g. "QCTO" or a SETA name. */
  body: z.string().trim().max(120).default(""),
  providerNumber: z.string().trim().max(60).default(""),
});
export type PlatformAccreditation = z.infer<typeof platformAccreditationSchema>;

export const courseAccreditationSchema = z.object({
  unitStandards: z
    .array(z.object({ id: z.string().trim().min(1).max(20), title: z.string().trim().min(1).max(200) }))
    .max(30)
    .default([]),
  nqfLevel: z.number().int().min(1).max(10).nullable().default(null),
  credits: z.number().int().min(1).max(999).nullable().default(null),
});
export type CourseAccreditation = z.infer<typeof courseAccreditationSchema>;

/** What gets frozen onto an accredited certificate. */
export interface IssuedAccreditation extends CourseAccreditation {
  body: string;
  providerNumber: string;
}

/**
 * Accreditation only applies when the platform switch is on, the provider details are filled
 * in, and the course has at least one unit standard. Anything less: not accredited.
 */
export function accreditationFor(
  platform: PlatformAccreditation,
  course: unknown,
): IssuedAccreditation | null {
  if (!platform.enabled || !platform.body || !platform.providerNumber) return null;
  const parsed = courseAccreditationSchema.safeParse(course ?? {});
  if (!parsed.success || parsed.data.unitStandards.length === 0) return null;
  return { body: platform.body, providerNumber: platform.providerNumber, ...parsed.data };
}

export interface CertificateWording {
  heading: string;
  accredited: boolean;
  /** Printed on every certificate. For unaccredited ones this is the non-accreditation statement. */
  statement: string;
  details: string[];
}

export function certificateWording(accreditation: unknown): CertificateWording {
  const parsed = courseAccreditationSchema
    .extend({ body: z.string().min(1), providerNumber: z.string().min(1) })
    .safeParse(accreditation);
  if (accreditation == null || !parsed.success || parsed.data.unitStandards.length === 0) {
    return {
      heading: "Certificate of Completion",
      accredited: false,
      statement: BRAND.nonAccreditationStatement,
      details: [],
    };
  }
  const a = parsed.data;
  return {
    heading: "Certificate of Completion",
    accredited: true,
    statement: `Issued by an accredited provider: ${a.body}, provider number ${a.providerNumber}.`,
    details: [
      ...a.unitStandards.map((u) => `Unit standard ${u.id}: ${u.title}`),
      ...(a.nqfLevel ? [`NQF level ${a.nqfLevel}`] : []),
      ...(a.credits ? [`${a.credits} credits`] : []),
    ],
  };
}

/** "6 hours", "45 minutes", "1.5 hours". */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.round((minutes / 60) * 2) / 2;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

/** One unit standard per line: "259617 — Apply AI tools safely" (also accepts ":" or "-" or a space). */
export function parseUnitStandards(text: string): { id: string; title: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^([A-Za-z0-9/.-]+?)\s*(?:[—–:-]\s*|\s+)(.+)$/.exec(line);
      if (!m) throw new Error(`Couldn't read "${line}". Use: unit standard ID — title.`);
      return { id: m[1]!, title: m[2]!.trim() };
    });
}

export function formatUnitStandards(list: { id: string; title: string }[]): string {
  return list.map((u) => `${u.id} — ${u.title}`).join("\n");
}
