"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/guards";
import {
  addCourseStaff,
  addItem,
  addModule,
  addReleaseRule,
  attachAssetToItem,
  createCourse,
  deleteCourse,
  deleteItem,
  deleteModule,
  deleteReleaseRule,
  enrolLearners,
  removeCourseStaff,
  saveLayout,
  setCourseCover,
  setCourseStatus,
  updateCourseSettings,
  updateItem,
  updateModule,
  withdrawEnrolment,
  type LayoutModule,
} from "@/server/courses/builder";
import { completeItem, recordItemView } from "@/server/courses/learner";
import { friendly } from "@/server/actions/errors";
import { formValues, type FormState } from "@/lib/form-state";

const CATEGORY = z.enum(["HEALTH_SAFETY", "AI_DIGITAL"]);
const ITEM_TYPE = z.enum(["VIDEO", "PDF", "SLIDES", "RICH_TEXT", "LINK", "DOWNLOAD", "QUIZ", "ASSIGNMENT"]);

async function actor() {
  const { user } = await requireUser();
  return { id: user.id, roles: user.roles };
}

const teach = (courseId: string) => `/teach/courses/${courseId}`;

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export async function createCourseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      title: z.string().trim().min(3, "Give the course a title.").max(120),
      category: CATEGORY,
      templateId: z.string().optional(),
      isTemplate: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: { title: parsed.error.issues[0]!.message }, values: formValues(formData) };
  let id: string;
  try {
    const course = await createCourse(await actor(), {
      title: parsed.data.title,
      category: parsed.data.category,
      templateId: parsed.data.templateId || null,
      isTemplate: Boolean(parsed.data.isTemplate),
    });
    id = course.id;
  } catch (err) {
    return { error: friendly(err), values: formValues(formData) };
  }
  redirect(teach(id));
}

export async function updateCourseSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const parsed = z
    .object({
      title: z.string().trim().min(3, "Give the course a title.").max(120),
      summary: z.string().trim().max(600, "Keep the summary under 600 characters."),
      category: CATEGORY,
      visibility: z.enum(["PUBLIC", "PRIVATE"]),
      estMinutes: z.string().regex(/^\d{0,5}$/, "Enter whole minutes."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: { [String(parsed.error.issues[0]!.path[0])]: parsed.error.issues[0]!.message },
      values: formValues(formData),
    };
  }
  try {
    await updateCourseSettings(await actor(), courseId, {
      ...parsed.data,
      estMinutes: parsed.data.estMinutes ? Number(parsed.data.estMinutes) : null,
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true, message: "Settings saved." };
}

export async function setCourseStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const status = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).parse(formData.get("status"));
  try {
    await setCourseStatus(await actor(), courseId, status);
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true };
}

export async function deleteCourseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await deleteCourse(await actor(), String(formData.get("courseId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect("/teach");
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export async function addModuleAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await addModule(await actor(), courseId, String(formData.get("title") ?? "New module"));
  revalidatePath(teach(courseId));
}

export async function updateModuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await updateModule(await actor(), String(formData.get("moduleId")), {
      title: String(formData.get("title") ?? "").slice(0, 120),
      description: String(formData.get("description") ?? "").slice(0, 600),
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId));
  return { ok: true };
}

export async function deleteModuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await deleteModule(await actor(), String(formData.get("moduleId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId));
  return { ok: true };
}

export async function addItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const parsed = z
    .object({
      moduleId: z.string(),
      type: ITEM_TYPE,
      title: z.string().trim().min(1, "Give it a title.").max(160),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: { title: parsed.error.issues[0]!.message }, values: formValues(formData) };
  let itemId: string;
  try {
    itemId = (await addItem(await actor(), parsed.data.moduleId, parsed.data.type, parsed.data.title)).id;
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(`${teach(courseId)}/items/${itemId}`);
}

export async function updateItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  const estMinutes = String(formData.get("estMinutes") ?? "");
  let body: unknown;
  if (formData.has("body")) {
    try {
      body = JSON.parse(String(formData.get("body")));
    } catch {
      return { error: "The text couldn't be saved. Try again." };
    }
  }
  try {
    await updateItem(await actor(), itemId, {
      title: String(formData.get("title") ?? "").slice(0, 160),
      required: formData.get("required") === "on",
      published: formData.get("published") === "on",
      estMinutes: /^\d{1,4}$/.test(estMinutes) ? Number(estMinutes) : null,
      ...(body !== undefined ? { body: body as never } : {}),
      ...(formData.has("externalUrl") ? { externalUrl: String(formData.get("externalUrl")) } : {}),
    });
  } catch (err) {
    return { error: friendly(err), values: formValues(formData, ["body"]) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await deleteItem(await actor(), String(formData.get("itemId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(teach(courseId));
}

export async function saveLayoutAction(courseId: string, layout: LayoutModule[]): Promise<FormState> {
  const parsed = z
    .array(z.object({ moduleId: z.string(), itemIds: z.array(z.string()) }))
    .max(200)
    .safeParse(layout);
  if (!parsed.success) return { error: "Invalid layout." };
  try {
    await saveLayout(await actor(), courseId, parsed.data);
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Release rules
// ---------------------------------------------------------------------------

export async function addRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const type = z.enum(["AFTER_DATE", "ITEM_COMPLETED", "MIN_SCORE"]).safeParse(formData.get("type"));
  if (!type.success) return { error: "Choose a rule type." };
  const moduleId = formData.get("moduleId");
  const itemId = formData.get("itemId");
  // datetime-local has no zone: interpret as South African time.
  const date = String(formData.get("afterDate") ?? "");
  try {
    await addReleaseRule(await actor(), {
      target: moduleId ? { moduleId: String(moduleId) } : { itemId: String(itemId) },
      type: type.data,
      afterDate: date ? new Date(`${date}:00+02:00`) : null,
      dependsOnItemId: String(formData.get("dependsOnItemId") ?? "") || null,
      minScorePct: formData.get("minScorePct") ? Number(formData.get("minScorePct")) : null,
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true };
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await deleteReleaseRule(await actor(), String(formData.get("ruleId")));
  revalidatePath(teach(courseId), "layout");
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function removeItemFileAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await attachAssetToItem(await actor(), String(formData.get("itemId")), null);
  revalidatePath(teach(courseId), "layout");
}

export async function removeCoverAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await setCourseCover(await actor(), courseId, null);
  revalidatePath(teach(courseId), "layout");
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function addStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await addCourseStaff(await actor(), courseId, String(formData.get("userId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/people`);
  return { ok: true };
}

export async function removeStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await removeCourseStaff(await actor(), courseId, String(formData.get("userId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/people`);
  return { ok: true };
}

export async function enrolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const userIds = formData.getAll("userId").map(String).slice(0, 500);
  if (userIds.length === 0) return { error: "Choose at least one person." };
  const due = String(formData.get("dueAt") ?? "");
  try {
    const result = await enrolLearners(await actor(), courseId, userIds, {
      dueAt: due ? new Date(`${due}T23:59:00+02:00`) : null,
      organizationId: String(formData.get("organizationId") ?? "") || null,
    });
    revalidatePath(`${teach(courseId)}/people`);
    revalidatePath("/org");
    return {
      ok: true,
      message: `${result.enrolled} enrolled${result.skipped ? ` · ${result.skipped} already enrolled or not learners` : ""}.`,
    };
  } catch (err) {
    return { error: friendly(err) };
  }
}

export async function withdrawAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await withdrawEnrolment(await actor(), String(formData.get("enrolmentId")));
  revalidatePath(`${teach(courseId)}/people`);
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

export async function recordViewAction(itemId: string): Promise<void> {
  const { user } = await requireUser();
  await recordItemView(user.id, String(itemId));
}

export async function completeItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const slug = String(formData.get("slug"));
  try {
    const result = await completeItem(user.id, String(formData.get("itemId")));
    revalidatePath(`/learn/${slug}`, "layout");
    return { ok: true, message: result.courseCompleted ? "course-complete" : "item-complete" };
  } catch (err) {
    return { error: friendly(err) };
  }
}
