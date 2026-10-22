import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { canEditCourse } from "@/server/courses/access";
import { getGradebook, gradebookCsv, type GradebookFilter } from "@/server/assessment/gradebook";
import { getOwnIdentity } from "@/server/pii/users";
import { renderGradebookPdf } from "@/server/pdf/gradebook-pdf";
import { slugify } from "@/server/courses/builder";

/** Downloads the (filtered) gradebook as CSV or PDF. Exports are audit-logged. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in", { status: 401 });
  const actor = { id: session!.user.id, roles: session!.user.roles };
  const { id } = await params;
  if (!(await canEditCourse(actor, id))) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const course = await db.course.findUniqueOrThrow({ where: { id }, select: { title: true } });
  const gb = await getGradebook(actor, id, {
    q: url.searchParams.get("q") ?? undefined,
    organizationId: url.searchParams.get("org") || undefined,
    filter: (url.searchParams.get("filter") as GradebookFilter) ?? "all",
  });
  await audit({
    actorId: actor.id,
    action: "gradebook.exported",
    entityType: "Course",
    entityId: id,
    fields: ["fullName", "email"],
    meta: { format, rows: gb.rows.length },
  });

  const name = `${slugify(course.title)}-gradebook-${new Date().toISOString().slice(0, 10)}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "pdf") {
    const me = await getOwnIdentity(actor.id);
    const pdf = await renderGradebookPdf(course.title, gb, me.fullName);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
      },
    });
  }
  return new Response(gradebookCsv(gb), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
