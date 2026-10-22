import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { canEditCourse } from "@/server/courses/access";
import { currentQr } from "@/server/tracking/sessions";
import { formatTime } from "@/lib/format";
import { QrPresenter } from "./qr-presenter";

export const metadata: Metadata = { title: "Check-in code" };

export default async function PresentPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const { id, sessionId } = await params;
  const session = await db.liveSession.findFirst({
    where: { id: sessionId, courseId: id },
    include: { course: { select: { title: true } } },
  });
  if (!session || !(await canEditCourse(actor, id))) notFound();
  const first = await currentQr(actor, sessionId);
  return (
    <QrPresenter
      sessionId={sessionId}
      backHref={`/teach/courses/${id}/sessions/${sessionId}`}
      title={session.title}
      subtitle={`${session.course.title} · ${formatTime(session.startsAt)}–${formatTime(session.endsAt)}`}
      initial={first}
    />
  );
}
