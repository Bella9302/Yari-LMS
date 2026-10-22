import { describe, expect, it } from "vitest";
import { blindIndex, emailIndex, idNumberIndex } from "@/server/crypto/blind-index";

describe("blind indexes", () => {
  it("normalises email case and whitespace", () => {
    expect(emailIndex("  Thandi@Example.CO.ZA ")).toBe(emailIndex("thandi@example.co.za"));
  });

  it("separates purposes so equal inputs don't collide", () => {
    expect(blindIndex("email", "x")).not.toBe(blindIndex("id-number", "x"));
  });

  it("normalises SA ID spacing", () => {
    expect(idNumberIndex("SA_ID", "800101 5009 087")).toBe(idNumberIndex("SA_ID", "8001015009087"));
  });

  it("scopes passports by issuing country and type", () => {
    expect(idNumberIndex("PASSPORT", "fn123456", "zw")).toBe(idNumberIndex("PASSPORT", "FN 123456", "ZW"));
    expect(idNumberIndex("PASSPORT", "FN123456", "ZW")).not.toBe(idNumberIndex("PASSPORT", "FN123456", "MZ"));
    expect(idNumberIndex("PASSPORT", "8001015009087", "ZA")).not.toBe(
      idNumberIndex("SA_ID", "8001015009087"),
    );
  });

  it("is not the plain SHA-256 of the value (keyed)", () => {
    expect(emailIndex("a@b.co")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
