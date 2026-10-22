import { describe, expect, it } from "vitest";
import { ruleReason } from "@/server/tracking/at-risk";
import { isCheckInOpen, qrToken, verifyQrToken, QR_WINDOW_MS } from "@/server/tracking/sessions";
import { trainingState } from "@/server/tracking/company";
import { formatDuration } from "@/server/tracking/activity";

const DAY = 86_400_000;
const now = new Date("2026-11-20T10:00:00Z");
const base = {
  id: "e",
  createdAt: new Date(now.getTime() - 30 * DAY),
  lastActiveAt: null as Date | null,
  dueAt: null as Date | null,
  submittedAssignmentIds: new Set<string>(),
  scores: [] as { title: string; scorePct: number; passed: boolean | null }[],
};

describe("at-risk rules", () => {
  it("flags inactivity, counting from enrolment if never started", () => {
    const rule = { type: "INACTIVE_DAYS" as const, threshold: 7 };
    expect(ruleReason(rule, base, [], now)).toBe("Hasn't started (enrolled 30 days ago)");
    expect(ruleReason(rule, { ...base, lastActiveAt: new Date(now.getTime() - 8 * DAY) }, [], now)).toBe(
      "No activity for 8 days",
    );
    expect(
      ruleReason(rule, { ...base, lastActiveAt: new Date(now.getTime() - 2 * DAY) }, [], now),
    ).toBeNull();
  });

  it("flags a passed course due date and missing assignment hand-ins, after the grace period", () => {
    const rule = { type: "MISSED_DEADLINE" as const, threshold: 2 };
    const assignments = [{ id: "a1", title: "Site report", dueAt: new Date(now.getTime() - 3 * DAY) }];
    expect(ruleReason(rule, { ...base, dueAt: new Date(now.getTime() - DAY) }, [], now)).toBeNull(); // within grace
    expect(ruleReason(rule, base, assignments, now)).toMatch(/“Site report” not handed in/);
    expect(
      ruleReason(rule, { ...base, submittedAssignmentIds: new Set(["a1"]) }, assignments, now),
    ).toBeNull();
  });

  it("flags low scores but not ones the learner has since passed", () => {
    const rule = { type: "SCORE_BELOW" as const, threshold: 50 };
    expect(
      ruleReason(rule, { ...base, scores: [{ title: "Quiz", scorePct: 40, passed: false }] }, [], now),
    ).toBe("“Quiz”: 40%");
    expect(
      ruleReason(rule, { ...base, scores: [{ title: "Quiz", scorePct: 40, passed: true }] }, [], now),
    ).toBeNull();
  });
});

describe("rotating QR codes", () => {
  const secret = "s3cret";
  const t0 = 1_800_000_000_000;
  it("accepts the current and previous window only", () => {
    const w = Math.floor(t0 / QR_WINDOW_MS);
    expect(verifyQrToken(secret, "sess", qrToken(secret, "sess", w), t0)).toBe(true);
    expect(verifyQrToken(secret, "sess", qrToken(secret, "sess", w - 1), t0)).toBe(true);
    expect(verifyQrToken(secret, "sess", qrToken(secret, "sess", w - 2), t0)).toBe(false);
  });
  it("binds the code to the session and secret", () => {
    const w = Math.floor(t0 / QR_WINDOW_MS);
    expect(verifyQrToken(secret, "other", qrToken(secret, "sess", w), t0)).toBe(false);
    expect(verifyQrToken("different", "sess", qrToken(secret, "sess", w), t0)).toBe(false);
  });
  it("opens check-in 30 minutes either side of the session", () => {
    const s = { startsAt: new Date(t0), endsAt: new Date(t0 + 3_600_000), cancelledAt: null };
    expect(isCheckInOpen(s, t0 - 31 * 60_000)).toBe(false);
    expect(isCheckInOpen(s, t0 - 29 * 60_000)).toBe(true);
    expect(isCheckInOpen(s, t0 + 3_600_000 + 29 * 60_000)).toBe(true);
    expect(isCheckInOpen({ ...s, cancelledAt: new Date() }, t0)).toBe(false);
  });
});

describe("company training states", () => {
  const e = {
    status: "ACTIVE",
    progressPct: 0,
    dueAt: null as Date | null,
    lastActiveAt: null as Date | null,
    createdAt: new Date(now.getTime() - DAY),
  };
  it("orders completed > overdue > inactive > in progress > not started", () => {
    expect(trainingState({ ...e, status: "COMPLETED", dueAt: new Date(0) }, now)).toBe("completed");
    expect(trainingState({ ...e, dueAt: new Date(now.getTime() - DAY) }, now)).toBe("overdue");
    expect(trainingState({ ...e, createdAt: new Date(now.getTime() - 20 * DAY) }, now)).toBe("inactive");
    expect(trainingState({ ...e, progressPct: 10, lastActiveAt: now }, now)).toBe("in_progress");
    expect(trainingState(e, now)).toBe("not_started");
  });
});

describe("durations", () => {
  it("formats time on task", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(30)).toBe("<1 min");
    expect(formatDuration(25 * 60)).toBe("25 min");
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe("3 h 5 min");
  });
});
