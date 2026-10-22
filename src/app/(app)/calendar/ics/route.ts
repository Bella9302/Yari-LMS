import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { env } from "@/server/env";
import { buildIcs, calendarEvents } from "@/server/engagement/calendar";

const DAY = 86_400_000;

/** One-off .ics download of the next 120 days (plus the last week), for phone and desktop calendars. */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return NextResponse.redirect(new URL("/login", request.url));
  const now = new Date();
  const events = await calendarEvents(
    { id: session!.user.id, roles: session!.user.roles },
    new Date(now.getTime() - 7 * DAY),
    new Date(now.getTime() + 120 * DAY),
  );
  return new NextResponse(buildIcs(events, env().APP_URL, now), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="yari-academy.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
