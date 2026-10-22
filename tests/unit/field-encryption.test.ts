import { describe, expect, it, beforeEach } from "vitest";
import {
  aad,
  decryptField,
  DecryptionError,
  encryptField,
  needsRotation,
} from "@/server/crypto/field-encryption";
import { resetEnvCache } from "@/server/env";

describe("field encryption (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.FIELD_ENC_ACTIVE_KEY = "ktest1";
    resetEnvCache();
  });

  const ctx = aad("User", "email", "user-1");

  it("round-trips unicode text", () => {
    const value = "Nomvula Dlamini-Ndlovu · ñ · 😀";
    expect(decryptField(encryptField(value, ctx), ctx)).toBe(value);
  });

  it("never produces the same ciphertext twice (random IV)", () => {
    expect(encryptField("same", ctx)).not.toBe(encryptField("same", ctx));
  });

  it("does not contain the plaintext", () => {
    expect(encryptField("8001015009087", ctx)).not.toContain("8001015009087");
  });

  it("rejects a ciphertext moved to another row (AAD binding)", () => {
    const c = encryptField("secret", ctx);
    expect(() => decryptField(c, aad("User", "email", "user-2"))).toThrow(DecryptionError);
  });

  it("rejects a ciphertext moved to another column", () => {
    const c = encryptField("secret", ctx);
    expect(() => decryptField(c, aad("UserProfile", "phone", "user-1"))).toThrow(DecryptionError);
  });

  it("detects tampering", () => {
    const c = encryptField("secret", ctx);
    const parts = c.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0]! ^= 0xff;
    parts[3] = body.toString("base64url");
    expect(() => decryptField(parts.join("."), ctx)).toThrow(DecryptionError);
  });

  it("rejects malformed and unknown-key payloads", () => {
    expect(() => decryptField("garbage", ctx)).toThrow(DecryptionError);
    const c = encryptField("secret", ctx).replace("ktest1", "kmissing");
    expect(() => decryptField(c, ctx)).toThrow(DecryptionError);
  });

  it("decrypts with an old key after rotation and flags it for re-encryption", () => {
    const old = encryptField("secret", ctx);
    process.env.FIELD_ENC_ACTIVE_KEY = "ktest2";
    resetEnvCache();
    expect(decryptField(old, ctx)).toBe("secret");
    expect(needsRotation(old)).toBe(true);
    expect(needsRotation(encryptField("secret", ctx))).toBe(false);
  });
});
