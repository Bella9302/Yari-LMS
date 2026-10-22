import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { dec } from "@/server/pii/fields";
import type { Actor } from "@/server/pii/users";

export interface ProgressRow {
  enrolmentId: string;
  userId: string;
  name: string;
  organization: string | null;
  status: string;
  progressPct: number;
  viewed: number;
  total: number;
  timeSpentSec: number;
  lastActiveAt: Date | null;
  dueAt: Date | null;
  overdue: boolean;
  flags: { type: string; reason: string }[];
}

/** Activity for everyone on a course: % complete, items viewed, time on task, last active. */
export async function getCourseProgress(actor: Actor, courseId: string, now = new Date()) {
  await assertCanEditCourse(actor, courseId);
  const [total, enrolments] = await Promise.all([
    db.item.count({ where: { module: { courseId }, published: true } }),
    db.enrolment.findMany({
      where: { courseId, status: { not: "WITHDRAWN" } },
      include: {
        organization: { select: { name: true } },
        user: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
        progress: {
          where: { item: { published: true } },
          select: { timeSpentSec: true, firstViewedAt: true },
        },
        atRiskFlags: {
          where: { resolvedAt: null },
          select: { reason: true, rule: { select: { type: true } } },
        },
      },
    }),
  ]);
  const rows: ProgressRow[] = enrolments.map((e) => ({
    enrolmentId: e.id,
    userId: e.user.id,
    name: e.user.profile ? dec.fullName(e.user.id, e.user.profile.fullNameEnc) : "",
    organization: e.organization?.name ?? null,
    status: e.status,
    progressPct: e.progressPct,
    viewed: e.progress.filter((p) => p.firstViewedAt).length,
    total,
    timeSpentSec: e.progress.reduce((s, p) => s + p.timeSpentSec, 0),
    lastActiveAt: e.lastActiveAt,
    dueAt: e.dueAt,
    overdue: Boolean(e.dueAt && e.dueAt < now && e.status !== "COMPLETED"),
    flags: e.atRiskFlags.map((f) => ({ type: f.rule.type, reason: f.reason })),
  }));
  // People needing attention first, then by name.
  rows.sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name));
  if (rows.length) {
    await audit({
      actorId: actor.id,
      action: "pii.viewed",
      entityType: "CourseProgress",
      entityId: courseId,
      fields: ["fullName"],
      meta: { count: rows.length },
    });
  }
  return rows;
}

/** One learner's activity, item by item, plus attendance and open flags. */
export async function getLearnerActivity(actor: Actor, enrolmentId: string) {
  const enrolment = await db.enrolment.findUnique({ where: { id: enrolmentId } });
  if (!enrolment) throw new NotFoundError("Enrolment not found");
  await assertCanEditCourse(actor, enrolment.courseId);
  const [modules, progress, attendance, flags] = await Promise.all([
    db.module.findMany({
      where: { courseId: enrolment.courseId },
      orderBy: { position: "asc" },
      select: {
        title: true,
        items: {
          where: { published: true },
          orderBy: { position: "asc" },
          select: { id: true, title: true, type: true, required: true },
        },
      },
    }),
    db.itemProgress.findMany({ where: { enrolmentId } }),
    db.liveSession.findMany({
      where: { courseId: enrolment.courseId, cancelledAt: null, startsAt: { lte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        attendance: {
          where: { userId: enrolment.userId },
          select: { status: true, method: true, checkedInAt: true },
        },
      },
    }),
    db.atRiskFlag.findMany({
      where: { enrolmentId },
      orderBy: { raisedAt: "desc" },
      take: 20,
      include: { rule: { select: { type: true } } },
    }),
  ]);
  const byItem = new Map(progress.map((p) => [p.itemId, p]));
  return {
    enrolment,
    modules: modules.map((m) => ({
      title: m.title,
      items: m.items.map((i) => {
        const p = byItem.get(i.id);
        return {
          ...i,
          status: p?.status ?? "NOT_STARTED",
          timeSpentSec: p?.timeSpentSec ?? 0,
          firstViewedAt: p?.firstViewedAt ?? null,
          lastViewedAt: p?.lastViewedAt ?? null,
        };
      }),
    })),
    attendance: attendance.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      record: s.attendance[0] ?? null,
    })),
    flags,
  };
}
