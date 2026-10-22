import { describe, expect, it } from "vitest";
import {
  accreditationFor,
  certificateWording,
  CODE_ALPHABET,
  formatDuration,
  makeCode,
  normaliseCode,
  parseUnitStandards,
} from "@/lib/certificates";
import { BRAND } from "@/lib/brand";

describe("verification codes", () => {
  it("are YG-XXXX-XXXX from an unambiguous alphabet", () => {
    let i = 0;
    const code = makeCode((n) => i++ % n);
    expect(code).toMatch(/^YG-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(CODE_ALPHABET).not.toMatch(/[01ILOU]/);
  });

  it("accept what people type", () => {
    expect(normaliseCode("yg-7k3m-q9tp")).toBe("YG-7K3M-Q9TP");
    expect(normaliseCode(" YG 7K3M Q9TP ")).toBe("YG-7K3M-Q9TP");
    expect(normaliseCode("7K3MQ9TP")).toBe("YG-7K3M-Q9TP");
    expect(normaliseCode("YG-7K3M-Q9T0")).toBeNull(); // 0 is never used
    expect(normaliseCode("YG-7K3M")).toBeNull();
    expect(normaliseCode("../../etc")).toBeNull();
  });
});

describe("certificate wording", () => {
  const course = {
    unitStandards: [{ id: "259617", title: "Apply AI tools safely" }],
    nqfLevel: 4,
    credits: 12,
  };

  it("always carries the non-accreditation statement while YARI GROUP is unaccredited", () => {
    for (const snapshot of [null, undefined, {}, { body: "", providerNumber: "" }, { ...course }, "junk"]) {
      const w = certificateWording(snapshot);
      expect(w.accredited).toBe(false);
      expect(w.statement).toBe(BRAND.nonAccreditationStatement);
      expect(w.statement).toContain("not an accredited qualification");
    }
  });

  it("only treats a course as accredited when the platform switch, provider details and unit standards are all there", () => {
    const on = { enabled: true, body: "QCTO", providerNumber: "07-QCTO/SDP040523" };
    expect(accreditationFor({ ...on, enabled: false }, course)).toBeNull();
    expect(accreditationFor({ ...on, providerNumber: "" }, course)).toBeNull();
    expect(accreditationFor(on, { unitStandards: [] })).toBeNull();
    expect(accreditationFor(on, null)).toBeNull();
    const a = accreditationFor(on, course)!;
    const w = certificateWording(a);
    expect(w.accredited).toBe(true);
    expect(w.statement).toContain("07-QCTO/SDP040523");
    expect(w.details).toEqual(["Unit standard 259617: Apply AI tools safely", "NQF level 4", "12 credits"]);
  });
});

describe("helpers", () => {
  it("parses unit standards one per line", () => {
    expect(
      parseUnitStandards(
        "259617 — Apply AI tools safely\n\n 120345: Conduct a risk assessment \n9876 Fire safety",
      ),
    ).toEqual([
      { id: "259617", title: "Apply AI tools safely" },
      { id: "120345", title: "Conduct a risk assessment" },
      { id: "9876", title: "Fire safety" },
    ]);
    expect(() => parseUnitStandards("justoneword")).toThrow(/Couldn't read/);
  });

  it("formats course length", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(100)).toBe("1.5 hours");
    expect(formatDuration(960)).toBe("16 hours");
  });
});
