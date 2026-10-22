import "server-only";
import type { NotificationType } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";

export interface NewNotification {
  type: NotificationType;
  title: string;
  href: string;
}

/** In-app notifications (the bell). Duplicate user ids are ignored. */
export async function notify(userIds: string[], n: NewNotification, tx: Tx = db) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return 0;
  const { count } = await tx.notification.createMany({
    data: unique.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), href: n.href })),
  });
  return count;
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export function listNotifications(userId: string, take = 50) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export async function markRead(userId: string, id?: string) {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
}

/** Tells a learner their work on an item has been marked. */
export async function notifyMarked(enrolmentId: string, itemId: string) {
  const [enrolment, item] = await Promise.all([
    db.enrolment.findUnique({
      where: { id: enrolmentId },
      select: { userId: true, course: { select: { slug: true } } },
    }),
    db.item.findUnique({ where: { id: itemId }, select: { title: true } }),
  ]);
  if (!enrolment || !item) return;
  await notify([enrolment.userId], {
    type: "MARK_RELEASED",
    title: `Your work on “${item.title}” has been marked`,
    href: `/learn/${enrolment.course.slug}/${itemId}`,
  });
}
