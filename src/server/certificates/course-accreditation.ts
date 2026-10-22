import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isSuperAdmin } from "@/server/rbac";
import { PermissionError, type Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { courseAccreditationSchema, parseUnitStandards } from "@/lib/certificates";

/** Unit standards, NQF level and credits for a course. Super Admin only: it's a legal claim. */
export async function setCourseAccreditation(
  actor: Actor,
  courseId: string,
  input: { unitStandards: string; nqfLevel: string; credits: string },
) {
  if (!isSuperAdmin(actor.roles)) throw new PermissionError();
  let unitStandards;
  try {
    unitStandards = parseUnitStandards(input.unitStandards);
  } catch (err) {
    throw new AssessmentError((err as Error).message);
  }
  const num = (v: string) => (v.trim() ? Number(v) : null);
  const parsed = courseAccreditationSchema.safeParse({
    unitStandards,
    nqfLevel: num(input.nqfLevel),
    credits: num(input.credits),
  });
  if (!parsed.success) throw new AssessmentError("Check the unit standards, NQF level (1–10) and credits.");
  const empty = parsed.data.unitStandards.length === 0;
  await db.course.update({
    where: { id: courseId },
    data: { accreditation: empty ? Prisma.DbNull : parsed.data },
  });
  await audit({
    actorId: actor.id,
    action: "settings.updated",
    entityType: "CourseAccreditation",
    entityId: courseId,
    meta: parsed.data,
  });
}
