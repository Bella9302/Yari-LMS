import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { normaliseCode } from "@/lib/certificates";
import { Notice } from "@/ui/primitives";
import { VerifyForm } from "@/ui/verify-form";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Check that a YARI Academy Certificate of Completion is genuine.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const normal = code ? normaliseCode(code) : null;
  if (normal) redirect(`/verify/${normal}`);
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="eyebrow">Certificates</p>
      <h1 className="font-display text-h1 mt-4">Verify a certificate</h1>
      <p className="text-muted mt-4 max-w-xl text-lg">
        Every YARI Academy certificate has a code like <span className="text-fg font-mono">YG-7K3M-Q9TP</span>{" "}
        next to its QR code. Enter it here to check it is genuine.
      </p>
      <div className="mt-8 space-y-4">
        {code && !normal && (
          <Notice tone="danger">
            That doesn&apos;t look like a certificate code. Codes start with YG and have eight letters and
            numbers.
          </Notice>
        )}
        <VerifyForm defaultValue={code} />
      </div>
    </section>
  );
}
