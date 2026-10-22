import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addItem, createCourse, enrolLearners, setCourseStatus, updateItem } from "@/server/courses/builder";
import { recordItemView } from "@/server/courses/learner";
import { recordActiveTime } from "@/server/tracking/activity";
import { dismissFlag, evaluateCourse, saveRule } from "@/server/tracking/at-risk";
import {
  checkInWithQr,
  createSession,
  CheckInError,
  getRegister,
  joinOnline,
  qrToken,
  QR_WINDOW_MS,
  setAttendance,
} from "@/server/tracking/sessions";
import { getCompanyOverview, getStaffTraining, getComplianceRows } from "@/server/tracking/company";
import { getCourseProgress } from "@/server/tracking/progress";
import { PermissionError } from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, trainer: U, learner: U, outsider: U, managerA: U, managerB: U;
let orgA: { id: string }, orgB: { id: string };
const DAY = 86_400_000;

async function liveCourse() {
  const course = await createCourse(trainer, { title: "Tracked course", category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const item = await addItem(trainer, mod.id, "RICH_TEXT", "Reading");
  await updateItem(trainer, item.id, {
    title: "Reading",
    required: true,
    published: true,
    estMinutes: null,
    body: { type: "doc", content: [] },
  });
  await setCourseStatus(trainer, course.id, "PUBLISHED");
  await enrolLearners(admin, course.id, [learner.id], { organizationId: orgA.id });
  return { course, item };
}

beforeAll(async () => {
  orgA = await createOrg();
  orgB = await createOrg();
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }] });
  learner = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgA.id] });
  outsider = await createUser({ roles: [{ role: "LEARNER" }] });
  managerA = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgA.id }] });
  managerB = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgB.id }] });
});

describe("time on task", () => {
  it("adds capped time only for opened items, and never more than wall-clock time", async () => {
    const { course, item } = await liveCourse();
    expect((await recordActiveTime(learner.id, item.id, 30)).added).toBe(0); // never opened
    await recordItemView(learner.id, item.id);
    const p = await db.itemProgress.findFirstOrThrow({ where: { itemId: item.id } });
    const t = p.lastViewedAt!.getTime();
    expect((await recordActiveTime(learner.id, item.id, 30, new Date(t + 31_000))).added).toBe(30);
    // A tampered client claiming 600 s, 10 s after the last beat, gets about 10 s.
    expect((await recordActiveTime(learner.id, item.id, 600, new Date(t + 41_000))).added).toBe(12);
    expect((await recordActiveTime(outsider.id, item.id, 30)).added).toBe(0);
    const rows = await getCourseProgress(trainer, course.id);
    expect(rows[0]).toMatchObject({ viewed: 1, total: 1, timeSpentSec: 42 });
  });
});

describe("at-risk alerts", () => {
  it("raises, updates, clears and respects dismissals", async () => {
    const { course } = await liveCourse();
    const enrolment = await db.enrolment.findFirstOrThrow({ where: { courseId: course.id } });
    await db.enrolment.update({
      where: { id: enrolment.id },
      data: { createdAt: new Date(Date.now() - 10 * DAY) },
    });

    await saveRule(trainer, course.id, "INACTIVE_DAYS", 7, true); // evaluates immediately
    let open = await db.atRiskFlag.findMany({ where: { enrolmentId: enrolment.id, resolvedAt: null } });
    expect(open).toHaveLength(1);
    expect(open[0]!.reason).toMatch(/Hasn't started/);
    expect((await evaluateCourse(course.id)).raised).toBe(0); // no duplicates

    await db.enrolment.update({ where: { id: enrolment.id }, data: { lastActiveAt: new Date() } });
    expect((await evaluateCourse(course.id)).cleared).toBe(1);

    await db.enrolment.update({
      where: { id: enrolment.id },
      data: { lastActiveAt: new Date(Date.now() - 9 * DAY) },
    });
    await evaluateCourse(course.id);
    open = await db.atRiskFlag.findMany({ where: { enrolmentId: enrolment.id, resolvedAt: null } });
    await dismissFlag(trainer, open[0]!.id, "Spoke to them — on leave");
    expect((await evaluateCourse(course.id)).raised).toBe(0); // dismissed recently
    expect((await getCourseProgress(trainer, course.id))[0]!.flags).toHaveLength(0);

    await saveRule(trainer, course.id, "INACTIVE_DAYS", 7, false);
    await expect(saveRule(outsider, course.id, "SCORE_BELOW", 50, true)).rejects.toThrow();
  });
});

describe("sessions and attendance", () => {
  async function session(mode: "IN_PERSON" | "ONLINE", startsInMin = 0) {
    const { course } = await liveCourse();
    const start = new Date(Date.now() + startsInMin * 60_000);
    const s = await createSession(trainer, course.id, {
      title: "Practical day",
      description: "",
      mode,
      startsAt: start,
      endsAt: new Date(start.getTime() + 2 * 3600_000),
      location: mode === "IN_PERSON" ? "Acme site, Gate 3" : null,
      meetingUrl: mode === "ONLINE" ? "https://meet.example.com/abc" : null,
      trainerId: null,
    });
    return { course, s };
  }

  it("checks in with a fresh QR code only, once, and only for enrolled learners", async () => {
    const { s } = await session("IN_PERSON");
    const now = Date.now();
    const w = Math.floor(now / QR_WINDOW_MS);
    await expect(checkInWithQr(learner.id, s.id, qrToken(s.qrSecret, s.id, w - 3), now)).rejects.toThrow(
      /expired/,
    );
    await checkInWithQr(learner.id, s.id, qrToken(s.qrSecret, s.id, w), now);
    await checkInWithQr(learner.id, s.id, qrToken(s.qrSecret, s.id, w), now); // idempotent
    await expect(checkInWithQr(outsider.id, s.id, qrToken(s.qrSecret, s.id, w), now)).rejects.toThrow(
      CheckInError,
    );
    const register = await getRegister(trainer, s.id);
    expect(register.rows).toEqual([
      expect.objectContaining({ userId: learner.id, status: "PRESENT", method: "QR" }),
    ]);
  });

  it("refuses check-in outside the session window", async () => {
    const { s } = await session("IN_PERSON", 24 * 60);
    const w = Math.floor(Date.now() / QR_WINDOW_MS);
    await expect(checkInWithQr(learner.id, s.id, qrToken(s.qrSecret, s.id, w))).rejects.toThrow(/isn't open/);
  });

  it("records online joins and manual corrections", async () => {
    const { s } = await session("ONLINE");
    expect(await joinOnline(learner.id, s.id)).toBe("https://meet.example.com/abc");
    await setAttendance(trainer, s.id, learner.id, "EXCUSED", "Left early — family emergency");
    const r = await db.attendance.findFirstOrThrow({ where: { sessionId: s.id } });
    expect(r).toMatchObject({
      status: "EXCUSED",
      method: "ONLINE_JOIN",
      note: "Left early — family emergency",
    });
  });

  it("rejects online sessions without an https link", async () => {
    const { course } = await liveCourse();
    await expect(
      createSession(trainer, course.id, {
        title: "x",
        description: "",
        mode: "ONLINE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 1000),
        location: null,
        meetingUrl: "http://insecure",
        trainerId: null,
      }),
    ).rejects.toThrow(/meeting link/);
  });
});

describe("company dashboard", () => {
  it("shows a company only its own staff's training", async () => {
    const { course } = await liveCourse();
    await db.enrolment.updateMany({
      where: { courseId: course.id },
      data: { dueAt: new Date(Date.now() - DAY) },
    });
    const overview = await getCompanyOverview(managerA, orgA.id);
    expect(overview.stats.overdue).toBeGreaterThan(0);
    expect(overview.rows.every((r) => r.userId === learner.id)).toBe(true);
    await expect(getCompanyOverview(managerB, orgA.id)).rejects.toThrow(PermissionError);
    await expect(getStaffTraining(managerB, orgB.id, learner.id)).rejects.toThrow(PermissionError);
    const staff = await getStaffTraining(managerA, orgA.id, learner.id);
    expect(staff.courses.length).toBeGreaterThan(0);
    const report = await getComplianceRows(managerA, orgA.id);
    expect(report.rows.some((r) => r.state === "overdue")).toBe(true);
  });
});
