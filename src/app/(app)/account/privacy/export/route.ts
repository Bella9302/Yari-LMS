import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { exportForSelf } from "@/server/pii/data-rights";

/** The person's own data as JSON, once an admin has approved their request (POPIA s23). */
export async function GET() {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response("Sign in", { status: 401 });
  const data = await exportForSelf(session!.user.id);
  if (!data) return new Response("No approved request", { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="yari-academy-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
