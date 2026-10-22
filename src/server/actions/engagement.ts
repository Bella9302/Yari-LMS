"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guards";
import { friendly } from "@/server/actions/errors";
import { deleteAnnouncement, postAnnouncement } from "@/server/engagement/announcements";
import { createThread, deletePost, editPost, moderateThread, reply } from "@/server/engagement/discussions";
import { markRead } from "@/server/engagement/notifications";
import { CRITERIA, submitRating } from "@/server/engagement/ratings";
import type { FormState } from "@/lib/form-state";

async function actor() {
  const { user } = await requireUser();
  return { id: user.id, roles: user.roles };
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function postAnnouncementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const courseId = String(formData.get("courseId") ?? "") || null;
  let body: unknown;
  try {
    body = JSON.parse(String(formData.get("body") ?? "{}"));
  } catch {
    return { error: "Couldn't read the announcement. Try again." };
  }
  try {
    const a = await postAnnouncement(await actor(), courseId, {
      title: String(formData.get("title") ?? ""),
      body,
      pinned: formData.get("pinned") === "on",
      email: formData.get("email") === "on",
    });
    revalidatePath(courseId ? `/teach/courses/${courseId}/announcements` : "/admin/announcements");
    const who = `${a.recipients} ${a.recipients === 1 ? "person" : "people"}`;
    return a.emailFailed
      ? { ok: true, message: `Posted to ${who}, but the email could not be sent. They'll still see it here.` }
      : { ok: true, message: `Posted to ${who}${a.emailed ? " and emailed" : ""}.` };
  } catch (err) {
    return { error: friendly(err) };
  }
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  await deleteAnnouncement(await actor(), String(formData.get("id")));
  revalidatePath(String(formData.get("back") ?? "/"));
}

// ---------------------------------------------------------------------------
// Discussions
// ---------------------------------------------------------------------------

export async function createThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug"));
  let id: string;
  try {
    id = (
      await createThread(
        await actor(),
        String(formData.get("courseId")),
        String(formData.get("title") ?? ""),
        String(formData.get("body") ?? ""),
      )
    ).id;
  } catch (err) {
    return {
      error: friendly(err),
      values: { title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? "") },
    };
  }
  redirect(`/learn/${slug}/discussions/${id}`);
}

export async function replyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug"));
  const threadId = String(formData.get("threadId"));
  try {
    await reply(await actor(), threadId, String(formData.get("body") ?? ""));
  } catch (err) {
    return { error: friendly(err), values: { body: String(formData.get("body") ?? "") } };
  }
  revalidatePath(`/learn/${slug}/discussions/${threadId}`);
  return { ok: true };
}

export async function editPostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const path = String(formData.get("back"));
  try {
    await editPost(await actor(), String(formData.get("postId")), String(formData.get("body") ?? ""));
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath(path);
  return { ok: true };
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await deletePost(await actor(), String(formData.get("postId")));
  revalidatePath(String(formData.get("back")));
}

export async function moderateThreadAction(formData: FormData): Promise<void> {
  const change: { pinned?: boolean; locked?: boolean } = {};
  if (formData.has("pinned")) change.pinned = formData.get("pinned") === "true";
  if (formData.has("locked")) change.locked = formData.get("locked") === "true";
  await moderateThread(await actor(), String(formData.get("threadId")), change);
  revalidatePath(String(formData.get("back")));
}

// ---------------------------------------------------------------------------
// Ratings & notifications
// ---------------------------------------------------------------------------

export async function submitRatingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, Number(formData.get(c))])) as Record<
    (typeof CRITERIA)[number],
    number
  >;
  try {
    await submitRating(await actor(), {
      trainerId: String(formData.get("trainerId")),
      courseId: String(formData.get("courseId")),
      sessionId: String(formData.get("sessionId") ?? "") || null,
      scores,
      comment: String(formData.get("comment") ?? ""),
    });
  } catch (err) {
    return { error: friendly(err) };
  }
  revalidatePath("/dashboard");
  // The rated item drops off the list, so the thanks is shown by the page rather than the form.
  redirect("/ratings?thanks=1");
}

export async function markAllReadAction(): Promise<void> {
  const { user } = await requireUser();
  await markRead(user.id);
  revalidatePath("/", "layout");
}
