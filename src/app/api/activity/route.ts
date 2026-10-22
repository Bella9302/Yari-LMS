import { z } from "zod";
import { env } from "@/server/env";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { recordActiveTime } from "@/server/tracking/activity";

const body = z.object({ itemId: z.string().min(1).max(64), seconds: z.number().int().min(1).max(600) });

/**
 * Time-on-task heartbeat (also sent with navigator.sendBeacon when the page is hidden).
 * Same-origin only: beacons can't carry a CSRF token, so the Origin header is checked.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(env().APP_URL).host)
    return new Response(null, { status: 403 });
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return new Response(null, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  await recordActiveTime(session!.user.id, parsed.data.itemId, parsed.data.seconds);
  return new Response(null, { status: 204 });
}
