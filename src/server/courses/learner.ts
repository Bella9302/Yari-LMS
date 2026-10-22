import "server-only";
import type { CourseCategory, ItemType, ProgressStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { awardBadges } from "@/server/engagement/badges";
import { canEditCourse } from "@/server/courses/access";
import { evaluateRules, progressPercent, type LockState, type ProgressLike } from "@/server/courses/release";
import type { Actor } from "@/server/pii/users";

export interface OutlineItem {
  id: string;
  title: string;
  type: ItemType;
  required: boolean;
  estMinutes: number | null;
  status: ProgressStatus;
  lock: LockState;
}

export interface OutlineModule {
  id: string;
  title: string;
  description: string;
  lock: LockState;
  items: OutlineItem[];
}

export interface LearnerCourse {
  course: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    category: CourseCategory;
    estMinutes: number | null;
    archived: boolean;
  };
  enrolment: { id: string; status: string; progressPct: number; dueAt: Date | null } | null;
  /** Staff previewing the learner view: locks are shown but not enforced, and nothing is recorded. */
  preview: boolean;
  modules: OutlineModule[];
  /** First unlocked, incomplete item — the "continue" target. */
  nextItemId: string | null;
}

const OPEN: LockState = { unlocked: true, reasons: [], opensAt: null };

/** Loads modules, published items, rules and progress, and works out what's locked. */
async function buildOutline(courseId: string, enrolmentId: string | null, now = new Date()) {
  const [modules, progressRows] = await Promise.all([
    db.module.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      include: {
        releaseRules: true,
        items: {
          where: { published: true },
          orderBy: { position: "asc" },
          include: { releaseRules: true },
        },
      },
    }),
    enrolmentId
      ? db.itemProgress.findMany({
          where: { enrolmentId },
          select: { itemId: true, status: true, scorePct: true },
        })
      : Promise.resolve([]),
  ]);

  const progress = new Map<string, ProgressLike>(progressRows.map((p) => [p.itemId, p]));
  const titles = new Map<string, string>();
  for (const m of modules) for (const i of m.items) titles.set(i.id, i.title);

  const outline: OutlineModule[] = modules
    .filter((m) => m.items.length > 0)
    .map((m) => {
      const moduleLock = m.releaseRules.length ? evaluateRules(m.releaseRules, progress, titles, now) : OPEN;
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        lock: moduleLock,
        items: m.items.map((i) => {
          const itemLock = i.releaseRules.length
            ? evaluateRules(i.releaseRules, progress, titles, now)
            : OPEN;
          const lock: LockState = moduleLock.unlocked
            ? itemLock
            : {
                unlocked: false,
                reasons: [...moduleLock.reasons, ...itemLock.reasons],
                opensAt: moduleLock.opensAt,
              };
          return {
            id: i.id,
            title: i.title,
            type: i.type,
            required: i.required,
            estMinutes: i.estMinutes,
            status: progress.get(i.id)?.status ?? "NOT_STARTED",
            lock,
          };
        }),
      };
    });

  const required = outline.flatMap((m) => m.items.filter((i) => i.required).map((i) => i.id));
  return { outline, progress, progressPct: progressPercent(required, progress) };
}

export type LearnerCourseResult = LearnerCourse | null;

/**
 * The learner's view of a course. Returns null when the viewer has no access
 * (not enrolled / course not published) — callers respond 404.
 */
export async function getLearnerCourse(actor: Actor, slug: string): Promise<LearnerCourseResult> {
  const course = await db.course.findUnique({ where: { slug } });
  if (!course || course.isTemplate) return null;

  const enrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId: actor.id, courseId: course.id } },
  });
  const learnerAccess =
    enrolment &&
    enrolment.status !== "WITHDRAWN" &&
    (course.status === "PUBLISHED" || course.status === "ARCHIVED");
  const preview = !learnerAccess && (await canEditCourse(actor, course.id));
  if (!learnerAccess && !preview) return null;

  const { outline } = await buildOutline(course.id, learnerAccess ? enrolment!.id : null);
  const next =
    outline.flatMap((m) => m.items).find((i) => i.lock.unlocked && i.status !== "COMPLETED") ?? null;

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      category: course.category,
      estMinutes: course.estMinutes,
      archived: course.status === "ARCHIVED",
    },
    enrolment: learnerAccess
      ? {
          id: enrolment!.id,
          status: enrolment!.status,
          progressPct: enrolment!.progressPct,
          dueAt: enrolment!.dueAt,
        }
      : null,
    preview,
    modules: outline,
    nextItemId: next?.id ?? null,
  };
}

export interface LearnerItemView {
  course: LearnerCourse;
  item: {
    id: string;
    title: string;
    type: ItemType;
    body: unknown;
    externalUrl: string | null;
    required: boolean;
    asset: { id: string; filename: string; mime: string; bytes: number; ready: boolean } | null;
    status: ProgressStatus;
    lock: LockState;
  };
  moduleTitle: string;
  prevItemId: string | null;
  nextItemId: string | null;
}

export async function getLearnerItem(
  actor: Actor,
  slug: string,
  itemId: string,
): Promise<LearnerItemView | null> {
  const course = await getLearnerCourse(actor, slug);
  if (!course) return null;
  const flat = course.modules.flatMap((m) => m.items.map((i) => ({ ...i, moduleTitle: m.title })));
  const index = flat.findIndex((i) => i.id === itemId);
  if (index === -1) return null;
  const entry = flat[index]!;

  const item = await db.item.findUniqueOrThrow({
    where: { id: itemId },
    include: { asset: { select: { id: true, filename: true, mime: true, bytes: true, scanStatus: true } } },
  });
  const unlocked = entry.lock.unlocked || course.preview;

  return {
    course,
    moduleTitle: entry.moduleTitle,
    prevItemId: flat[index - 1]?.id ?? null,
    nextItemId: flat[index + 1]?.id ?? null,
    item: {
      id: item.id,
      title: item.title,
      type: item.type,
      required: item.required,
      status: entry.status,
      lock: entry.lock,
      // Locked content never leaves the server.
      body: unlocked ? item.body : null,
      externalUrl: unlocked ? item.externalUrl : null,
      asset:
        unlocked && item.asset
          ? {
              id: item.asset.id,
              filename: item.asset.filename,
              mime: item.asset.mime,
              bytes: item.asset.bytes,
              ready: item.asset.scanStatus === "CLEAN" || item.asset.scanStatus === "SKIPPED",
            }
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export class LockedError extends Error {}

/** Finds the learner's enrolment for an item and confirms the item is visible and unlocked. */
async function enrolmentForItem(userId: string, itemId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { published: true, module: { select: { course: { select: { id: true, status: true } } } } },
  });
  const course = item?.module.course;
  if (!item?.published || !course || course.status !== "PUBLISHED") return null;
  const enrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  if (!enrolment || enrolment.status === "WITHDRAWN") return null;

  const { outline } = await buildOutline(course.id, enrolment.id);
  const entry = outline.flatMap((m) => m.items).find((i) => i.id === itemId);
  if (!entry) return null;
  if (!entry.lock.unlocked) throw new LockedError(entry.lock.reasons.join(" · "));
  return enrolment;
}

export async function recordItemView(userId: string, itemId: string): Promise<void> {
  const enrolment = await enrolmentForItem(userId, itemId).catch((e) => {
    if (e instanceof LockedError) return null;
    throw e;
  });
  if (!enrolment) return;
  const now = new Date();
  await db.$transaction([
    db.itemProgress.upsert({
      where: { enrolmentId_itemId: { enrolmentId: enrolment.id, itemId } },
      create: {
        enrolmentId: enrolment.id,
        itemId,
        status: "IN_PROGRESS",
        firstViewedAt: now,
        lastViewedAt: now,
      },
      update: { lastViewedAt: now },
    }),
    db.enrolment.update({
      where: { id: enrolment.id },
      data: { lastActiveAt: now, startedAt: enrolment.startedAt ?? now },
    }),
  ]);
}

/** Marks an item complete (only if unlocked) and updates the course progress. */
export async function completeItem(
  userId: string,
  itemId: string,
): Promise<{ progressPct: number; courseCompleted: boolean }> {
  const enrolment = await enrolmentForItem(userId, itemId);
  if (!enrolment) throw new LockedError("This item isn't available.");
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId }, select: { type: true } });
  // Quizzes and assignments complete by reaching their pass mark, not by a button.
  if (item.type === "QUIZ" || item.type === "ASSIGNMENT")
    throw new LockedError("This item completes when you pass it.");
  const now = new Date();
  await db.itemProgress.upsert({
    where: { enrolmentId_itemId: { enrolmentId: enrolment.id, itemId } },
    create: {
      enrolmentId: enrolment.id,
      itemId,
      status: "COMPLETED",
      firstViewedAt: now,
      lastViewedAt: now,
      completedAt: now,
    },
    update: { status: "COMPLETED", completedAt: now, lastViewedAt: now },
  });
  return recomputeEnrolment(enrolment.id);
}

/**
 * Recalculates progress. A course is complete when every required, published item is done;
 * quizzes and assignments only count as done once their pass mark is reached (see
 * assessment/grades.ts). Completion is sticky: content added later doesn't take it away.
 */
export async function recomputeEnrolment(enrolmentId: string) {
  const enrolment = await db.enrolment.findUniqueOrThrow({ where: { id: enrolmentId } });
  const { progressPct } = await buildOutline(enrolment.courseId, enrolment.id);
  const now = new Date();
  const justCompleted = progressPct === 100 && enrolment.status === "ACTIVE";
  await db.enrolment.update({
    where: { id: enrolmentId },
    data: {
      progressPct: Math.max(progressPct, enrolment.status === "COMPLETED" ? enrolment.progressPct : 0),
      lastActiveAt: now,
      startedAt: enrolment.startedAt ?? now,
      ...(justCompleted ? { status: "COMPLETED", completedAt: now } : {}),
    },
  });
  // Any progress can complete a milestone (first item, course, on time…).
  await awardBadges(enrolment.userId);
  if (justCompleted) {
    await audit({
      actorId: enrolment.userId,
      action: "enrolment.completed",
      entityType: "Enrolment",
      entityId: enrolmentId,
    });
  }
  return { progressPct, courseCompleted: justCompleted || enrolment.status === "COMPLETED" };
}

export interface MyCourse {
  slug: string;
  title: string;
  category: CourseCategory;
  progressPct: number;
  status: string;
  dueAt: Date | null;
  lastActiveAt: Date | null;
}

export async function listMyCourses(userId: string): Promise<MyCourse[]> {
  const rows = await db.enrolment.findMany({
    where: { userId, status: { not: "WITHDRAWN" }, course: { status: { in: ["PUBLISHED", "ARCHIVED"] } } },
    include: { course: { select: { slug: true, title: true, category: true } } },
    orderBy: [{ status: "asc" }, { lastActiveAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    slug: r.course.slug,
    title: r.course.title,
    category: r.course.category,
    progressPct: r.progressPct,
    status: r.status,
    dueAt: r.dueAt,
    lastActiveAt: r.lastActiveAt,
  }));
}
