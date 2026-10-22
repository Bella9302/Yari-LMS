"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/guards";
import { friendly } from "@/server/actions/errors";
import { dismissFlag, evaluateCourse, saveRule } from "@/server/tracking/at-risk";
import { canEditCourse } from "@/server/courses/access";
import {
  cancelSession,
  checkInWithQr,
  CheckInError,
  createSession,
  currentQr,
  joinOnline,
  setAttendance,
  updateSession,
  type SessionInput,
} from "@/server/tracking/sessions";
import type { FormState } from "@/lib/form-state";

async function actor() {
  const { user } = await requireUser();
  return { id: user.id, roles: user.roles };
}
const teach = (courseId: string) => `/teach/courses/${courseId}`;

// ---------------------------------------------------------------------------
// At-risk
// ---------------------------------------------------------------------------

export async function saveRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  try {
    await saveRule(
      await actor(),
      courseId,
      z.enum(["INACTIVE_DAYS", "MISSED_DEADLINE", "SCORE_BELOW"]).parse(formData.get("type")),
      Number(formData.get("threshold")),
      formData.get("active") === "on",
    );
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}`, "layout");
  return { ok: true, message: "Saved." };
}

export async function recheckAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  if (!(await canEditCourse(await actor(), courseId))) return;
  await evaluateCourse(courseId);
  revalidatePath(`${teach(courseId)}`, "layout");
}

export async function dismissFlagAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await dismissFlag(await actor(), String(formData.get("flagId")), String(formData.get("note") ?? ""));
  revalidatePath(`${teach(courseId)}`, "layout");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function sessionInput(formData: FormData): SessionInput {
  const date = String(formData.get("date") ?? "");
  // SA has no daylight saving: +02:00 all year.
  const at = (time: string) => new Date(`${date}T${time || "00:00"}:00+02:00`);
  return {
    title: String(formData.get("title") ?? "").slice(0, 160),
    description: String(formData.get("description") ?? "").slice(0, 2000),
    mode: z.enum(["IN_PERSON", "ONLINE", "HYBRID"]).parse(formData.get("mode")),
    startsAt: at(String(formData.get("start") ?? "")),
    endsAt: at(String(formData.get("end") ?? "")),
    location: String(formData.get("location") ?? "").slice(0, 200) || null,
    meetingUrl: String(formData.get("meetingUrl") ?? "").trim() || null,
    trainerId: null,
  };
}

export async function createSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  let id: string;
  try {
    id = (await createSession(await actor(), courseId, sessionInput(formData))).id;
  } catch (err) {
    return { error: friendly(err) };
  }
  redirect(`${teach(courseId)}/sessions/${id}`);
}

export async function updateSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId"));
  const sessionId = String(formData.get("sessionId"));
  try {
    const input = sessionInput(formData);
    await updateSession(await actor(), sessionId, input);
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(`${teach(courseId)}/sessions`, "layout");
  return { ok: true, message: "Session updated." };
}

export async function cancelSessionAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  await cancelSession(await actor(), String(formData.get("sessionId")));
  revalidatePath(`${teach(courseId)}/sessions`, "layout");
}

export async function setAttendanceAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId"));
  const sessionId = String(formData.get("sessionId"));
  await setAttendance(
    await actor(),
    sessionId,
    String(formData.get("userId")),
    z.enum(["PRESENT", "ABSENT", "EXCUSED"]).parse(formData.get("status")),
    String(formData.get("note") ?? "").slice(0, 300) || null,
  );
  revalidatePath(`${teach(courseId)}/sessions/${sessionId}`);
}

/** Polled by the presenter screen for the next rotating code. */
export async function currentQrAction(sessionId: string) {
  return currentQr(await actor(), String(sessionId));
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

export async function checkInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  try {
    await checkInWithQr(user.id, String(formData.get("sessionId")), String(formData.get("token") ?? ""));
  } catch (err) {
    if (err instanceof CheckInError) return { error: err.message };
    return { error: friendly(err) };
  }
  revalidatePath("/dashboard");
  return { ok: true, message: "You're checked in." };
}

export async function joinSessionAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const url = await joinOnline(user.id, String(formData.get("sessionId")));
  redirect(url);
}
