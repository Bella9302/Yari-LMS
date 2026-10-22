// Regressions for the Phase 7 security review (access control).
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addCourseStaff,
  addItem,
  createCourse,
  enrolLearners,
  setCourseStatus,
  updateItem,
  withdrawEnrolment,
} from "@/server/courses/builder";
import {
  inviteUser,
  pendingCompanyInvitations,
  respondToCompanyInvitation,
  listUsers,
} from "@/server/pii/users";
import { saveMark, submitAssignment } from "@/server/assessment/assignments";
import { setGradeOverride } from "@/server/assessment/grades";
import { AssessmentError } from "@/server/assessment/errors";
import { getCompanyOverview } from "@/server/tracking/company";
import { PermissionError } from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, trainer: U, managerA: U, managerB: U, orgA: { id: string }, orgB: { id: string };

beforeAll(async () => {
  orgA = await createOrg("Alpha Mining");
  orgB = await createOrg("Beta Build");
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }] });
  managerA = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgA.id }] });
  managerB = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgB.id }] });
});

async function publicCourse(title: string) {
  const course = await createCourse(trainer, { title, category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const item = await addItem(trainer, mod.id, "ASSIGNMENT", "Report");
  await updateItem(trainer, item.id, { title: "Report", required: true, published: true, estMinutes: null });
  await db.course.update({ where: { id: course.id }, data: { visibility: "PUBLIC" } });
  await setCourseStatus(trainer, course.id, "PUBLISHED");
  return { course, item };
}

describe("company invitations", () => {
  it("never attach an existing account to a company without the person's consent", async () => {
    const person = await createUser({
      roles: [{ role: "LEARNER" }],
      memberOf: [orgB.id],
      fullName: "Real Name",
    });
    const theirEmail = `existing-${person.id}@example.co.za`;
    await db.user.update({
      where: { id: person.id },
      data: {
        emailEnc: (await import("@/server/pii/fields")).enc.email(person.id, theirEmail),
        emailIdx: (await import("@/server/crypto/blind-index")).emailIndex(theirEmail),
      },
    });

    const result = await inviteUser(managerA, {
      email: theirEmail,
      fullName: "Typed By A",
      role: "LEARNER",
      organizationId: orgA.id,
    });
    expect(result.kind).toBe("pending-acceptance");
    expect(await db.orgMembership.count({ where: { userId: person.id, organizationId: orgA.id } })).toBe(0);
    // Company A sees nothing about them yet.
    const staff = await listUsers(managerA, { organizationId: orgA.id });
    expect(staff.map((u) => u.id)).not.toContain(person.id);
    // Nor can it enrol them.
    const { course } = await publicCourse("Consent course");
    await expect(
      enrolLearners(managerA, course.id, [person.id], { organizationId: orgA.id }),
    ).rejects.toThrow(PermissionError);

    const [inv] = await pendingCompanyInvitations(person.id);
    expect(inv!.organization.name).toBe("Alpha Mining");
    await expect(respondToCompanyInvitation(managerA, inv!.id, true)).rejects.toThrow(PermissionError);
    await respondToCompanyInvitation(person, inv!.id, true);
    expect(await db.orgMembership.count({ where: { userId: person.id, organizationId: orgA.id } })).toBe(1);
  });
});

describe("enrolment history", () => {
  it("can't be picked up by a different company after withdrawal", async () => {
    const learner = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgA.id, orgB.id] });
    const { course } = await publicCourse("History course");
    await enrolLearners(managerB, course.id, [learner.id], { organizationId: orgB.id });
    const e = await db.enrolment.findFirstOrThrow({ where: { userId: learner.id, courseId: course.id } });
    await withdrawEnrolment(admin, e.id);
    const res = await enrolLearners(managerA, course.id, [learner.id], { organizationId: orgA.id });
    expect(res).toEqual({ enrolled: 0, skipped: 1 });
    expect((await db.enrolment.findUniqueOrThrow({ where: { id: e.id } })).organizationId).toBe(orgB.id);
  });

  it("is closed to an archived company's managers", async () => {
    const orgC = await createOrg("Archived Co");
    const managerC = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgC.id }] });
    await db.organization.update({ where: { id: orgC.id }, data: { status: "ARCHIVED" } });
    await expect(getCompanyOverview(managerC, orgC.id)).rejects.toThrow(PermissionError);
    await expect(
      inviteUser(managerC, {
        email: "x@example.co.za",
        fullName: "X",
        role: "LEARNER",
        organizationId: orgC.id,
      }),
    ).rejects.toThrow(PermissionError);
  });
});

describe("marking", () => {
  it("doesn't let a trainer mark or override their own work", async () => {
    const both = await createUser({ roles: [{ role: "TRAINER" }, { role: "LEARNER" }] });
    const { course, item } = await publicCourse("Self-marking course");
    await addCourseStaff(trainer, course.id, both.id);
    await enrolLearners(admin, course.id, [both.id]);
    await submitAssignment(both, item.id, { text: "My own report", assetIds: [] });
    const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: item.id } });
    const mark = {
      score: 100,
      rubricSelections: {},
      feedbackText: "",
      feedbackAssetId: null,
      audioAssetId: null,
    };
    await expect(saveMark(both, sub.id, { ...mark, action: "release" })).rejects.toThrow(AssessmentError);
    const enrolment = await db.enrolment.findFirstOrThrow({
      where: { userId: both.id, courseId: course.id },
    });
    await expect(
      setGradeOverride(both, enrolment.id, item.id, { scorePct: 100, reason: "me" }),
    ).rejects.toThrow(AssessmentError);

    // Another trainer can, and once released a "draft" can't silently replace it.
    await saveMark(trainer, sub.id, { ...mark, score: 60, action: "release" });
    await expect(saveMark(trainer, sub.id, { ...mark, score: 10, action: "draft" })).rejects.toThrow(
      /already released/,
    );
    expect((await db.mark.findUniqueOrThrow({ where: { submissionId: sub.id } })).score).toBe(60);
  });
});
