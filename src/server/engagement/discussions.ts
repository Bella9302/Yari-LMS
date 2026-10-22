import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { canEditCourse, NotFoundError } from "@/server/courses/access";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { dec } from "@/server/pii/fields";
import type { Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { notify } from "@/server/engagement/notifications";
import { shortName } from "@/lib/display-name";

const MAX_BODY = 10_000;

export interface BoardAccess {
  course: { id: string; title: string; slug: string; category: "HEALTH_SAFETY" | "AI_DIGITAL" };
  isStaff: boolean;
  canPost: boolean;
}

/** Staff of the course, or enrolled learners on a live course. Archived courses are read-only. */
export async function boardAccess(actor: Actor, slug: string): Promise<BoardAccess | null> {
  const course = await db.course.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true, category: true, status: true, isTemplate: true },
  });
  if (!course || course.isTemplate) return null;
  if (await canEditCourse(actor, course.id))
    return { course, isStaff: true, canPost: course.status !== "ARCHIVED" };
  const enrolment = await db.enrolment.findUnique({
    where: { userId_courseId: { userId: actor.id, courseId: course.id } },
  });
  if (!enrolment || enrolment.status === "WITHDRAWN" || !["PUBLISHED", "ARCHIVED"].includes(course.status))
    return null;
  return { course, isStaff: false, canPost: course.status === "PUBLISHED" };
}

async function access(actor: Actor, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { slug: true } });
  const a = course ? await boardAccess(actor, course.slug) : null;
  if (!a) throw new NotFoundError("Discussion not found");
  return a;
}

/** Names as the viewer may see them: staff see full names; learners see "First L." for other learners. */
async function nameResolver(courseId: string, viewer: Actor, isStaffViewer: boolean) {
  const staffIds = new Set(
    (await db.courseStaff.findMany({ where: { courseId }, select: { userId: true } })).map((s) => s.userId),
  );
  return (author: { id: string; profile: { fullNameEnc: string } | null } | null) => {
    if (!author) return { name: "Former member", staff: false, self: false };
    const full = author.profile ? dec.fullName(author.id, author.profile.fullNameEnc) : "";
    const staff = staffIds.has(author.id);
    return { name: staff || isStaffViewer ? full : shortName(full), staff, self: author.id === viewer.id };
  };
}

const authorSelect = { select: { id: true, profile: { select: { fullNameEnc: true } } } } as const;

export async function listThreads(actor: Actor, slug: string) {
  const a = await boardAccess(actor, slug);
  if (!a) return null;
  const threads = await db.discussionThread.findMany({
    where: { courseId: a.course.id },
    orderBy: [{ pinned: "desc" }, { lastPostAt: "desc" }],
    take: 200,
    include: { author: authorSelect, _count: { select: { posts: { where: { deletedAt: null } } } } },
  });
  const resolve = await nameResolver(a.course.id, actor, a.isStaff);
  return {
    access: a,
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      pinned: t.pinned,
      locked: t.locked,
      lastPostAt: t.lastPostAt,
      replies: Math.max(0, t._count.posts - 1),
      author: resolve(t.author),
    })),
  };
}

async function guardPosting(actor: Actor, body: string) {
  const text = body.trim();
  if (!text) throw new AssessmentError("Write something first.");
  if (text.length > MAX_BODY) throw new AssessmentError("Keep posts under 10,000 characters.");
  if (!(await consumeRateLimit(`post:${actor.id}`, 20, 10 * 60_000))) {
    throw new AssessmentError("You're posting very quickly. Please wait a few minutes.");
  }
  return text;
}

export async function createThread(actor: Actor, courseId: string, title: string, body: string) {
  const a = await access(actor, courseId);
  if (!a.canPost) throw new AssessmentError("This discussion is closed.");
  const t = title.trim();
  if (t.length < 3 || t.length > 160)
    throw new AssessmentError("Give your topic a title (3–160 characters).");
  const text = await guardPosting(actor, body);
  const thread = await db.discussionThread.create({
    data: { courseId, authorId: actor.id, title: t, posts: { create: { authorId: actor.id, body: text } } },
  });
  const staff = await db.courseStaff.findMany({ where: { courseId }, select: { userId: true } });
  await notify(
    staff.map((s) => s.userId).filter((id) => id !== actor.id),
    {
      type: "DISCUSSION_THREAD",
      title: `New discussion in ${a.course.title}: ${t}`,
      href: `/learn/${a.course.slug}/discussions/${thread.id}`,
    },
  );
  return thread;
}

export async function getThread(actor: Actor, threadId: string) {
  const thread = await db.discussionThread.findUnique({
    where: { id: threadId },
    include: { posts: { orderBy: { createdAt: "asc" }, include: { author: authorSelect } } },
  });
  if (!thread) return null;
  const a = await access(actor, thread.courseId).catch(() => null);
  if (!a) return null;
  const resolve = await nameResolver(thread.courseId, actor, a.isStaff);
  return {
    access: a,
    thread: { id: thread.id, title: thread.title, pinned: thread.pinned, locked: thread.locked },
    posts: thread.posts.map((p) => ({
      id: p.id,
      body: p.deletedAt ? null : p.body,
      deleted: Boolean(p.deletedAt),
      editedAt: p.editedAt,
      createdAt: p.createdAt,
      author: resolve(p.author),
      canEdit: !p.deletedAt && p.authorId === actor.id && a.canPost,
      canDelete: !p.deletedAt && (p.authorId === actor.id || a.isStaff),
    })),
  };
}

export async function reply(actor: Actor, threadId: string, body: string) {
  const thread = await db.discussionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new NotFoundError("Discussion not found");
  const a = await access(actor, thread.courseId);
  if (!a.canPost) throw new AssessmentError("This discussion is closed.");
  if (thread.locked && !a.isStaff) throw new AssessmentError("This topic is locked.");
  const text = await guardPosting(actor, body);
  const now = new Date();
  await db.$transaction([
    db.discussionPost.create({ data: { threadId, authorId: actor.id, body: text, createdAt: now } }),
    db.discussionThread.update({ where: { id: threadId }, data: { lastPostAt: now } }),
  ]);
  // Everyone who has taken part hears about replies (not the person replying).
  const participants = await db.discussionPost.findMany({
    where: { threadId, deletedAt: null },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  await notify(
    [thread.authorId, ...participants.map((p) => p.authorId)].filter(
      (id): id is string => Boolean(id) && id !== actor.id,
    ),
    {
      type: "DISCUSSION_REPLY",
      title: `New reply: ${thread.title}`,
      href: `/learn/${a.course.slug}/discussions/${threadId}`,
    },
  );
}

export async function editPost(actor: Actor, postId: string, body: string) {
  const post = await db.discussionPost.findUnique({ where: { id: postId }, include: { thread: true } });
  if (!post || post.deletedAt || post.authorId !== actor.id) throw new NotFoundError("Post not found");
  const a = await access(actor, post.thread.courseId);
  if (!a.canPost) throw new AssessmentError("This discussion is closed.");
  const text = await guardPosting(actor, body);
  await db.discussionPost.update({ where: { id: postId }, data: { body: text, editedAt: new Date() } });
}

export async function deletePost(actor: Actor, postId: string) {
  const post = await db.discussionPost.findUnique({ where: { id: postId }, include: { thread: true } });
  if (!post || post.deletedAt) return;
  const a = await access(actor, post.thread.courseId);
  if (post.authorId !== actor.id && !a.isStaff) throw new NotFoundError("Post not found");
  await db.discussionPost.update({
    where: { id: postId },
    data: { deletedAt: new Date(), deletedById: actor.id },
  });
  if (post.authorId !== actor.id) {
    await audit({
      actorId: actor.id,
      action: "discussion.moderated",
      entityType: "DiscussionPost",
      entityId: postId,
      meta: { action: "removed" },
    });
  }
}

export async function moderateThread(
  actor: Actor,
  threadId: string,
  change: { pinned?: boolean; locked?: boolean },
) {
  const thread = await db.discussionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new NotFoundError("Discussion not found");
  const a = await access(actor, thread.courseId);
  if (!a.isStaff) throw new NotFoundError("Discussion not found");
  await db.discussionThread.update({ where: { id: threadId }, data: change });
  await audit({
    actorId: actor.id,
    action: "discussion.moderated",
    entityType: "DiscussionThread",
    entityId: threadId,
    meta: change,
  });
}
