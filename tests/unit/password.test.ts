import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblems, verifyPassword } from "@/server/crypto/password";

describe("passwords", () => {
  it("hashes with Argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).toContain("m=19456,t=2,p=1");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("returns false (not throw) for a corrupt hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("enforces the length policy and blocks personal info", () => {
    expect(passwordProblems("short")).toHaveLength(1);
    expect(passwordProblems("a long enough passphrase")).toHaveLength(0);
    expect(passwordProblems("thandiwe-is-my-password", ["Thandiwe"])).not.toHaveLength(0);
  });
});
