import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { certificateForDownload } from "@/server/certificates/service";
import { renderCertificatePdf } from "@/server/pdf/certificate-pdf";
import { PermissionError } from "@/server/pii/users";
import { slugify } from "@/server/courses/builder";

/** The certificate PDF, rendered from its frozen snapshot on every download. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in", { status: 401 });
  const { code } = await params;
  let doc;
  try {
    doc = await certificateForDownload({ id: session!.user.id, roles: session!.user.roles }, code);
  } catch (err) {
    if (err instanceof PermissionError) return new Response("Not found", { status: 404 });
    throw err;
  }
  const pdf = await renderCertificatePdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificate-${slugify(doc.courseTitle)}-${doc.code}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
