import { Readable } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addItem,
  addModule,
  addReleaseRule,
  attachAssetToItem,
  createCourse,
  enrolLearners,
  saveLayout,
  setCourseStatus,
  updateItem,
  ValidationError,
} from "@/server/courses/builder";
import { NotFoundError } from "@/server/courses/access";
import { completeItem, getLearnerCourse, getLearnerItem, LockedError } from "@/server/courses/learner";
import { ensureTemplates } from "@/server/courses/templates";
import { canReadAsset, finishUpload, startUpload, UploadError } from "@/server/storage/assets";
import { storage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { PermissionError } from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let trainer: U, otherTrainer: U, admin: U, learner: U, outsider: U, manager: U, staff: U, otherStaff: U;
let orgA: { id: string }, orgB: { id: string };

const text = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});

async function buildCourse(owner: U) {
  const course = await createCourse(owner, { title: "Working at Heights", category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const intro = await addItem(owner, mod.id, "RICH_TEXT", "Introduction");
  const harness = await addItem(owner, mod.id, "RICH_TEXT", "Harness checks");
  await updateItem(owner, intro.id, {
    title: "Introduction",
    required: true,
    published: true,
    estMinutes: 5,
    body: text("Hello"),
  });
  await updateItem(owner, harness.id, {
    title: "Harness checks",
    required: true,
    published: true,
    estMinutes: 5,
    body: text("Check"),
  });
  await addReleaseRule(owner, {
    target: { itemId: harness.id },
    type: "ITEM_COMPLETED",
    dependsOnItemId: intro.id,
  });
  return { course, mod, intro, harness };
}

beforeAll(async () => {
  orgA = await createOrg();
  orgB = await createOrg();
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }] });
  otherTrainer = await createUser({ roles: [{ role: "TRAINER" }] });
  learner = await createUser({ roles: [{ role: "LEARNER" }] });
  outsider = await createUser({ roles: [{ role: "LEARNER" }] });
  manager = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgA.id }] });
  staff = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgA.id] });
  otherStaff = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgB.id] });
});

describe("course building permissions", () => {
  it("lets trainers create courses and become lead", async () => {
    const { course } = await buildCourse(trainer);
    const staffRows = await db.courseStaff.findMany({ where: { courseId: course.id } });
    expect(staffRows).toEqual([expect.objectContaining({ userId: trainer.id, role: "LEAD" })]);
  });

  it("stops learners creating courses and trainers editing others' courses", async () => {
    await expect(createCourse(learner, { title: "X", category: "AI_DIGITAL" })).rejects.toThrow(
      PermissionError,
    );
    const { mod } = await buildCourse(trainer);
    await expect(addItem(otherTrainer, mod.id, "RICH_TEXT", "Sneaky")).rejects.toThrow(NotFoundError);
    await expect(addModule(admin, mod.courseId, "Admin can")).resolves.toBeTruthy();
  });

  it("won't publish an empty course or show an item without content", async () => {
    const course = await createCourse(trainer, { title: "Empty", category: "AI_DIGITAL" });
    await expect(setCourseStatus(trainer, course.id, "PUBLISHED")).rejects.toThrow(ValidationError);
    const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
    const pdf = await addItem(trainer, mod.id, "PDF", "Policy");
    await expect(
      updateItem(trainer, pdf.id, { title: "Policy", required: true, published: true, estMinutes: null }),
    ).rejects.toThrow(/Add the content/);
  });

  it("rejects release rules that would deadlock", async () => {
    const { intro, harness } = await buildCourse(trainer);
    await expect(
      addReleaseRule(trainer, {
        target: { itemId: intro.id },
        type: "ITEM_COMPLETED",
        dependsOnItemId: harness.id,
      }),
    ).rejects.toThrow(/neither could ever open/);
    await expect(
      addReleaseRule(trainer, {
        target: { itemId: intro.id },
        type: "ITEM_COMPLETED",
        dependsOnItemId: intro.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a stale drag-and-drop layout", async () => {
    const { course, mod, intro, harness } = await buildCourse(trainer);
    await saveLayout(trainer, course.id, [{ moduleId: mod.id, itemIds: [harness.id, intro.id] }]);
    const order = await db.item.findMany({ where: { moduleId: mod.id }, orderBy: { position: "asc" } });
    expect(order.map((i) => i.id)).toEqual([harness.id, intro.id]);
    await expect(saveLayout(trainer, course.id, [{ moduleId: mod.id, itemIds: [intro.id] }])).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("templates", () => {
  it("creates a draft course from a template with its rules remapped", async () => {
    await ensureTemplates();
    const template = await db.course.findUniqueOrThrow({
      where: { slug: "template-she-rep-practical-training" },
    });
    const course = await createCourse(trainer, {
      title: "SHE Reps — Acme",
      category: "HEALTH_SAFETY",
      templateId: template.id,
    });
    expect(course.status).toBe("DRAFT");
    expect(course.isTemplate).toBe(false);
    const items = await db.item.findMany({
      where: { module: { courseId: course.id } },
      include: { releaseRules: true },
    });
    expect(items.length).toBeGreaterThan(5);
    const walk = items.find((i) => i.title === "Site walk-through")!;
    const dep = items.find((i) => i.id === walk.releaseRules[0]!.dependsOnItemId);
    expect(dep?.title).toBe("Conducting a workplace inspection"); // points into the copy, not the template
  });
});

describe("learner access and progress", () => {
  it("hides unpublished courses and enforces release rules on the server", async () => {
    const { course, intro, harness } = await buildCourse(trainer);
    await enrolLearners(admin, course.id, [learner.id]);
    expect(await getLearnerCourse(learner, course.slug)).toBeNull(); // still a draft

    await setCourseStatus(trainer, course.id, "PUBLISHED");
    const view = await getLearnerCourse(learner, course.slug);
    expect(view?.modules[0]!.items.map((i) => i.lock.unlocked)).toEqual([true, false]);

    const lockedItem = await getLearnerItem(learner, course.slug, harness.id);
    expect(lockedItem?.item.body).toBeNull(); // locked content isn't sent
    await expect(completeItem(learner.id, harness.id)).rejects.toThrow(LockedError);

    expect((await completeItem(learner.id, intro.id)).progressPct).toBe(50);
    const done = await completeItem(learner.id, harness.id);
    expect(done).toEqual({ progressPct: 100, courseCompleted: true });
    expect(
      (await db.enrolment.findFirstOrThrow({ where: { userId: learner.id, courseId: course.id } })).status,
    ).toBe("COMPLETED");
  });

  it("gives non-enrolled learners nothing", async () => {
    const { course } = await buildCourse(trainer);
    await setCourseStatus(trainer, course.id, "PUBLISHED");
    expect(await getLearnerCourse(outsider, course.slug)).toBeNull();
  });

  it("lets course staff preview without recording progress", async () => {
    const { course } = await buildCourse(trainer);
    const view = await getLearnerCourse(trainer, course.slug);
    expect(view?.preview).toBe(true);
    expect(view?.enrolment).toBeNull();
  });
});

describe("enrolment permissions", () => {
  it("doesn't let trainers enrol learners", async () => {
    const { course } = await buildCourse(trainer);
    await expect(enrolLearners(trainer, course.id, [learner.id])).rejects.toThrow(PermissionError);
  });
});

describe("client manager enrolment", () => {
  it("enrols only their own staff into published catalogue courses", async () => {
    const { course } = await buildCourse(trainer);
    await expect(enrolLearners(manager, course.id, [staff.id], { organizationId: orgA.id })).rejects.toThrow(
      NotFoundError,
    );
    await setCourseStatus(trainer, course.id, "PUBLISHED");
    await db.course.update({ where: { id: course.id }, data: { visibility: "PUBLIC" } });

    await expect(
      enrolLearners(manager, course.id, [otherStaff.id], { organizationId: orgA.id }),
    ).rejects.toThrow(PermissionError);
    await expect(enrolLearners(manager, course.id, [staff.id], { organizationId: orgB.id })).rejects.toThrow(
      PermissionError,
    );
    expect(await enrolLearners(manager, course.id, [staff.id], { organizationId: orgA.id })).toEqual({
      enrolled: 1,
      skipped: 0,
    });
    const enrolment = await db.enrolment.findFirstOrThrow({
      where: { userId: staff.id, courseId: course.id },
    });
    expect(enrolment).toMatchObject({ organizationId: orgA.id, source: "CLIENT_MANAGER" });
  });
});

describe("uploads", () => {
  async function put(assetId: string, bytes: Buffer) {
    const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
    await (storage() as LocalStorage).write(asset.storageKey, Readable.from([bytes]), asset.bytes);
  }

  it("accepts a real PDF and serves it only to people who can see the item", async () => {
    const { course, mod } = await buildCourse(trainer);
    const pdfItem = await addItem(trainer, mod.id, "PDF", "Policy");
    const bytes = Buffer.from("%PDF-1.4\n%test\n");
    const { assetId } = await startUpload(trainer, {
      purpose: "item",
      courseId: course.id,
      itemId: pdfItem.id,
      filename: "policy.pdf",
      mime: "application/pdf",
      bytes: bytes.length,
    });
    await put(assetId, bytes);
    const asset = await finishUpload(trainer, assetId);
    expect(asset.scanStatus).toBe("SKIPPED"); // no scanner in tests
    expect(asset.sha256).toHaveLength(64);

    await attachAssetToItem(trainer, pdfItem.id, assetId);
    await updateItem(trainer, pdfItem.id, {
      title: "Policy",
      required: false,
      published: true,
      estMinutes: null,
    });
    await setCourseStatus(trainer, course.id, "PUBLISHED");

    expect(await canReadAsset(trainer, assetId)).toBe(true);
    expect(await canReadAsset(otherTrainer, assetId)).toBe(false);
    expect(await canReadAsset(outsider, assetId)).toBe(false);
    await enrolLearners(admin, course.id, [outsider.id]);
    expect(await canReadAsset(outsider, assetId)).toBe(true);
  });

  it("rejects disallowed types, oversize files and disguised contents", async () => {
    const { course, mod } = await buildCourse(trainer);
    const pdfItem = await addItem(trainer, mod.id, "PDF", "Policy");
    const base = { purpose: "item" as const, courseId: course.id, itemId: pdfItem.id, filename: "x.exe" };
    await expect(
      startUpload(trainer, { ...base, mime: "application/x-msdownload", bytes: 10 }),
    ).rejects.toThrow(UploadError);
    await expect(
      startUpload(trainer, { ...base, mime: "application/pdf", bytes: 51 * 1024 * 1024 }),
    ).rejects.toThrow(/too large/);
    await expect(startUpload(otherTrainer, { ...base, mime: "application/pdf", bytes: 10 })).rejects.toThrow(
      NotFoundError,
    );

    const fake = Buffer.from("MZ\x90\0this is an exe");
    const { assetId } = await startUpload(trainer, { ...base, mime: "application/pdf", bytes: fake.length });
    await put(assetId, fake);
    const asset = await finishUpload(trainer, assetId);
    expect(asset.scanStatus).toBe("FAILED");
    expect(await storage().size(asset.storageKey)).toBeNull(); // deleted
  });

  it("refuses bytes beyond the declared size", async () => {
    const { course, mod } = await buildCourse(trainer);
    const pdfItem = await addItem(trainer, mod.id, "PDF", "Policy");
    const { assetId } = await startUpload(trainer, {
      purpose: "item",
      courseId: course.id,
      itemId: pdfItem.id,
      filename: "p.pdf",
      mime: "application/pdf",
      bytes: 5,
    });
    await expect(put(assetId, Buffer.from("%PDF-1.4 and much more"))).rejects.toThrow();
  });
});
