import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addItem, createCourse, enrolLearners, setCourseStatus, updateItem } from "@/server/courses/builder";
import { completeItem } from "@/server/courses/learner";
import { createSession } from "@/server/auth/session";
import { verifyCertificate } from "@/server/certificates/service";
import { buildDataExport, eraseAccount, exportAvailableUntil, exportForSelf } from "@/server/pii/data-rights";
import { dec } from "@/server/pii/fields";
import { PermissionError } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { createOrg, createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, trainer: U, learner: U;
const doc = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});

beforeAll(async () => {
  const org = await createOrg();
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }] });
  learner = await createUser({
    roles: [{ role: "LEARNER" }],
    memberOf: [org.id],
    fullName: "Sibusiso Mahlangu",
    idNumber: "8001015009087",
    password: "a long enough passphrase",
  });

  const course = await createCourse(trainer, { title: "Data rights course", category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const item = await addItem(trainer, mod.id, "RICH_TEXT", "Only item");
  await updateItem(trainer, item.id, {
    title: "Only item",
    required: true,
    published: true,
    estMinutes: null,
    body: doc("Hi"),
  });
  const task = await addItem(trainer, mod.id, "ASSIGNMENT", "Site photo");
  await setCourseStatus(trainer, course.id, "PUBLISHED");
  await enrolLearners(admin, course.id, [learner.id], { organizationId: org.id });
  await completeItem(learner.id, item.id);

  // Written work with an uploaded file, a discussion post and a session.
  const enrolment = await db.enrolment.findFirstOrThrow({ where: { userId: learner.id } });
  const asset = await db.asset.create({
    data: {
      storageKey: `test/${learner.id}.pdf`,
      filename: "my-site.pdf",
      mime: "application/pdf",
      kind: "DOCUMENT",
      bytes: 10,
      uploadedById: learner.id,
    },
  });
  await db.submission.create({
    data: {
      assignmentId: task.id,
      enrolmentId: enrolment.id,
      attemptNo: 1,
      text: "Our scaffold at Gate 3 had no toe boards.",
      files: { create: { assetId: asset.id, position: 0 } },
      mark: {
        create: {
          score: 80,
          feedbackText: "Good spot, Sibusiso.",
          status: "RELEASED",
          releasedAt: new Date(),
        },
      },
    },
  });
  const thread = await db.discussionThread.create({
    data: { courseId: course.id, authorId: learner.id, title: "PPE?" },
  });
  await db.discussionPost.create({
    data: { threadId: thread.id, authorId: learner.id, body: "My manager is Thabo at Gate 3." },
  });
  await createSession(learner.id, { twoFactorVerified: false });
});

describe("access requests (POPIA s23)", () => {
  it("export everything held, decrypted", async () => {
    const data = await buildDataExport(learner.id);
    expect(data.profile).toMatchObject({ fullName: "Sibusiso Mahlangu", idNumber: "8001015009087" });
    expect(data.training[0]!.assignments[0]).toMatchObject({
      text: expect.stringContaining("toe boards"),
      files: ["my-site.pdf"],
    });
    expect(data.certificates).toHaveLength(1);
    expect(data.discussionPosts[0]!.body).toContain("Thabo");
  });

  it("can only be downloaded by the person once an admin has approved the request", async () => {
    expect(await exportForSelf(learner.id)).toBeNull();
    expect(await exportAvailableUntil(learner.id)).toBeNull();
    await db.dataRequest.create({
      data: { userId: learner.id, type: "EXPORT", status: "COMPLETED", completedAt: new Date() },
    });
    expect(await exportAvailableUntil(learner.id)).toBeInstanceOf(Date);
    expect((await exportForSelf(learner.id))?.profile?.fullName).toBe("Sibusiso Mahlangu");
    // Approvals expire.
    expect(await exportForSelf(learner.id, new Date(Date.now() + 8 * 86_400_000))).toBeNull();
  });
});

describe("erasure (POPIA s24)", () => {
  it("is admin-only, never self-service, and never removes the last Super Admin", async () => {
    await expect(eraseAccount(trainer, learner.id)).rejects.toThrow(PermissionError);
    await expect(eraseAccount(admin, admin.id)).rejects.toThrow(AssessmentError);
    const soleAdmins = await db.user.count({
      where: { status: "ACTIVE", roles: { some: { role: "SUPER_ADMIN" } } },
    });
    if (soleAdmins === 1) {
      const other = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
      await db.user.update({ where: { id: other.id }, data: { status: "SUSPENDED" } });
      await expect(eraseAccount(other, admin.id)).rejects.toThrow(/last active Super Admin/);
    }
  });

  it("removes identity, work and credentials but keeps anonymous training numbers", async () => {
    const cert = await db.certificate.findFirstOrThrow({ where: { userId: learner.id } });
    const request = await db.dataRequest.create({ data: { userId: learner.id, type: "DELETE" } });
    await eraseAccount(admin, learner.id, request.id);

    const u = await db.user.findUniqueOrThrow({ where: { id: learner.id }, include: { profile: true } });
    expect(u.status).toBe("DELETED");
    expect(u.passwordHash).toBeNull();
    expect(dec.email(u.id, u.emailEnc)).toMatch(/^erased\+/);
    expect(dec.fullName(u.id, u.profile!.fullNameEnc)).toBe("Erased account");
    expect(u.profile!.idNumberEnc).toBeNull();
    expect(u.profile!.idNumberIdx).toBeNull();
    expect(await db.authSession.count({ where: { userId: learner.id } })).toBe(0);

    const sub = await db.submission.findFirstOrThrow({
      where: { enrolment: { userId: learner.id } },
      include: { files: true, mark: true },
    });
    expect(sub.text).toBeNull();
    expect(sub.files).toHaveLength(0);
    expect(sub.mark).toMatchObject({ score: 80, feedbackText: null });
    expect(await db.asset.count({ where: { uploadedById: learner.id } })).toBe(0);
    const post = await db.discussionPost.findFirstOrThrow({ where: { authorId: learner.id } });
    expect(post.body).toBe("");
    expect(post.deletedAt).not.toBeNull();

    // Completion still counts for the company, without a name.
    expect(await db.enrolment.findFirstOrThrow({ where: { userId: learner.id } })).toMatchObject({
      status: "COMPLETED",
    });
    expect(await verifyCertificate(cert.code)).toMatchObject({ status: "revoked" });
    expect(await db.dataRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
      status: "COMPLETED",
    });
    expect(await db.auditLog.count({ where: { action: "user.erased", entityId: learner.id } })).toBe(1);
    await expect(eraseAccount(admin, learner.id)).rejects.toThrow(/already been erased/);
  });
});
