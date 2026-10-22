import "server-only";
import type {
  CourseCategory,
  CourseStatus,
  CourseVisibility,
  ItemType,
  Prisma,
  ReleaseRuleType,
} from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { generateToken } from "@/server/crypto/tokens";
import { isSuperAdmin, managedOrgIds } from "@/server/rbac";
import { PermissionError, type Actor } from "@/server/pii/users";
import { assertCanEditCourse, canCreateCourses, NotFoundError } from "@/server/courses/access";
import { createsCycle } from "@/server/courses/release";
import { parseVideoEmbed } from "@/lib/video-embed";
import { sanitizeRichText } from "@/lib/rich-text";

export class ValidationError extends Error {}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "course"
  );
}

async function uniqueSlug(tx: Tx, title: string) {
  const base = slugify(title);
  if (!(await tx.course.findUnique({ where: { slug: base } }))) return base;
  return `${base}-${generateToken().slice(0, 5)}`;
}

export interface NewCourseInput {
  title: string;
  category: CourseCategory;
  summary?: string;
  templateId?: string | null;
  isTemplate?: boolean;
}

export async function createCourse(actor: Actor, input: NewCourseInput) {
  if (!canCreateCourses(actor)) throw new PermissionError();
  if (input.isTemplate && !isSuperAdmin(actor.roles))
    throw new PermissionError("Only administrators manage templates.");
  if (input.templateId) {
    const template = await db.course.findFirst({ where: { id: input.templateId, isTemplate: true } });
    if (!template) throw new ValidationError("That template no longer exists.");
    return cloneCourse(actor, template.id, {
      title: input.title,
      category: input.category,
      summary: input.summary,
    });
  }
  return db.$transaction(async (tx) => {
    const course = await tx.course.create({
      data: {
        slug: await uniqueSlug(tx, input.title),
        title: input.title.trim(),
        summary: input.summary?.trim() ?? "",
        category: input.category,
        isTemplate: Boolean(input.isTemplate),
        createdById: actor.id,
        staff: { create: { userId: actor.id, role: "LEAD" } },
        modules: { create: { position: 0, title: "Module 1" } },
      },
    });
    await audit(
      { actorId: actor.id, action: "course.created", entityType: "Course", entityId: course.id },
      tx,
    );
    return course;
  });
}

/**
 * Copies a course's structure (modules, items, release rules) into a new draft.
 * Files are shared, not duplicated; enrolments and progress are never copied.
 */
export async function cloneCourse(
  actor: Actor,
  sourceId: string,
  overrides: { title: string; category?: CourseCategory; summary?: string; isTemplate?: boolean },
) {
  const source = await db.course.findUniqueOrThrow({
    where: { id: sourceId },
    include: {
      modules: {
        orderBy: { position: "asc" },
        include: {
          releaseRules: true,
          items: { orderBy: { position: "asc" }, include: { releaseRules: true } },
        },
      },
    },
  });
  if (!source.isTemplate) await assertCanEditCourse(actor, sourceId);

  return db.$transaction(async (tx) => {
    const course = await tx.course.create({
      data: {
        slug: await uniqueSlug(tx, overrides.title),
        title: overrides.title.trim(),
        summary: overrides.summary?.trim() || source.summary,
        category: overrides.category ?? source.category,
        estMinutes: source.estMinutes,
        coverAssetId: source.coverAssetId,
        isTemplate: Boolean(overrides.isTemplate),
        templateSourceId: source.isTemplate ? source.id : null,
        createdById: actor.id,
        staff: { create: { userId: actor.id, role: "LEAD" } },
      },
    });

    const itemIdMap = new Map<string, string>();
    const pendingRules: {
      rule: (typeof source.modules)[number]["releaseRules"][number];
      moduleId?: string;
      itemId?: string;
    }[] = [];

    for (const m of source.modules) {
      const mod = await tx.module.create({
        data: { courseId: course.id, position: m.position, title: m.title, description: m.description },
      });
      m.releaseRules.forEach((rule) => pendingRules.push({ rule, moduleId: mod.id }));
      for (const i of m.items) {
        const item = await tx.item.create({
          data: {
            moduleId: mod.id,
            position: i.position,
            type: i.type,
            title: i.title,
            body: i.body ?? undefined,
            assetId: i.assetId,
            externalUrl: i.externalUrl,
            required: i.required,
            published: i.published,
            estMinutes: i.estMinutes,
          },
        });
        itemIdMap.set(i.id, item.id);
        i.releaseRules.forEach((rule) => pendingRules.push({ rule, itemId: item.id }));
      }
    }

    for (const { rule, moduleId, itemId } of pendingRules) {
      await tx.releaseRule.create({
        data: {
          moduleId,
          itemId,
          type: rule.type,
          afterDate: rule.afterDate,
          minScorePct: rule.minScorePct,
          dependsOnItemId: rule.dependsOnItemId ? itemIdMap.get(rule.dependsOnItemId) : null,
        },
      });
    }
    await audit(
      {
        actorId: actor.id,
        action: "course.created",
        entityType: "Course",
        entityId: course.id,
        meta: { from: source.id },
      },
      tx,
    );
    return course;
  });
}

export interface CourseSettingsInput {
  title: string;
  summary: string;
  category: CourseCategory;
  visibility: CourseVisibility;
  estMinutes: number | null;
}

export async function updateCourseSettings(actor: Actor, courseId: string, input: CourseSettingsInput) {
  await assertCanEditCourse(actor, courseId);
  await db.course.update({
    where: { id: courseId },
    data: {
      title: input.title.trim(),
      summary: input.summary.trim(),
      category: input.category,
      visibility: input.visibility,
      estMinutes: input.estMinutes,
    },
  });
}

export async function setCourseCover(actor: Actor, courseId: string, assetId: string | null) {
  await assertCanEditCourse(actor, courseId);
  if (assetId) {
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.kind !== "IMAGE" || asset.uploadedById !== actor.id)
      throw new ValidationError("Upload an image first.");
  }
  await db.course.update({ where: { id: courseId }, data: { coverAssetId: assetId } });
}

export async function setCourseStatus(actor: Actor, courseId: string, status: CourseStatus) {
  await assertCanEditCourse(actor, courseId);
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId } });
  if (status === "PUBLISHED") {
    if (course.isTemplate)
      throw new ValidationError("Templates can't be published. Create a course from it instead.");
    const visible = await db.item.count({ where: { published: true, module: { courseId } } });
    if (visible === 0) throw new ValidationError("Publish at least one item before publishing the course.");
  }
  await db.course.update({
    where: { id: courseId },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? (course.publishedAt ?? new Date()) : course.publishedAt,
    },
  });
  await audit({
    actorId: actor.id,
    action: "course.status_changed",
    entityType: "Course",
    entityId: courseId,
    meta: { from: course.status, to: status },
  });
}

export async function deleteCourse(actor: Actor, courseId: string) {
  await assertCanEditCourse(actor, courseId);
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { _count: { select: { enrolments: true } } },
  });
  if (course.status !== "DRAFT" || course._count.enrolments > 0) {
    throw new ValidationError("Only draft courses with no learners can be deleted. Archive it instead.");
  }
  await db.course.delete({ where: { id: courseId } });
  await audit({
    actorId: actor.id,
    action: "course.deleted",
    entityType: "Course",
    entityId: courseId,
    meta: { title: course.title },
  });
}

// ---------------------------------------------------------------------------
// Modules & items
// ---------------------------------------------------------------------------

async function courseIdOfModule(moduleId: string) {
  const m = await db.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!m) throw new NotFoundError("Module not found");
  return m.courseId;
}

async function courseIdOfItem(itemId: string) {
  const i = await db.item.findUnique({
    where: { id: itemId },
    select: { module: { select: { courseId: true } } },
  });
  if (!i) throw new NotFoundError("Item not found");
  return i.module.courseId;
}

export async function addModule(actor: Actor, courseId: string, title: string) {
  await assertCanEditCourse(actor, courseId);
  const last = await db.module.findFirst({ where: { courseId }, orderBy: { position: "desc" } });
  return db.module.create({
    data: { courseId, title: title.trim() || "Untitled module", position: (last?.position ?? -1) + 1 },
  });
}

export async function updateModule(
  actor: Actor,
  moduleId: string,
  data: { title: string; description: string },
) {
  await assertCanEditCourse(actor, await courseIdOfModule(moduleId));
  await db.module.update({
    where: { id: moduleId },
    data: { title: data.title.trim() || "Untitled module", description: data.description.trim() },
  });
}

export async function deleteModule(actor: Actor, moduleId: string) {
  const courseId = await courseIdOfModule(moduleId);
  await assertCanEditCourse(actor, courseId);
  const count = await db.module.count({ where: { courseId } });
  if (count <= 1) throw new ValidationError("A course needs at least one module.");
  await db.module.delete({ where: { id: moduleId } });
}

export async function addItem(actor: Actor, moduleId: string, type: ItemType, title: string) {
  await assertCanEditCourse(actor, await courseIdOfModule(moduleId));
  const last = await db.item.findFirst({ where: { moduleId }, orderBy: { position: "desc" } });
  return db.item.create({
    data: {
      moduleId,
      type,
      title: title.trim() || "Untitled item",
      position: (last?.position ?? -1) + 1,
      body: type === "RICH_TEXT" ? { type: "doc", content: [{ type: "paragraph" }] } : undefined,
    },
  });
}

export interface ItemInput {
  title: string;
  required: boolean;
  published: boolean;
  estMinutes: number | null;
  body?: Prisma.InputJsonValue | null;
  externalUrl?: string | null;
}

const MAX_BODY_BYTES = 200_000;

export async function updateItem(actor: Actor, itemId: string, input: ItemInput) {
  await assertCanEditCourse(actor, await courseIdOfItem(itemId));
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId }, include: { asset: true } });

  let body: Prisma.InputJsonValue | undefined;
  if (input.body !== undefined && input.body !== null) {
    if (JSON.stringify(input.body).length > MAX_BODY_BYTES) {
      throw new ValidationError("This text is too long. Split it into several items.");
    }
    body = sanitizeRichText(input.body) as unknown as Prisma.InputJsonValue;
  }

  let externalUrl: string | null | undefined = undefined;
  if (input.externalUrl !== undefined) {
    externalUrl = input.externalUrl?.trim() || null;
    if (externalUrl) {
      let url: URL;
      try {
        url = new URL(externalUrl);
      } catch {
        throw new ValidationError("Enter a full web address starting with https://");
      }
      if (url.protocol !== "https:") throw new ValidationError("Links must start with https://");
      if (item.type === "VIDEO" && !parseVideoEmbed(externalUrl)) {
        throw new ValidationError(
          "Use a YouTube, Vimeo or Bunny Stream link — or upload a video file instead.",
        );
      }
    }
  }

  if (input.published) {
    const hasContent =
      item.type === "RICH_TEXT" ||
      (item.type === "LINK" && (externalUrl ?? item.externalUrl)) ||
      (item.type === "VIDEO" && ((externalUrl ?? item.externalUrl) || item.assetId)) ||
      (["PDF", "SLIDES", "DOWNLOAD"].includes(item.type) && item.assetId);
    if (!hasContent)
      throw new ValidationError("Add the content (file or link) before showing this item to learners.");
    if (item.asset && !["CLEAN", "SKIPPED"].includes(item.asset.scanStatus)) {
      throw new ValidationError("The file hasn't passed the virus scan yet.");
    }
  }

  await db.item.update({
    where: { id: itemId },
    data: {
      title: input.title.trim() || "Untitled item",
      required: input.required,
      published: input.published,
      estMinutes: input.estMinutes,
      ...(body !== undefined ? { body } : {}),
      ...(externalUrl !== undefined ? { externalUrl } : {}),
    },
  });
}

export async function attachAssetToItem(actor: Actor, itemId: string, assetId: string | null) {
  await assertCanEditCourse(actor, await courseIdOfItem(itemId));
  if (assetId) {
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.uploadedById !== actor.id) throw new ValidationError("Upload the file first.");
  }
  await db.item.update({
    where: { id: itemId },
    // Removing the file also hides the item, so learners never see an empty item.
    data: { assetId, ...(assetId ? {} : { published: false }) },
  });
}

export async function deleteItem(actor: Actor, itemId: string) {
  await assertCanEditCourse(actor, await courseIdOfItem(itemId));
  await db.item.delete({ where: { id: itemId } });
}

export interface LayoutModule {
  moduleId: string;
  itemIds: string[];
}

/**
 * Saves the full order of modules and items after a drag-and-drop. The layout must
 * contain exactly the course's current modules and items (guards against stale tabs).
 */
export async function saveLayout(actor: Actor, courseId: string, layout: LayoutModule[]) {
  await assertCanEditCourse(actor, courseId);
  const modules = await db.module.findMany({
    where: { courseId },
    select: { id: true, items: { select: { id: true } } },
  });
  const moduleIds = new Set(modules.map((m) => m.id));
  const itemIds = new Set(modules.flatMap((m) => m.items.map((i) => i.id)));
  const givenModules = layout.map((l) => l.moduleId);
  const givenItems = layout.flatMap((l) => l.itemIds);
  const same = (a: Set<string>, b: string[]) =>
    a.size === b.length && new Set(b).size === b.length && b.every((x) => a.has(x));
  if (!same(moduleIds, givenModules) || !same(itemIds, givenItems)) {
    throw new ValidationError("The course changed in another tab. Reload and try again.");
  }
  await db.$transaction([
    ...layout.map((l, mi) => db.module.update({ where: { id: l.moduleId }, data: { position: mi } })),
    ...layout.flatMap((l) =>
      l.itemIds.map((id, ii) =>
        db.item.update({ where: { id }, data: { moduleId: l.moduleId, position: ii } }),
      ),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Release rules
// ---------------------------------------------------------------------------

export interface RuleInput {
  target: { moduleId: string } | { itemId: string };
  type: ReleaseRuleType;
  afterDate?: Date | null;
  dependsOnItemId?: string | null;
  minScorePct?: number | null;
}

// Item types that produce a score (quizzes arrive in Phase 3).
const SCORED_TYPES: ItemType[] = [];

export async function addReleaseRule(actor: Actor, input: RuleInput) {
  const courseId =
    "moduleId" in input.target
      ? await courseIdOfModule(input.target.moduleId)
      : await courseIdOfItem(input.target.itemId);
  await assertCanEditCourse(actor, courseId);

  if (input.type === "AFTER_DATE") {
    if (!input.afterDate || Number.isNaN(input.afterDate.getTime()))
      throw new ValidationError("Choose a date.");
  } else {
    const dep = input.dependsOnItemId
      ? await db.item.findFirst({ where: { id: input.dependsOnItemId, module: { courseId } } })
      : null;
    if (!dep) throw new ValidationError("Choose an item from this course.");
    if (input.type === "MIN_SCORE") {
      if (!SCORED_TYPES.includes(dep.type)) throw new ValidationError("Score rules need a quiz item.");
      if (input.minScorePct == null || input.minScorePct < 0 || input.minScorePct > 100) {
        throw new ValidationError("Enter a score between 0 and 100.");
      }
    }
    // Reject rules that would lock content forever.
    const edges = await dependencyEdges(courseId);
    const sources =
      "itemId" in input.target
        ? [input.target.itemId]
        : (await db.item.findMany({ where: { moduleId: input.target.moduleId }, select: { id: true } })).map(
            (i) => i.id,
          );
    if (sources.includes(dep.id) || sources.some((s) => createsCycle(edges, s, dep.id))) {
      throw new ValidationError("That would make items wait on each other, so neither could ever open.");
    }
  }

  return db.releaseRule.create({
    data: {
      ...("moduleId" in input.target ? { moduleId: input.target.moduleId } : { itemId: input.target.itemId }),
      type: input.type,
      afterDate: input.type === "AFTER_DATE" ? input.afterDate : null,
      dependsOnItemId: input.type === "AFTER_DATE" ? null : input.dependsOnItemId,
      minScorePct: input.type === "MIN_SCORE" ? input.minScorePct : null,
    },
  });
}

/** item -> items it waits on (directly, or via its module's rules). */
async function dependencyEdges(courseId: string) {
  const modules = await db.module.findMany({
    where: { courseId },
    include: { releaseRules: true, items: { include: { releaseRules: true } } },
  });
  const edges = new Map<string, string[]>();
  for (const m of modules) {
    const moduleDeps = m.releaseRules.flatMap((r) => (r.dependsOnItemId ? [r.dependsOnItemId] : []));
    for (const i of m.items) {
      const deps = [
        ...moduleDeps,
        ...i.releaseRules.flatMap((r) => (r.dependsOnItemId ? [r.dependsOnItemId] : [])),
      ];
      if (deps.length) edges.set(i.id, deps);
    }
  }
  return edges;
}

export async function deleteReleaseRule(actor: Actor, ruleId: string) {
  const rule = await db.releaseRule.findUnique({
    where: { id: ruleId },
    select: {
      module: { select: { courseId: true } },
      item: { select: { module: { select: { courseId: true } } } },
    },
  });
  const courseId = rule?.module?.courseId ?? rule?.item?.module.courseId;
  if (!courseId) throw new NotFoundError("Rule not found");
  await assertCanEditCourse(actor, courseId);
  await db.releaseRule.delete({ where: { id: ruleId } });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function addCourseStaff(actor: Actor, courseId: string, userId: string) {
  await assertCanEditCourse(actor, courseId);
  const isTrainer = await db.roleAssignment.findFirst({
    where: { userId, role: "TRAINER" },
    select: { id: true },
  });
  if (!isTrainer) throw new ValidationError("Only trainers can be added to a course team.");
  await db.courseStaff.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId, role: "ASSISTANT" },
    update: {},
  });
  await audit({
    actorId: actor.id,
    action: "course.staff_changed",
    entityType: "Course",
    entityId: courseId,
    meta: { added: userId },
  });
}

export async function removeCourseStaff(actor: Actor, courseId: string, userId: string) {
  await assertCanEditCourse(actor, courseId);
  const staff = await db.courseStaff.findMany({ where: { courseId } });
  const target = staff.find((s) => s.userId === userId);
  if (!target) return;
  if (target.role === "LEAD" && staff.filter((s) => s.role === "LEAD").length === 1) {
    throw new ValidationError("A course needs a lead trainer.");
  }
  await db.courseStaff.delete({ where: { courseId_userId: { courseId, userId } } });
  await audit({
    actorId: actor.id,
    action: "course.staff_changed",
    entityType: "Course",
    entityId: courseId,
    meta: { removed: userId },
  });
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

/**
 * Enrols learners. Super Admins can enrol any learner into any non-template course.
 * Client Managers can enrol their own staff into published, catalogue (PUBLIC) courses only.
 * Trainers don't enrol: that would mean browsing every learner on the platform (POPIA
 * minimality); they see the roster of their own courses instead.
 */
export async function enrolLearners(
  actor: Actor,
  courseId: string,
  userIds: string[],
  opts: { dueAt?: Date | null; organizationId?: string | null } = {},
): Promise<{ enrolled: number; skipped: number }> {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.isTemplate) throw new NotFoundError("Course not found");

  let source: "ADMIN" | "CLIENT_MANAGER";
  let orgForAll: string | null = null;
  const unique = [...new Set(userIds)];

  if (isSuperAdmin(actor.roles)) source = "ADMIN";
  else if (opts.organizationId && managedOrgIds(actor.roles).includes(opts.organizationId)) {
    source = "CLIENT_MANAGER";
    orgForAll = opts.organizationId;
    if (course.status !== "PUBLISHED" || course.visibility !== "PUBLIC")
      throw new NotFoundError("Course not found");
    const members = await db.orgMembership.count({
      where: { organizationId: orgForAll, userId: { in: unique } },
    });
    if (members !== unique.length) throw new PermissionError();
  } else throw new PermissionError();

  const learners = await db.user.findMany({
    where: {
      id: { in: unique },
      status: { in: ["ACTIVE", "INVITED"] },
      roles: { some: { role: "LEARNER" } },
    },
    select: { id: true, memberships: { select: { organizationId: true } } },
  });

  let enrolled = 0;
  for (const learner of learners) {
    const organizationId =
      orgForAll ??
      opts.organizationId ??
      (learner.memberships.length === 1 ? learner.memberships[0]!.organizationId : null);
    const existing = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: learner.id, courseId } },
    });
    if (existing && existing.status !== "WITHDRAWN") continue;
    const enrolment = existing
      ? await db.enrolment.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            source,
            enrolledById: actor.id,
            dueAt: opts.dueAt ?? null,
            organizationId,
          },
        })
      : await db.enrolment.create({
          data: {
            userId: learner.id,
            courseId,
            source,
            enrolledById: actor.id,
            dueAt: opts.dueAt ?? null,
            organizationId,
          },
        });
    await audit({
      actorId: actor.id,
      action: "enrolment.created",
      entityType: "Enrolment",
      entityId: enrolment.id,
      orgId: organizationId,
      meta: { courseId, userId: learner.id },
    });
    enrolled++;
  }
  return { enrolled, skipped: unique.length - enrolled };
}

export async function withdrawEnrolment(actor: Actor, enrolmentId: string) {
  const enrolment = await db.enrolment.findUnique({ where: { id: enrolmentId } });
  if (!enrolment) throw new NotFoundError("Enrolment not found");
  await assertCanEditCourse(actor, enrolment.courseId);
  await db.enrolment.update({ where: { id: enrolmentId }, data: { status: "WITHDRAWN" } });
  await audit({
    actorId: actor.id,
    action: "enrolment.withdrawn",
    entityType: "Enrolment",
    entityId: enrolmentId,
  });
}
