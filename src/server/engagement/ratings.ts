import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isSuperAdmin } from "@/server/rbac";
import { dec } from "@/server/pii/fields";
import { PermissionError, type Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";

/** Trainers see nothing until this many ratings exist for what they're looking at (anonymity). */
export const MIN_RESPONSES = 3;
const SESSION_WINDOW_DAYS = 60;
const COURSE_WINDOW_DAYS = 90;
const DAY = 86_400_000;

export const CRITERIA = ["knowledge", "clarity", "relevance", "engagement"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERIA_LABELS: Record<Criterion, string> = {
  knowledge: "Knowledge",
  clarity: "Clarity",
  relevance: "Practical relevance",
  engagement: "Engagement",
};

const nameOf = (u: { id: string; profile: { fullNameEnc: string } | null }) =>
  u.profile ? dec.fullName(u.id, u.profile.fullNameEnc) : "Trainer";

export interface PendingRating {
  key: string;
  trainerId: string;
  trainerName: string;
  courseId: string;
  courseTitle: string;
  sessionId: string | null;
  sessionTitle: string | null;
}

/**
 * What a learner may rate now: trainers of sessions they attended (after the session ends)
 * and trainers of courses they completed. Offered for a limited time, and only once each.
 */
export async function pendingRatings(userId: string, now = new Date()): Promise<PendingRating[]> {
  const [attended, completed, given] = await Promise.all([
    db.attendance.findMany({
      where: {
        userId,
        status: "PRESENT",
        session: {
          endsAt: { lte: now, gte: new Date(now.getTime() - SESSION_WINDOW_DAYS * DAY) },
          trainerId: { not: null },
          cancelledAt: null,
        },
      },
      select: {
        session: {
          select: {
            id: true,
            title: true,
            trainerId: true,
            trainer: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
    db.enrolment.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: new Date(now.getTime() - COURSE_WINDOW_DAYS * DAY) },
      },
      select: {
        course: {
          select: {
            id: true,
            title: true,
            staff: {
              where: { user: { status: "ACTIVE", roles: { some: { role: "TRAINER" } } } },
              select: { user: { select: { id: true, profile: { select: { fullNameEnc: true } } } } },
            },
          },
        },
      },
    }),
    db.trainerRating.findMany({
      where: { raterId: userId },
      select: { trainerId: true, courseId: true, sessionId: true },
    }),
  ]);
  const done = new Set(given.map((g) => `${g.trainerId}:${g.courseId}:${g.sessionId ?? ""}`));
  const out: PendingRating[] = [];
  for (const { session: s } of attended) {
    if (!s.trainer || s.trainerId === userId) continue;
    const key = `${s.trainerId}:${s.course.id}:${s.id}`;
    if (!done.has(key))
      out.push({
        key,
        trainerId: s.trainer.id,
        trainerName: nameOf(s.trainer),
        courseId: s.course.id,
        courseTitle: s.course.title,
        sessionId: s.id,
        sessionTitle: s.title,
      });
  }
  for (const { course } of completed) {
    for (const { user } of course.staff) {
      if (user.id === userId) continue;
      const key = `${user.id}:${course.id}:`;
      if (!done.has(key))
        out.push({
          key,
          trainerId: user.id,
          trainerName: nameOf(user),
          courseId: course.id,
          courseTitle: course.title,
          sessionId: null,
          sessionTitle: null,
        });
    }
  }
  return out;
}

export interface RatingInput {
  trainerId: string;
  courseId: string;
  sessionId: string | null;
  scores: Record<Criterion, number>;
  comment: string;
}

export async function submitRating(actor: Actor, input: RatingInput) {
  for (const c of CRITERIA) {
    const v = input.scores[c];
    if (!Number.isInteger(v) || v < 1 || v > 5)
      throw new AssessmentError("Choose 1 to 5 stars for each question.");
  }
  const key = `${input.trainerId}:${input.courseId}:${input.sessionId ?? ""}`;
  const pending = await pendingRatings(actor.id);
  if (!pending.some((p) => p.key === key))
    throw new AssessmentError("This rating isn't open (or you've already given it).");
  const rating = await db.trainerRating.create({
    data: {
      trainerId: input.trainerId,
      raterId: actor.id,
      courseId: input.courseId,
      sessionId: input.sessionId,
      ...input.scores,
      comment: input.comment.trim().slice(0, 2000) || null,
    },
  });
  await audit({
    actorId: actor.id,
    action: "rating.submitted",
    entityType: "TrainerRating",
    entityId: rating.id,
  });
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

type Row = Record<Criterion, number> & { courseId: string; createdAt: Date; comment: string | null };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function averages(rows: Row[]) {
  const avg = (c: Criterion) => round1(rows.reduce((s, r) => s + r[c], 0) / rows.length);
  const byCriterion = Object.fromEntries(CRITERIA.map((c) => [c, avg(c)])) as Record<Criterion, number>;
  return {
    count: rows.length,
    overall: round1(CRITERIA.reduce((s, c) => s + byCriterion[c], 0) / CRITERIA.length),
    byCriterion,
  };
}

/**
 * The oldest ratings, in whole batches of `size`. Every figure a trainer sees is built from
 * batches, so it only ever changes by at least `size` ratings at a time: comparing the page
 * before and after one learner rates (or subtracting one course from the total) can't reveal
 * that learner's scores.
 */
export function inBatches<T extends { createdAt: Date }>(rows: T[], size = MIN_RESPONSES): T[] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sorted.slice(0, Math.floor(sorted.length / size) * size);
}

/** Monthly overall averages for the last 12 months; months with too few ratings are left empty. */
export function monthlyTrend(rows: Row[], now = new Date(), min = MIN_RESPONSES) {
  const months: { month: string; overall: number | null; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const inMonth = inBatches(
      rows.filter((r) => r.createdAt.toISOString().slice(0, 7) === key),
      min,
    );
    months.push({
      month: key,
      count: inMonth.length,
      overall: inMonth.length >= min ? averages(inMonth).overall : null,
    });
  }
  return months;
}

/**
 * What a trainer sees about themself: averages, a trend and comments, only once there are
 * enough ratings that no single learner can be picked out. Comments are shuffled and undated.
 */
export async function trainerSummary(trainerId: string, now = new Date()) {
  const all = await db.trainerRating.findMany({
    where: { trainerId },
    select: {
      knowledge: true,
      clarity: true,
      relevance: true,
      engagement: true,
      courseId: true,
      createdAt: true,
      comment: true,
      course: { select: { title: true } },
    },
  });
  const released = inBatches(all);
  if (released.length < MIN_RESPONSES)
    return { enough: false as const, count: all.length, needed: MIN_RESPONSES };
  const byCourse = new Map<string, { title: string; rows: Row[] }>();
  for (const r of released) {
    const entry = byCourse.get(r.courseId) ?? { title: r.course.title, rows: [] };
    entry.rows.push(r);
    byCourse.set(r.courseId, entry);
  }
  // A course is shown only if its own figure is in whole batches AND the rest of the total
  // is either nothing or at least a batch (so "total minus this course" reveals no one).
  const courses = [...byCourse.entries()].flatMap(([courseId, v]) => {
    const shown = inBatches(v.rows);
    const rest = released.length - shown.length;
    return shown.length >= MIN_RESPONSES && (rest === 0 || rest >= MIN_RESPONSES)
      ? [{ courseId, title: v.title, ...averages(shown) }]
      : [];
  });
  const comments = released.map((r) => r.comment).filter((c): c is string => Boolean(c));
  for (let i = comments.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [comments[i], comments[j]] = [comments[j]!, comments[i]!];
  }
  return {
    enough: true as const,
    ...averages(released),
    trend: monthlyTrend(released, now),
    courses,
    comments,
  };
}

/** Full detail for Super Admins: who rated whom, when, and what they said. Audit-logged. */
export async function adminRatings(actor: Actor, trainerId?: string) {
  if (!isSuperAdmin(actor.roles)) throw new PermissionError();
  const rows = await db.trainerRating.findMany({
    where: trainerId ? { trainerId } : {},
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      trainer: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
      rater: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
      course: { select: { title: true } },
      session: { select: { title: true } },
    },
  });
  await audit({
    actorId: actor.id,
    action: "ratings.viewed",
    entityType: "TrainerRating",
    entityId: trainerId ?? null,
    fields: ["fullName"],
    meta: { count: rows.length },
  });
  return rows.map((r) => ({
    id: r.id,
    trainerId: r.trainerId,
    trainer: nameOf(r.trainer),
    rater: r.rater ? nameOf(r.rater) : "Deleted account",
    course: r.course.title,
    session: r.session?.title ?? null,
    scores: { knowledge: r.knowledge, clarity: r.clarity, relevance: r.relevance, engagement: r.engagement },
    overall: round1((r.knowledge + r.clarity + r.relevance + r.engagement) / 4),
    comment: r.comment,
    createdAt: r.createdAt,
  }));
}
