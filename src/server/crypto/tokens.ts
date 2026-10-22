import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";

/** 160-bit random token, safe for URLs and cookies. */
export function generateToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(20));
}

/** Row ids generated in app code (needed before insert for AAD binding). */
export function newId(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(15));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Human-friendly code like "K7QM-3XPA" (Crockford-style alphabet, no 0/O/1/I/L). */
export function generateReadableCode(groups = 2, groupLength = 4): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const chars: string[] = [];
  // Rejection sampling: 240 is the largest multiple of 30 below 256, so there is no modulo bias.
  while (chars.length < groups * groupLength) {
    for (const b of randomBytes(groups * groupLength)) {
      if (b < 240 && chars.length < groups * groupLength) chars.push(alphabet[b % alphabet.length]!);
    }
  }
  const out: string[] = [];
  for (let i = 0; i < groups; i++) out.push(chars.slice(i * groupLength, (i + 1) * groupLength).join(""));
  return out.join("-");
}
