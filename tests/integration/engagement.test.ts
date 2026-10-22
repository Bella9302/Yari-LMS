import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import {
  addItem,
  createCourse,
  enrolLearners,
  setCourseStatus,
  updateItem,
  addCourseStaff,
} from "@/server/courses/builder";
import { completeItem } from "@/server/courses/learner";
import { postAnnouncement } from "@/server/engagement/announcements";
import * as email from "@/server/email/send";
import {
  createThread,
  deletePost,
  getThread,
  listThreads,
  moderateThread,
  reply,
} from "@/server/engagement/discussions";
import {
  adminRatings,
  pendingRatings,
  submitRating,
  trainerSummary,
  MIN_RESPONSES,
} from "@/server/engagement/ratings";
import { badgesFor } from "@/server/engagement/badges";
import { calendarEvents } from "@/server/engagement/calendar";
import { checkInWithQr, createSession, qrToken, QR_WINDOW_MS } from "@/server/tracking/sessions";
import { AssessmentError } from "@/server/assessment/errors";
import { PermissionError } from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, trainer: U, coTrainer: U, learners: U[], outsider: U;
const doc = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});
const scores = { knowledge: 5, clarity: 4, relevance: 5, engagement: 4 };

async function liveCourse(title = "Engaged course") {
  const course = await createCourse(trainer, { title, category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const item = await addItem(trainer, mod.id, "RICH_TEXT", "Only item");
  await updateItem(trainer, item.id, {
    title: "Only item",
    required: true,
    published: true,
    estMinutes: null,
    body: doc("Hi"),
  });
  await setCourseStatus(trainer, course.id, "PUBLISHED");
  await enrolLearners(
    admin,
    course.id,
    learners.map((l) => l.id),
  );
  return { course, item };
}

beforeAll(async () => {
  const org = await createOrg();
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }], fullName: "Tumi Trainer" });
  coTrainer = await createUser({ roles: [{ role: "TRAINER" }], fullName: "Zola Cotrainer" });
  learners = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      createUser({ roles: [{ role: "LEARNER" }], memberOf: [org.id], fullName: `Learner Number${i}` }),
    ),
  );
  outsider = await createUser({ roles: [{ role: "LEARNER" }] });
});

describe("announcements", () => {
  it("still posts and notifies when the email provider fails", async () => {
    const { course } = await liveCourse();
    const spy = vi.spyOn(email, "sendEmailBatch").mockRejectedValueOnce(new Error("provider down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const a = await postAnnouncement(trainer, course.id, {
      title: "Provider outage",
      body: doc("Still delivered in the app."),
      pinned: false,
      email: true,
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(a).toMatchObject({ emailed: false, emailFailed: true });
    expect((await db.announcement.findUniqueOrThrow({ where: { id: a.id } })).emailed).toBe(false);
    expect(
      await db.notification.count({
        where: { userId: learners[0]!.id, title: { endsWith: "Provider outage" } },
      }),
    ).toBe(1);
    spy.mockRestore();
  });

  it("notifies the course's learners and staff, not others", async () => {
    const { course } = await liveCourse();
    await postAnnouncement(trainer, course.id, {
      title: "Venue change",
      body: doc("Gate 5 tomorrow."),
      pinned: true,
      email: true,
    });
    expect(
      await db.notification.count({ where: { userId: learners[0]!.id, type: "ANNOUNCEMENT" } }),
    ).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { userId: outsider.id } })).toBe(0);
    await expect(
      postAnnouncement(learners[0]!, course.id, {
        title: "Hi all",
        body: doc("x"),
        pinned: false,
        email: false,
      }),
    ).rejects.toThrow();
    await expect(
      postAnnouncement(trainer, null, { title: "Platform", body: doc("x"), pinned: false, email: false }),
    ).rejects.toThrow(PermissionError);
    await expect(
      postAnnouncement(admin, null, {
        title: "Platform notice",
        body: doc("Maintenance Sunday."),
        pinned: false,
        email: false,
      }),
    ).resolves.toBeTruthy();
  });
});

describe("discussions", () => {
  it("lets learners talk, shows short names to learners and full names to trainers, and supports moderation", async () => {
    const { course } = await liveCourse("Discussed course");
    const thread = await createThread(
      learners[0]!,
      course.id,
      "Ladder footing question",
      "Do we need a spotter?",
    );
    await reply(learners[1]!, thread.id, "Yes, always.");
    expect(
      await db.notification.count({ where: { userId: learners[0]!.id, type: "DISCUSSION_REPLY" } }),
    ).toBe(1);
    expect(
      await db.notification.count({ where: { userId: trainer.id, type: "DISCUSSION_THREAD" } }),
    ).toBeGreaterThan(0);

    const asLearner = (await getThread(learners[2]!, thread.id))!;
    expect(asLearner.posts.map((p) => p.author.name)).toEqual(["Learner N.", "Learner N."]);
    const asTrainer = (await getThread(trainer, thread.id))!;
    expect(asTrainer.posts[0]!.author.name).toBe("Learner Number0");
    expect(await getThread(outsider, thread.id)).toBeNull();
    expect(await listThreads(outsider, course.slug)).toBeNull();

    await moderateThread(trainer, thread.id, { locked: true });
    await expect(reply(learners[2]!, thread.id, "Late reply")).rejects.toThrow(AssessmentError);
    await reply(trainer, thread.id, "Locking this — answered.");
    await expect(deletePost(learners[2]!, asLearner.posts[0]!.id)).rejects.toThrow();
    await deletePost(trainer, asLearner.posts[1]!.id);
    expect((await getThread(learners[0]!, thread.id))!.posts[1]!.body).toBeNull();
    await expect(moderateThread(learners[0]!, thread.id, { pinned: true })).rejects.toThrow();
  });
});

describe("trainer ratings", () => {
  it("opens ratings after completion, keeps trainers' view anonymous until enough responses, and gives admins detail", async () => {
    const { course, item } = await liveCourse("Rated course");
    await addCourseStaff(trainer, course.id, coTrainer.id);
    expect(await pendingRatings(learners[0]!.id)).toEqual([]); // not completed yet

    for (const l of learners.slice(0, MIN_RESPONSES - 1)) await completeItem(l.id, item.id);
    const pending = await pendingRatings(learners[0]!.id);
    expect(pending.map((p) => p.trainerName).sort()).toEqual(["Tumi Trainer", "Zola Cotrainer"]);
    for (const l of learners.slice(0, MIN_RESPONSES - 1)) {
      await submitRating(l, {
        trainerId: coTrainer.id,
        courseId: course.id,
        sessionId: null,
        scores,
        comment: "Very practical",
      });
    }
    await expect(
      submitRating(learners[0]!, {
        trainerId: coTrainer.id,
        courseId: course.id,
        sessionId: null,
        scores,
        comment: "",
      }),
    ).rejects.toThrow(/already/);
    await expect(
      submitRating(outsider, {
        trainerId: coTrainer.id,
        courseId: course.id,
        sessionId: null,
        scores,
        comment: "",
      }),
    ).rejects.toThrow();

    expect(await trainerSummary(coTrainer.id)).toMatchObject({ enough: false, count: MIN_RESPONSES - 1 });
    const last = learners[MIN_RESPONSES - 1]!;
    await completeItem(last.id, item.id);
    await submitRating(last, {
      trainerId: coTrainer.id,
      courseId: course.id,
      sessionId: null,
      scores: { knowledge: 3, clarity: 3, relevance: 3, engagement: 3 },
      comment: "",
    });
    const summary = await trainerSummary(coTrainer.id);
    expect(summary).toMatchObject({ enough: true, count: MIN_RESPONSES });
    if (summary.enough) {
      expect(JSON.stringify(summary)).not.toMatch(/Learner Number/); // never names
      expect(summary.comments).toEqual(["Very practical", "Very practical"]);
    }

    await expect(adminRatings(trainer)).rejects.toThrow(PermissionError);
    const detail = await adminRatings(admin, coTrainer.id);
    expect(detail.map((d) => d.rater)).toContain("Learner Number0");
  });

  it("lets attendees rate a session's trainer once the session ends", async () => {
    const { course } = await liveCourse("Session course");
    const start = new Date(Date.now() - 2 * 3600_000);
    const s = await createSession(trainer, course.id, {
      title: "Practical",
      description: "",
      mode: "IN_PERSON",
      startsAt: start,
      endsAt: new Date(Date.now() - 600_000),
      location: "Site",
      meetingUrl: null,
      trainerId: null,
    });
    const now = Date.now();
    await checkInWithQr(
      learners[0]!.id,
      s.id,
      qrToken(s.qrSecret, s.id, Math.floor(now / QR_WINDOW_MS)),
      now,
    );
    const pending = await pendingRatings(learners[0]!.id);
    expect(pending.some((p) => p.sessionId === s.id && p.trainerId === trainer.id)).toBe(true);
    expect((await pendingRatings(learners[1]!.id)).some((p) => p.sessionId === s.id)).toBe(false); // didn't attend
  });
});

describe("badges and calendar", () => {
  it("awards badges when a course is completed", async () => {
    const fresh = await createUser({ roles: [{ role: "LEARNER" }] });
    const course = await createCourse(trainer, { title: "Badge course", category: "AI_DIGITAL" });
    const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
    const item = await addItem(trainer, mod.id, "RICH_TEXT", "Item");
    await updateItem(trainer, item.id, {
      title: "Item",
      required: true,
      published: true,
      estMinutes: null,
      body: doc("x"),
    });
    await setCourseStatus(trainer, course.id, "PUBLISHED");
    await enrolLearners(admin, course.id, [fresh.id], { dueAt: new Date(Date.now() + 86_400_000) });
    await completeItem(fresh.id, item.id);
    const badges = (await badgesFor(fresh.id)).map((b) => b.badge).sort();
    expect(badges).toEqual(["COURSE_COMPLETE", "FIRST_STEP", "ON_TIME"]);
    await completeItem(fresh.id, item.id); // idempotent
    expect(await badgesFor(fresh.id)).toHaveLength(3);
    expect(await db.notification.count({ where: { userId: fresh.id, type: "BADGE" } })).toBe(3);
  });

  it("shows sessions and due dates for a learner's courses only", async () => {
    const { course } = await liveCourse("Calendar course");
    const start = new Date(Date.now() + 2 * 86_400_000);
    await createSession(trainer, course.id, {
      title: "Calendar practical",
      description: "",
      mode: "IN_PERSON",
      startsAt: start,
      endsAt: new Date(start.getTime() + 3600_000),
      location: "Site",
      meetingUrl: null,
      trainerId: null,
    });
    const range = [new Date(), new Date(Date.now() + 7 * 86_400_000)] as const;
    const mine = await calendarEvents(learners[0]!, ...range);
    expect(mine.some((e) => e.title === "Calendar practical")).toBe(true);
    expect((await calendarEvents(outsider, ...range)).some((e) => e.title === "Calendar practical")).toBe(
      false,
    );
  });
});
