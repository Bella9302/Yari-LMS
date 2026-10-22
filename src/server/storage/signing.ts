import "server-only";
import { blindIndex } from "@/server/crypto/blind-index";
import { safeEqual } from "@/server/crypto/tokens";

/** HMAC-signed, expiring parameters for local upload URLs. */
export function signUpload(assetId: string, expiresAt: number): string {
  return blindIndex("signed-url", `upload:${assetId}:${expiresAt}`);
}

export function verifyUploadSignature(
  assetId: string,
  expiresAt: number,
  signature: string,
  now = Date.now(),
) {
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  return safeEqual(signUpload(assetId, expiresAt), signature);
}
