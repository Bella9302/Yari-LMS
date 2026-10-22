import { createHmac } from "node:crypto";
import { env } from "@/server/env";

// Each purpose gets its own domain so equal inputs never collide across purposes.
type Purpose = "email" | "id-number" | "ip" | "rate-limit";

export function blindIndex(purpose: Purpose, normalisedValue: string): string {
  return createHmac("sha256", Buffer.from(env().BLIND_INDEX_KEY, "base64"))
    .update(`${purpose}\u0000${normalisedValue}`)
    .digest("base64url");
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailIndex(email: string): string {
  return blindIndex("email", normaliseEmail(email));
}

/** SA IDs keep digits only; passports are upper-cased alphanumerics, scoped by issuing country. */
export function idNumberIndex(type: "SA_ID" | "PASSPORT", value: string, passportCountry?: string | null) {
  const normalised =
    type === "SA_ID"
      ? `SA_ID:${value.replace(/\D/g, "")}`
      : `PASSPORT:${(passportCountry ?? "").toUpperCase()}:${value.replace(/[^a-z0-9]/gi, "").toUpperCase()}`;
  return blindIndex("id-number", normalised);
}

export function hashIp(ip: string | null | undefined): string | null {
  return ip ? blindIndex("ip", ip).slice(0, 22) : null;
}
