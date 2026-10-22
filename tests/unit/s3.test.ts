import { describe, expect, it } from "vitest";
import { S3Storage, contentDisposition } from "@/server/storage/s3";

// Presigning is local (no network), so the AWS wiring can be checked without an account.
describe("S3 storage (AWS)", () => {
  const s3 = new S3Storage("yari-academy-files", {
    region: "af-south-1",
    accessKeyId: "AKIATEST",
    secretAccessKey: "secret",
  });

  it("presigns uploads against the Cape Town regional endpoint", async () => {
    const t = await s3.createUploadTarget("uploads/2026-10/abc", {
      contentType: "application/pdf",
      bytes: 1234,
    });
    const url = new URL(t.url);
    expect(url.host).toBe("yari-academy-files.s3.af-south-1.amazonaws.com");
    expect(url.pathname).toBe("/uploads/2026-10/abc");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(t.method).toBe("PUT");
  });

  it("presigns short-lived downloads with the right filename", async () => {
    const url = new URL(
      (await s3.directDownloadUrl("uploads/x", {
        filename: "Safety file.pdf",
        contentType: "application/pdf",
        inline: true,
      }))!,
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toBe(
      contentDisposition("Safety file.pdf", true),
    );
  });
});
