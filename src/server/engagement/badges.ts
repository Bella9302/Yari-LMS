import "server-only";
import { db } from "@/server/db";
import { notify } from "@/server/engagement/notifications";
import { BADGES, type BadgeCode } from "@/lib/badges";

interface Earned {
  badge: BadgeCode;
  courseId: string | null;
}

/** Pure: which badges the facts earn. */
export function earnedBadges(facts: {
  completedItems: number;
  completedCourses: {
    courseId: string;
    category: "HEALTH_SAFETY" | "AI_DIGITAL";
    dueAt: Date | null;
    completedAt: Date | null;
    sessionsHeld: number;
    sessionsAttended: number;
  }[];
  perfectQuizCourseIds: string[];
}): Earned[] {
  const out: Earned[] = [];
  if (facts.completedItems > 0) out.push({ badge: "FIRST_STEP", courseId: null });
  for (const c of facts.completedCourses) {
    out.push({ badge: "COURSE_COMPLETE", courseId: c.courseId });
    if (c.dueAt && c.completedAt && c.completedAt <= c.dueAt)
      out.push({ badge: "ON_TIME", courseId: c.courseId });
    if (c.sessionsHeld > 0 && c.sessionsAttended >= c.sessionsHeld)
      out.push({ badge: "FULL_ATTENDANCE", courseId: c.courseId });
  }
  for (const courseId of new Set(facts.perfectQuizCourseIds)) out.push({ badge: "FULL_MARKS", courseId });
  if (facts.completedCourses.length >= 3) out.push({ badge: "THREE_COURSES", courseId: null });
  const cats = new Set(facts.completedCourses.map((c) => c.category));
  if (cats.has("HEALTH_SAFETY") && cats.has("AI_DIGITAL")) out.push({ badge: "ALL_ROUNDER", courseId: null });
  return out;
}

/** Checks a learner's achievements and awards anything new (with a notification). Idempotent. */
export async function awardBadges(userId: string, now = new Date()): Promise<BadgeCode[]> {
  const [completedItems, completed, perfect, attendance, existing] = await Promise.all([
    db.itemProgress.count({ where: { status: "COMPLETED", enrolment: { userId } } }),
    db.enrolment.findMany({
      where: { userId, status: "COMPLETED" },
      select: {
        courseId: true,
        dueAt: true,
        completedAt: true,
        course: {
          select: {
            category: true,
            sessions: { where: { cancelledAt: null, endsAt: { lte: now } }, select: { id: true } },
          },
        },
      },
    }),
    db.quizAttempt.findMany({
      where: { enrolment: { userId }, status: "MARKED", scorePct: { gte: 100 } },
      select: { quiz: { select: { item: { select: { module: { select: { courseId: true } } } } } } },
    }),
    db.attendance.findMany({ where: { userId, status: "PRESENT" }, select: { sessionId: true } }),
    db.userBadge.findMany({ where: { userId }, select: { badge: true, courseId: true } }),
  ]);
  const attended = new Set(attendance.map((a) => a.sessionId));
  const earned = earnedBadges({
    completedItems,
    completedCourses: completed.map((e) => ({
      courseId: e.courseId,
      category: e.course.category,
      dueAt: e.dueAt,
      completedAt: e.completedAt,
      sessionsHeld: e.course.sessions.length,
      sessionsAttended: e.course.sessions.filter((s) => attended.has(s.id)).length,
    })),
    perfectQuizCourseIds: perfect.map((p) => p.quiz.item.module.courseId),
  });
  const have = new Set(existing.map((e) => `${e.badge}:${e.courseId ?? ""}`));
  const fresh = earned.filter((e) => !have.has(`${e.badge}:${e.courseId ?? ""}`));
  if (fresh.length === 0) return [];
  // skipDuplicates guards against two requests awarding at the same moment.
  await db.userBadge.createMany({
    data: fresh.map((e) => ({ userId, badge: e.badge, courseId: e.courseId })),
    skipDuplicates: true,
  });
  for (const e of fresh) {
    await notify([userId], {
      type: "BADGE",
      title: `Badge earned: ${BADGES[e.badge].name}`,
      href: "/account/badges",
    });
  }
  return fresh.map((e) => e.badge);
}

export function badgesFor(userId: string) {
  return db.userBadge.findMany({
    where: { userId },
    orderBy: { awardedAt: "desc" },
    include: { course: { select: { title: true } } },
  });
}
