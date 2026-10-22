import { audit } from "@/server/audit";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { getRegister } from "@/server/tracking/sessions";
import { csvCell } from "@/server/assessment/gradebook";
import { slugify } from "@/server/courses/builder";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in", { status: 401 });
  const actor = { id: session!.user.id, roles: session!.user.roles };
  const { sessionId } = await params;
  const register = await getRegister(actor, sessionId).catch(() => null);
  if (!register) return new Response("Not found", { status: 404 });
  await audit({
    actorId: actor.id,
    action: "report.exported",
    entityType: "Register",
    entityId: sessionId,
    fields: ["fullName"],
  });
  const lines = [
    ["Name", "Company", "Status", "Checked in (UTC)", "How", "Note"],
    ...register.rows.map((r) => [
      r.name,
      r.organization ?? "",
      r.status?.toLowerCase() ?? "not recorded",
      r.checkedInAt?.toISOString() ?? "",
      r.method ?? "",
      r.note ?? "",
    ]),
  ];
  const csv = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const name = `${slugify(register.session.title)}-${register.session.startsAt.toISOString().slice(0, 10)}-register.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
