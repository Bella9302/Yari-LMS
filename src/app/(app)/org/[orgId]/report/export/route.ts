import { audit } from "@/server/audit";
import { getCurrentSession } from "@/server/auth/session";
import { authStage, canAccessOrg } from "@/server/rbac";
import { complianceCsv, getComplianceRows } from "@/server/tracking/company";
import { renderCompliancePdf } from "@/server/pdf/compliance-pdf";
import { slugify } from "@/server/courses/builder";

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in", { status: 401 });
  const actor = { id: session!.user.id, roles: session!.user.roles };
  const { orgId } = await params;
  if (!canAccessOrg(actor.roles, orgId)) return new Response("Not found", { status: 404 });

  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const { orgName, rows } = await getComplianceRows(actor, orgId);
  await audit({
    actorId: actor.id,
    action: "report.exported",
    entityType: "ComplianceReport",
    entityId: orgId,
    orgId,
    fields: ["fullName"],
    meta: { format, rows: rows.length },
  });
  const name = `${slugify(orgName)}-training-compliance-${new Date().toISOString().slice(0, 10)}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "pdf") {
    const pdf = await renderCompliancePdf(orgName, rows);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
      },
    });
  }
  return new Response(complianceCsv(rows), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
