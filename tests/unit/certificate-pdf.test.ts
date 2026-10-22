import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "@/server/pdf/certificate-pdf";
import { certificateWording } from "@/lib/certificates";
import type { CertificateDocument } from "@/server/certificates/service";

const base: CertificateDocument = {
  code: "YG-7K3M-Q9TP",
  learnerName: "Thandiwe Mokoena",
  trainers: ["Nomsa Dlamini"],
  courseTitle: "SHE Representative Practical Training",
  category: "HEALTH_SAFETY",
  durationMinutes: 960,
  completedAt: new Date("2026-10-20T10:00:00Z"),
  issuedAt: new Date("2026-10-20T10:00:00Z"),
  academyName: "YARI Academy",
  wording: certificateWording(null),
  verifyUrl: "https://academy.yarigroup.co.za/verify/YG-7K3M-Q9TP",
};

// Set CERT_SAMPLE_DIR to write the PDFs out for a visual check.
const out = process.env.CERT_SAMPLE_DIR;

describe("certificate PDF", () => {
  it("renders an unaccredited certificate", async () => {
    const pdf = await renderCertificatePdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (out) writeFileSync(`${out}/cert-hs.pdf`, pdf);
  }, 20_000);

  it("renders long names, several trainers and accreditation details", async () => {
    const pdf = await renderCertificatePdf({
      ...base,
      learnerName: "Nomvula Zanele Khumalo-Van der Westhuizen",
      trainers: ["Sipho Ndlovu", "Zoë van der Merwe"],
      courseTitle: "AI Tools for the Workplace: Prompting, Privacy and Practical Automation",
      category: "AI_DIGITAL",
      wording: certificateWording({
        body: "QCTO",
        providerNumber: "07-QCTO/SDP040523",
        unitStandards: [{ id: "259617", title: "Apply AI tools safely" }],
        nqfLevel: 4,
        credits: 12,
      }),
    });
    expect(pdf.length).toBeGreaterThan(5000);
    if (out) writeFileSync(`${out}/cert-ai.pdf`, pdf);
  }, 20_000);
});
