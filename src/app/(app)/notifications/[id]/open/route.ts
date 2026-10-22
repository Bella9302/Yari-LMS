import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/auth/session";
import { authStage } from "@/server/rbac";
import { safeNextPath } from "@/lib/form-state";

/** Marks a notification read and goes to what it's about. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (authStage(session) !== "ok") return NextResponse.redirect(new URL("/login", request.url));
  const { id } = await params;
  const n = await db.notification.findFirst({ where: { id, userId: session!.user.id } });
  if (!n) return NextResponse.redirect(new URL("/notifications", request.url));
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return NextResponse.redirect(new URL(safeNextPath(n.href, "/notifications"), request.url));
}
