import "server-only";
import { db } from "@/server/db";

/** Most a single heartbeat can add (the browser sends one about every 30 s). */
export const MAX_BEAT_SECONDS = 120;

/**
 * Adds active time to a learner's progress on an item. The amount is capped per beat and by
 * the wall-clock time since the previous beat, so a tampered client can't inflate time spent.
 */
export async function recordActiveTime(userId: string, itemId: string, seconds: number, now = new Date()) {
  if (!Number.isFinite(seconds) || seconds <= 0) return { added: 0 };
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { published: true, module: { select: { course: { select: { id: true, status: true } } } } },
  });
  const course = item?.module.course;
  if (!item?.published || !course || course.status !== "PUBLISHED") return { added: 0 };
  const enrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  if (!enrolment || enrolment.status === "WITHDRAWN") return { added: 0 };

  const progress = await db.itemProgress.findUnique({
    where: { enrolmentId_itemId: { enrolmentId: enrolment.id, itemId } },
  });
  // No progress row means the item was never opened (view tracking creates it), so ignore.
  if (!progress) return { added: 0 };
  const sinceLast = progress.lastViewedAt
    ? (now.getTime() - progress.lastViewedAt.getTime()) / 1000
    : MAX_BEAT_SECONDS;
  const added = Math.floor(Math.max(0, Math.min(seconds, MAX_BEAT_SECONDS, sinceLast + 2)));
  if (added === 0) return { added: 0 };

  await db.$transaction([
    db.itemProgress.update({
      where: { id: progress.id },
      data: { timeSpentSec: { increment: added }, lastViewedAt: now },
    }),
    db.enrolment.update({ where: { id: enrolment.id }, data: { lastActiveAt: now } }),
  ]);
  return { added };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? "<1 min" : "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
