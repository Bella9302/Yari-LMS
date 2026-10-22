import "server-only";
import { db } from "@/server/db";
import { hasRole, isSuperAdmin } from "@/server/rbac";
import type { Actor } from "@/server/pii/users";

export class NotFoundError extends Error {}

export function canCreateCourses(actor: Actor) {
  return isSuperAdmin(actor.roles) || hasRole(actor.roles, "TRAINER");
}

/** Super Admins edit every course; trainers edit courses they're on the staff of. */
export async function canEditCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (isSuperAdmin(actor.roles)) return true;
  if (!hasRole(actor.roles, "TRAINER")) return false;
  const staff = await db.courseStaff.findUnique({
    where: { courseId_userId: { courseId, userId: actor.id } },
  });
  return Boolean(staff);
}

export async function assertCanEditCourse(actor: Actor, courseId: string) {
  // Respond "not found" so trainers can't probe other trainers' course ids.
  if (!(await canEditCourse(actor, courseId))) throw new NotFoundError("Course not found");
}

/** Prisma filter for courses this actor can edit. */
export function editableCoursesWhere(actor: Actor) {
  return isSuperAdmin(actor.roles) ? {} : { staff: { some: { userId: actor.id } } };
}
