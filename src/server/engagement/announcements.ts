import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { isSuperAdmin } from "@/server/rbac";
import { assertCanEditCourse, NotFoundError } from "@/server/courses/access";
import { dec } from "@/server/pii/fields";
import { PermissionError, type Actor } from "@/server/pii/users";
import { AssessmentError } from "@/server/assessment/errors";
import { sendEmailBatch } from "@/server/email/send";
import { escapeHtml } from "@/server/email/templates";
import { notify } from "@/server/engagement/notifications";
import { sanitizeRichText, type RichNode } from "@/lib/rich-text";

export interface AnnouncementInput {
  title: string;
  body: unknown;
  pinned: boolean;
  email: boolean;
}

/** Plain text of a rich-text document, for emails. */
export function richTextToPlain(doc: RichNode): string {
  const walk = (n: RichNode): string => {
    if (n.type === "text") return n.text ?? "";
    if (n.type === "hardBreak") return "\n";
    const inner = (n.content ?? []).map(walk).join("");
    if (n.type === "listItem") return `• ${inner}\n`;
    if (["paragraph", "heading", "blockquote"].includes(n.type)) return `${inner}\n\n`;
    return inner;
  };
  return walk(doc)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Who receives an announcement: course learners and staff, or every active user. */
async function recipients(scope: "PLATFORM" | "COURSE", courseId: string | null) {
  return db.user.findMany({
    where:
      scope === "PLATFORM"
        ? { status: "ACTIVE" }
        : {
            status: "ACTIVE",
            OR: [
              { enrolments: { some: { courseId: courseId!, status: { not: "WITHDRAWN" } } } },
              { courseStaff: { some: { courseId: courseId! } } },
            ],
          },
    select: { id: true, emailEnc: true },
  });
}

export async function postAnnouncement(actor: Actor, courseId: string | null, input: AnnouncementInput) {
  if (courseId) await assertCanEditCourse(actor, courseId);
  else if (!isSuperAdmin(actor.roles)) throw new PermissionError();
  const title = input.title.trim();
  if (title.length < 3) throw new AssessmentError("Give the announcement a title.");
  if (title.length > 160) throw new AssessmentError("Keep the title under 160 characters.");
  const body = sanitizeRichText(input.body);
  const text = richTextToPlain(body);
  if (!text) throw new AssessmentError("Write the announcement.");

  const course = courseId
    ? await db.course.findUnique({
        where: { id: courseId },
        select: { title: true, slug: true, status: true },
      })
    : null;
  if (courseId && !course) throw new NotFoundError("Course not found");
  const scope = courseId ? "COURSE" : "PLATFORM";
  const people = (await recipients(scope, courseId)).filter((p) => p.id !== actor.id);
  const href = course ? `/learn/${course.slug}/announcements` : "/announcements";

  const announcement = await db.announcement.create({
    data: {
      scope,
      courseId,
      authorId: actor.id,
      title,
      body: body as unknown as Prisma.InputJsonValue,
      pinned: input.pinned,
      emailed: false,
      recipients: people.length,
    },
  });
  await notify(
    people.map((p) => p.id),
    { type: "ANNOUNCEMENT", title: course ? `${course.title}: ${title}` : title, href },
  );

  // Course announcements only email once the course is live; drafts stay quiet.
  // Email is best effort: the announcement and in-app notifications stand even if sending fails.
  let emailed = false;
  let emailFailed = false;
  if (input.email && (!course || course.status === "PUBLISHED")) {
    const url = `${env().APP_URL}${href}`;
    const subject = course ? `${course.title}: ${title}` : title;
    try {
      await sendEmailBatch(
        people.map((p) => ({
          to: dec.email(p.id, p.emailEnc),
          subject,
          text: `${text}\n\nRead it on YARI Academy: ${url}`,
          html: `<h2 style="font-family:Georgia,serif;font-weight:normal">${escapeHtml(title)}</h2>${text
            .split("\n\n")
            .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
            .join("")}<p><a href="${url}">Read it on YARI Academy</a></p>`,
        })),
      );
      emailed = true;
      await db.announcement.update({ where: { id: announcement.id }, data: { emailed } });
    } catch (err) {
      emailFailed = true;
      console.error("[announcement] email failed", announcement.id, err);
    }
  }
  await audit({
    actorId: actor.id,
    action: "announcement.posted",
    entityType: "Announcement",
    entityId: announcement.id,
    meta: { scope, recipients: people.length, emailed, emailFailed },
  });
  return { ...announcement, emailed, emailFailed };
}

export async function deleteAnnouncement(actor: Actor, id: string) {
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a) return;
  if (a.courseId) await assertCanEditCourse(actor, a.courseId);
  else if (!isSuperAdmin(actor.roles)) throw new PermissionError();
  await db.announcement.delete({ where: { id } });
}

export function courseAnnouncements(courseId: string, take = 50) {
  return db.announcement.findMany({
    where: { courseId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take,
    include: { author: { select: { id: true, profile: { select: { fullNameEnc: true } } } } },
  });
}

export function platformAnnouncements(take = 50) {
  return db.announcement.findMany({
    where: { scope: "PLATFORM" },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take,
    include: { author: { select: { id: true, profile: { select: { fullNameEnc: true } } } } },
  });
}

/** Latest announcements across the user's courses and the platform, for the dashboard. */
export async function latestForUser(userId: string, take = 3) {
  return db.announcement.findMany({
    where: {
      OR: [
        { scope: "PLATFORM" },
        {
          course: {
            status: { in: ["PUBLISHED", "ARCHIVED"] },
            enrolments: { some: { userId, status: { not: "WITHDRAWN" } } },
          },
        },
        { course: { staff: { some: { userId } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { course: { select: { title: true, slug: true, category: true } } },
  });
}

export function authorName(a: { author: { id: string; profile: { fullNameEnc: string } | null } | null }) {
  return a.author?.profile ? dec.fullName(a.author.id, a.author.profile.fullNameEnc) : "YARI Academy";
}
