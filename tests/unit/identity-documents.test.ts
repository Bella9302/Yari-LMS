import { describe, expect, it } from "vitest";
import { isValidPassportNumber, isValidSaId, maskIdNumber } from "@/lib/identity-documents";

describe("SA ID numbers", () => {
  it("accepts valid IDs", () => {
    expect(isValidSaId("8001015009087")).toBe(true);
    expect(isValidSaId("9202204720083")).toBe(true);
  });

  it("rejects bad checksums, dates and lengths", () => {
    expect(isValidSaId("8001015009088")).toBe(false); // checksum
    expect(isValidSaId("8013015009087")).toBe(false); // month 13
    expect(isValidSaId("800101500908")).toBe(false); // 12 digits
    expect(isValidSaId("80010150090X7")).toBe(false);
  });

  it("validates passports loosely", () => {
    expect(isValidPassportNumber("FN 123456")).toBe(true);
    expect(isValidPassportNumber("12")).toBe(false);
  });

  it("masks all but the last four", () => {
    expect(maskIdNumber("8001015009087")).toBe("*********9087");
    expect(maskIdNumber("123")).toBe("***");
  });
});
