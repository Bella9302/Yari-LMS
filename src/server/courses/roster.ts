import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { dec } from "@/server/pii/fields";
import { assertCanEditCourse } from "@/server/courses/access";
import type { Actor } from "@/server/pii/users";

export interface RosterRow {
  enrolmentId: string;
  userId: string;
  fullName: string;
  email: string;
  organization: string | null;
  status: string;
  progressPct: number;
  dueAt: Date | null;
  lastActiveAt: Date | null;
}

/** Learners on a course, for its staff. Audit-logged as a personal-data view. */
export async function getCourseRoster(actor: Actor, courseId: string): Promise<RosterRow[]> {
  await assertCanEditCourse(actor, courseId);
  const rows = await db.enrolment.findMany({
    where: { courseId, status: { not: "WITHDRAWN" } },
    orderBy: { createdAt: "asc" },
    include: {
      organization: { select: { name: true } },
      user: { select: { id: true, emailEnc: true, profile: { select: { fullNameEnc: true } } } },
    },
  });
  if (rows.length) {
    await audit({
      actorId: actor.id,
      action: "pii.viewed",
      entityType: "CourseRoster",
      entityId: courseId,
      fields: ["email", "fullName"],
      meta: { count: rows.length },
    });
  }
  return rows.map((r) => ({
    enrolmentId: r.id,
    userId: r.user.id,
    fullName: r.user.profile ? dec.fullName(r.user.id, r.user.profile.fullNameEnc) : "",
    email: dec.email(r.user.id, r.user.emailEnc),
    organization: r.organization?.name ?? null,
    status: r.status,
    progressPct: r.progressPct,
    dueAt: r.dueAt,
    lastActiveAt: r.lastActiveAt,
  }));
}

/** Trainers available to add to a course team (names only). */
export async function listTrainers() {
  const rows = await db.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: "TRAINER" } } },
    select: { id: true, profile: { select: { fullNameEnc: true } } },
  });
  return rows
    .map((r) => ({ id: r.id, fullName: r.profile ? dec.fullName(r.id, r.profile.fullNameEnc) : "" }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
