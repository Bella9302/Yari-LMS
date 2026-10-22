"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/guards";
import { friendly } from "@/server/actions/errors";
import {
  addQuestion,
  addQuizSection,
  archiveQuestion,
  createBank,
  deleteBank,
  deleteRubric,
  duplicateRubric,
  removeQuizSection,
  renameBank,
  saveRubric,
  updateAssignmentSettings,
  updateQuestion,
  updateQuizSettings,
  type RubricInput,
} from "@/server/assessment/authoring";
import { markAttempt, saveAnswers, startAttempt, submitAttempt } from "@/server/assessment/quiz";
import { saveMark, submitAssignment } from "@/server/assessment/assignments";
import { setGradeOverride } from "@/server/assessment/grades";
import type { FormState } from "@/lib/form-state";

async function actor() {
  const { user } = await requireUser();
  return { id: user.id, roles: user.roles };
}

const teach = (courseId: string) => `/teach/courses/${courseId}`;
const intOrNull = (v: FormDataEntryValue | null) => (v && /^\d+$/.test(String(v)) ? Number(v) : null);

// ---------------------------------------------------------------------------
// Question banks
// ---------------------------------------------------------------------------

export async function createBankAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  let bankId: string;
  try {
    bankId = (await createBank(await actor(), courseId, String(formData.get("title") ?? "").slice(0, 120)))
      .id;
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(`${teach(courseId)}/questions/${bankId}`);
}

export async function renameBankAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await renameBank(
      await actor(),
      String(formData.get("bankId")),
      String(formData.get("title") ?? "").slice(0, 120),
    );
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/questions`, "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteBankAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await deleteBank(await actor(), String(formData.get("bankId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(`${teach(courseId)}/questions`);
}

/** The question editor posts its structured data as JSON in a hidden field. */
export async function saveQuestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const questionId = String(formData.get("questionId") ?? "");
  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { error: "Couldn't read the question. Try again." };
  }
  const fields = {
    prompt: String(formData.get("prompt") ?? ""),
    points: Number(formData.get("points") ?? 1),
    explanation: String(formData.get("explanation") ?? ""),
    data,
  };
  try {
    if (questionId) await updateQuestion(await actor(), questionId, fields);
    else await addQuestion(await actor(), String(formData.get("bankId")), fields);
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/questions`, "layout");
  return { ok: true, message: questionId ? "Question updated." : "Question added." };
}

export async function archiveQuestionAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await archiveQuestion(await actor(), String(formData.get("questionId")));
  revalidatePath(`${teach(courseId)}/questions`, "layout");
}

// ---------------------------------------------------------------------------
// Quiz & assignment settings
// ---------------------------------------------------------------------------

export async function updateQuizSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await updateQuizSettings(await actor(), String(formData.get("itemId")), {
      instructions: String(formData.get("instructions") ?? ""),
      passPct: Number(formData.get("passPct") ?? 70),
      timeLimitMin: intOrNull(formData.get("timeLimitMin")),
      maxAttempts: intOrNull(formData.get("maxAttempts")),
      shuffle: formData.get("shuffle") === "on",
      showAnswers: z.enum(["NEVER", "AFTER_SUBMIT", "AFTER_PASS"]).parse(formData.get("showAnswers")),
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true, message: "Quiz settings saved." };
}

export async function addQuizSectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await addQuizSection(
      await actor(),
      String(formData.get("itemId")),
      String(formData.get("bankId")),
      intOrNull(formData.get("drawCount")),
    );
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true };
}

export async function removeQuizSectionAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await removeQuizSection(await actor(), String(formData.get("sectionId")));
  revalidatePath(teach(courseId), "layout");
}

export async function updateAssignmentSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const due = String(formData.get("dueAt") ?? "");
  try {
    await updateAssignmentSettings(await actor(), String(formData.get("itemId")), {
      dueAt: due ? new Date(`${due}:00+02:00`) : null,
      allowText: formData.get("allowText") === "on",
      allowFiles: formData.get("allowFiles") === "on",
      maxFiles: Number(formData.get("maxFiles") ?? 3),
      maxPoints: Number(formData.get("maxPoints") ?? 100),
      passPct: Number(formData.get("passPct") ?? 50),
      rubricId: String(formData.get("rubricId") ?? "") || null,
      allowLate: formData.get("allowLate") === "on",
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(teach(courseId), "layout");
  return { ok: true, message: "Assignment settings saved." };
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

export async function saveRubricAction(
  courseId: string,
  rubricId: string | null,
  input: RubricInput,
): Promise<FormState & { id?: string }> {
  try {
    const rubric = await saveRubric(
      await actor(),
      String(courseId),
      rubricId ? String(rubricId) : null,
      input,
    );
    revalidatePath(`${teach(courseId)}/rubrics`, "layout");
    return { ok: true, message: "Rubric saved.", id: rubric.id };
  } catch (err) {
    return { error: friendly(err) };
  }
}

export async function duplicateRubricAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  const copy = await duplicateRubric(await actor(), String(formData.get("rubricId")));
  redirect(`${teach(courseId)}/rubrics/${copy.id}`);
}

export async function deleteRubricAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await deleteRubric(await actor(), String(formData.get("rubricId")));
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(`${teach(courseId)}/rubrics`);
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

export async function saveMarkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const submissionId = String(formData.get("submissionId"));
  const action = z.enum(["draft", "release", "return"]).parse(formData.get("intent"));
  let selections: Record<string, string> = {};
  try {
    selections = JSON.parse(String(formData.get("rubricSelections") ?? "{}"));
  } catch {}
  const score = String(formData.get("score") ?? "");
  try {
    await saveMark(await actor(), submissionId, {
      score: score === "" ? null : Number(score),
      rubricSelections: selections,
      feedbackText: String(formData.get("feedbackText") ?? ""),
      feedbackAssetId: String(formData.get("feedbackAssetId") ?? "") || null,
      audioAssetId: String(formData.get("audioAssetId") ?? "") || null,
      action,
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/marking`, "layout");
  revalidatePath(`${teach(courseId)}/gradebook`, "layout");
  const next = String(formData.get("nextHref") ?? "");
  if (action !== "draft" && next) redirect(next);
  return {
    ok: true,
    message:
      action === "draft"
        ? "Draft saved. The learner can't see it yet."
        : action === "return"
          ? "Returned to the learner."
          : "Mark released to the learner.",
  };
}

export async function markAttemptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const awarded: Record<string, number> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("points:")) awarded[k.slice(7)] = Number(v);
  }
  try {
    await markAttempt(await actor(), String(formData.get("attemptId")), awarded);
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/marking`, "layout");
  revalidatePath(`${teach(courseId)}/gradebook`, "layout");
  return { ok: true, message: "Attempt marked." };
}

export async function overrideGradeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const remove = formData.get("intent") === "remove";
  try {
    await setGradeOverride(
      await actor(),
      String(formData.get("enrolmentId")),
      String(formData.get("itemId")),
      remove
        ? null
        : { scorePct: Number(formData.get("scorePct")), reason: String(formData.get("reason") ?? "") },
    );
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/gradebook`, "layout");
  return { ok: true, message: remove ? "Override removed." : "Grade overridden." };
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

export async function startAttemptAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("itemId"));
  let attemptId: string;
  try {
    attemptId = await startAttempt(await actor(), itemId);
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(`/learn/${slug}/${itemId}/attempt/${attemptId}`);
}

export async function saveAnswersAction(attemptId: string, answers: unknown): Promise<{ saved: boolean }> {
  return saveAnswers(await actor(), String(attemptId), answers);
}

export async function submitAttemptAction(
  slug: string,
  itemId: string,
  attemptId: string,
  answers: unknown,
): Promise<void> {
  await submitAttempt(await actor(), String(attemptId), answers);
  revalidatePath(`/learn/${slug}`, "layout");
  redirect(`/learn/${slug}/${itemId}/attempt/${attemptId}`);
}

export async function submitAssignmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("itemId"));
  try {
    await submitAssignment(await actor(), itemId, {
      text: String(formData.get("text") ?? ""),
      assetIds: formData.getAll("assetId").map(String),
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`/learn/${slug}`, "layout");
  return { ok: true, message: "Handed in. Your trainer will mark it." };
}
