import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

// Format: v1.<keyId>.<iv b64url>.<ciphertext+tag b64url>
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DecryptionError extends Error {
  constructor(message = "Unable to decrypt field") {
    super(message);
    this.name = "DecryptionError";
  }
}

/**
 * Binds a ciphertext to where it lives, e.g. aad("User", "email", userId).
 * Moving a ciphertext to another row or column makes it fail to decrypt.
 */
export function aad(model: string, field: string, rowId: string): string {
  return `${model}.${field}:${rowId}`;
}

function getKey(keyId: string): Buffer {
  const b64 = env().FIELD_ENC_KEYS[keyId];
  if (!b64) throw new DecryptionError(`Unknown encryption key "${keyId}"`);
  return Buffer.from(b64, "base64");
}

export function encryptField(plaintext: string, context: string): string {
  const keyId = env().FIELD_ENC_ACTIVE_KEY;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(keyId), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return [VERSION, keyId, iv.toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptField(payload: string, context: string): string {
  const [version, keyId, ivB64, bodyB64] = payload.split(".");
  if (version !== VERSION || !keyId || !ivB64 || !bodyB64) throw new DecryptionError("Malformed ciphertext");
  const iv = Buffer.from(ivB64, "base64url");
  const body = Buffer.from(bodyB64, "base64url");
  if (iv.length !== IV_BYTES || body.length < TAG_BYTES) throw new DecryptionError("Malformed ciphertext");
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(keyId), iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(body.subarray(0, body.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    if (err instanceof DecryptionError) throw err;
    throw new DecryptionError();
  }
}

export function encryptOptional(plaintext: string | null | undefined, context: string): string | null {
  return plaintext == null || plaintext === "" ? null : encryptField(plaintext, context);
}

export function decryptOptional(payload: string | null | undefined, context: string): string | null {
  return payload == null ? null : decryptField(payload, context);
}

/** True when the ciphertext was produced with a key other than the active one (needs re-encryption). */
export function needsRotation(payload: string): boolean {
  return payload.split(".")[1] !== env().FIELD_ENC_ACTIVE_KEY;
}
