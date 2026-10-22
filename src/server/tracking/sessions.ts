import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { AttendanceStatus, SessionMode } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { safeEqual } from "@/server/crypto/tokens";
import { dec } from "@/server/pii/fields";
import type { Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { awardBadges } from "@/server/engagement/badges";

/** Each QR code is valid for its 30-second window plus the one before (scan-time leeway). */
export const QR_WINDOW_MS = 30_000;
/** Check-in opens this long before a session starts and closes this long after it ends. */
export const CHECKIN_MARGIN_MS = 30 * 60_000;

export class CheckInError extends Error {}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface SessionInput {
  title: string;
  description: string;
  mode: SessionMode;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  meetingUrl: string | null;
  trainerId: string | null;
}

function validate(input: SessionInput) {
  if (!input.title.trim()) throw new AssessmentError("Give the session a title.");
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime()))
    throw new AssessmentError("Choose a start and end time.");
  if (input.endsAt <= input.startsAt) throw new AssessmentError("The session must end after it starts.");
  if (input.endsAt.getTime() - input.startsAt.getTime() > 14 * 3600_000)
    throw new AssessmentError("Sessions can be at most 14 hours long.");
  if (input.mode !== "ONLINE" && !input.location?.trim())
    throw new AssessmentError("Add where the session takes place.");
  if (input.mode !== "IN_PERSON") {
    try {
      if (new URL(input.meetingUrl ?? "").protocol !== "https:") throw new Error();
    } catch {
      throw new AssessmentError("Add the meeting link (https://…) for online sessions.");
    }
  }
}

export async function createSession(actor: Actor, courseId: string, input: SessionInput) {
  await assertCanEditCourse(actor, courseId);
  validate(input);
  const session = await db.liveSession.create({
    data: {
      courseId,
      ...input,
      title: input.title.trim(),
      location: input.mode === "ONLINE" ? null : input.location?.trim() || null,
      meetingUrl: input.mode === "IN_PERSON" ? null : input.meetingUrl,
      trainerId: input.trainerId ?? actor.id,
      qrSecret: randomBytes(32).toString("base64url"),
    },
  });
  await audit({
    actorId: actor.id,
    action: "session.created",
    entityType: "LiveSession",
    entityId: session.id,
  });
  return session;
}

async function sessionForStaff(actor: Actor, sessionId: string) {
  const session = await db.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");
  await assertCanEditCourse(actor, session.courseId);
  return session;
}

export async function updateSession(actor: Actor, sessionId: string, input: SessionInput) {
  const existing = await sessionForStaff(actor, sessionId);
  validate(input);
  await db.liveSession.update({
    where: { id: sessionId },
    data: {
      ...input,
      trainerId: input.trainerId ?? existing.trainerId,
      title: input.title.trim(),
      location: input.mode === "ONLINE" ? null : input.location?.trim() || null,
      meetingUrl: input.mode === "IN_PERSON" ? null : input.meetingUrl,
    },
  });
  await audit({
    actorId: actor.id,
    action: "session.updated",
    entityType: "LiveSession",
    entityId: sessionId,
  });
}

export async function cancelSession(actor: Actor, sessionId: string) {
  await sessionForStaff(actor, sessionId);
  await db.liveSession.update({ where: { id: sessionId }, data: { cancelledAt: new Date() } });
  await audit({
    actorId: actor.id,
    action: "session.cancelled",
    entityType: "LiveSession",
    entityId: sessionId,
  });
}

// ---------------------------------------------------------------------------
// Rotating QR codes
// ---------------------------------------------------------------------------

export function qrToken(secret: string, sessionId: string, window: number): string {
  return createHmac("sha256", secret).update(`${sessionId}:${window}`).digest("base64url").slice(0, 22);
}

export function verifyQrToken(secret: string, sessionId: string, token: string, now = Date.now()): boolean {
  const w = Math.floor(now / QR_WINDOW_MS);
  return [w, w - 1].some((x) => safeEqual(qrToken(secret, sessionId, x), token));
}

export function isCheckInOpen(
  s: { startsAt: Date; endsAt: Date; cancelledAt: Date | null },
  now = Date.now(),
) {
  return (
    !s.cancelledAt &&
    now >= s.startsAt.getTime() - CHECKIN_MARGIN_MS &&
    now <= s.endsAt.getTime() + CHECKIN_MARGIN_MS
  );
}

/** The code the trainer projects or shows on their phone. Refreshed by the presenter page. */
export async function currentQr(actor: Actor, sessionId: string, now = Date.now()) {
  const session = await sessionForStaff(actor, sessionId);
  const window = Math.floor(now / QR_WINDOW_MS);
  const url = `${env().APP_URL}/check-in/${sessionId}?t=${qrToken(session.qrSecret, sessionId, window)}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const present = await db.attendance.count({ where: { sessionId, status: "PRESENT" } });
  return {
    svg,
    url,
    open: isCheckInOpen(session, now),
    refreshInMs: (window + 1) * QR_WINDOW_MS - now,
    present,
  };
}

// ---------------------------------------------------------------------------
// Checking in
// ---------------------------------------------------------------------------

async function sessionForLearner(userId: string, sessionId: string) {
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    include: { course: { select: { id: true, title: true, slug: true, status: true } } },
  });
  if (!session) throw new NotFoundError("Session not found");
  const enrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId, courseId: session.courseId } },
  });
  if (!enrolment || enrolment.status === "WITHDRAWN" || session.course.status !== "PUBLISHED") {
    throw new CheckInError("You're not on the list for this session. Ask the trainer to check you in.");
  }
  return session;
}

export async function getCheckInPreview(userId: string, sessionId: string) {
  const session = await sessionForLearner(userId, sessionId);
  const existing = await db.attendance.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  return { session, alreadyPresent: existing?.status === "PRESENT", open: isCheckInOpen(session) };
}

/** QR check-in at an in-person (or hybrid) session. */
export async function checkInWithQr(userId: string, sessionId: string, token: string, now = Date.now()) {
  const session = await sessionForLearner(userId, sessionId);
  if (!isCheckInOpen(session, now)) throw new CheckInError("Check-in for this session isn't open right now.");
  if (!verifyQrToken(session.qrSecret, sessionId, token, now)) {
    throw new CheckInError("That code has expired. Scan the code on the trainer's screen again.");
  }
  return markPresent(userId, sessionId, "QR", now);
}

/** Online join: records attendance and returns the meeting link. */
export async function joinOnline(userId: string, sessionId: string, now = Date.now()) {
  const session = await sessionForLearner(userId, sessionId);
  if (session.mode === "IN_PERSON" || !session.meetingUrl)
    throw new CheckInError("This session is in person.");
  if (!isCheckInOpen(session, now)) throw new CheckInError("This session isn't open yet.");
  await markPresent(userId, sessionId, "ONLINE_JOIN", now);
  return session.meetingUrl;
}

async function markPresent(userId: string, sessionId: string, method: "QR" | "ONLINE_JOIN", now: number) {
  const existing = await db.attendance.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (existing?.status === "PRESENT") return existing;
  const record = await db.attendance.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId, status: "PRESENT", method, checkedInAt: new Date(now) },
    update: { status: "PRESENT", method, checkedInAt: new Date(now), recordedById: null },
  });
  await db.enrolment.updateMany({
    where: { userId, course: { sessions: { some: { id: sessionId } } } },
    data: { lastActiveAt: new Date(now) },
  });
  await audit({
    actorId: userId,
    action: "attendance.recorded",
    entityType: "LiveSession",
    entityId: sessionId,
    meta: { method },
  });
  await awardBadges(userId);
  return record;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export interface RegisterRow {
  userId: string;
  name: string;
  organization: string | null;
  status: AttendanceStatus | null;
  method: string | null;
  checkedInAt: Date | null;
  note: string | null;
}

export async function getRegister(actor: Actor, sessionId: string) {
  const session = await sessionForStaff(actor, sessionId);
  const [enrolments, records] = await Promise.all([
    db.enrolment.findMany({
      where: { courseId: session.courseId, status: { not: "WITHDRAWN" } },
      select: {
        organization: { select: { name: true } },
        user: { select: { id: true, profile: { select: { fullNameEnc: true } } } },
      },
    }),
    db.attendance.findMany({ where: { sessionId } }),
  ]);
  const byUser = new Map(records.map((r) => [r.userId, r]));
  const rows: RegisterRow[] = enrolments
    .map((e) => {
      const r = byUser.get(e.user.id);
      return {
        userId: e.user.id,
        name: e.user.profile ? dec.fullName(e.user.id, e.user.profile.fullNameEnc) : "",
        organization: e.organization?.name ?? null,
        status: r?.status ?? null,
        method: r?.method ?? null,
        checkedInAt: r?.checkedInAt ?? null,
        note: r?.note ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  await audit({
    actorId: actor.id,
    action: "pii.viewed",
    entityType: "Register",
    entityId: sessionId,
    fields: ["fullName"],
    meta: { count: rows.length },
  });
  return { session, rows };
}

export async function setAttendance(
  actor: Actor,
  sessionId: string,
  userId: string,
  status: AttendanceStatus,
  note: string | null,
) {
  const session = await sessionForStaff(actor, sessionId);
  const enrolled = await db.enrolment.findUnique({
    where: { userId_courseId: { userId, courseId: session.courseId } },
  });
  if (!enrolled) throw new NotFoundError("Learner not on this course");
  await db.attendance.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: {
      sessionId,
      userId,
      status,
      method: "MANUAL",
      checkedInAt: status === "PRESENT" ? new Date() : null,
      recordedById: actor.id,
      note,
    },
    update: { status, recordedById: actor.id, note, ...(status === "PRESENT" ? {} : { checkedInAt: null }) },
  });
  await audit({
    actorId: actor.id,
    action: "attendance.recorded",
    entityType: "LiveSession",
    entityId: sessionId,
    meta: { userId, status, method: "MANUAL" },
  });
}

// ---------------------------------------------------------------------------
// Learner-facing lists
// ---------------------------------------------------------------------------

export async function upcomingSessionsFor(
  userId: string,
  opts: { courseId?: string; limit?: number } = {},
  now = new Date(),
) {
  const sessions = await db.liveSession.findMany({
    where: {
      cancelledAt: null,
      endsAt: { gte: new Date(now.getTime() - CHECKIN_MARGIN_MS) },
      ...(opts.courseId ? { courseId: opts.courseId } : {}),
      course: { status: "PUBLISHED", enrolments: { some: { userId, status: { not: "WITHDRAWN" } } } },
    },
    orderBy: { startsAt: "asc" },
    take: opts.limit ?? 20,
    include: {
      course: { select: { title: true, slug: true, category: true } },
      attendance: { where: { userId }, select: { status: true } },
    },
  });
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    mode: s.mode,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    location: s.location,
    hasMeeting: Boolean(s.meetingUrl),
    course: s.course,
    open: isCheckInOpen(s, now.getTime()),
    present: s.attendance[0]?.status === "PRESENT",
  }));
}
