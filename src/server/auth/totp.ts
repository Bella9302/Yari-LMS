import "server-only";
import { randomBytes } from "node:crypto";
import { createTOTPKeyURI, generateHOTP } from "@oslojs/otp";
import { decodeBase64, encodeBase64 } from "@oslojs/encoding";
import QRCode from "qrcode";
import { db } from "@/server/db";
import { aad, decryptField, encryptField } from "@/server/crypto/field-encryption";
import { generateReadableCode, safeEqual, sha256 } from "@/server/crypto/tokens";

const PERIOD = 30;
const DIGITS = 6;
const ISSUER = "YARI Academy";

const secretContext = (userId: string) => aad("User", "totpSecret", userId);

/**
 * Returns the pending enrolment for a user who hasn't finished setting up 2FA,
 * creating a new secret if there isn't one. Reusing the pending secret means a
 * page refresh doesn't invalidate a QR code the user has already scanned.
 */
export async function pendingTotpEnrolment(userId: string, accountLabel: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecretEnc: true, totpEnabledAt: true },
  });
  if (user.totpEnabledAt) throw new Error("Two-factor authentication is already enabled");
  let key: Uint8Array;
  if (user.totpSecretEnc) {
    key = decodeBase64(decryptField(user.totpSecretEnc, secretContext(userId)));
  } else {
    key = new Uint8Array(randomBytes(20));
    await db.user.update({
      where: { id: userId },
      data: { totpSecretEnc: encryptField(encodeBase64(key), secretContext(userId)), totpLastStep: null },
    });
  }
  const uri = createTOTPKeyURI(ISSUER, accountLabel, key, PERIOD, DIGITS);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return { uri, qrSvg, manualKey: base32(key) };
}

/**
 * Verifies a code, allowing one step of clock drift either side, and rejects
 * codes from a time step that has already been used (replay protection).
 */
export async function verifyTotpForUser(userId: string, code: string): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecretEnc: true, totpLastStep: true },
  });
  if (!user?.totpSecretEnc) return false;
  const key = decodeBase64(decryptField(user.totpSecretEnc, secretContext(userId)));
  const step = matchingStep(key, clean, Math.floor(Date.now() / 1000 / PERIOD));
  if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) return false;
  // Conditional update so two concurrent requests can't both consume the same step.
  const { count } = await db.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1;
}

export function matchingStep(key: Uint8Array, code: string, currentStep: number): number | null {
  for (const offset of [0, -1, 1]) {
    const step = currentStep + offset;
    if (safeEqual(generateHOTP(key, BigInt(step), DIGITS), code)) return step;
  }
  return null;
}

export async function completeTotpEnrolment(userId: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => generateReadableCode(2, 5));
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  return codes;
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => generateReadableCode(2, 5));
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  return codes;
}

export async function redeemRecoveryCode(userId: string, code: string): Promise<boolean> {
  const { count } = await db.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

export async function disableTotp(userId: string) {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    }),
    db.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}

function hashRecoveryCode(code: string): string {
  return sha256(`recovery:${code.replace(/[\s-]/g, "").toUpperCase()}`);
}

function base32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join(" ");
}
