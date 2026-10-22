import { describe, expect, it } from "vitest";
import { shortName } from "@/lib/display-name";
import { earnedBadges } from "@/server/engagement/badges";
import { averages, monthlyTrend } from "@/server/engagement/ratings";
import { buildIcs, icsEscape } from "@/server/engagement/calendar";
import { richTextToPlain } from "@/server/engagement/announcements";

describe("names between learners", () => {
  it("shows first name and surname initial", () => {
    expect(shortName("Thandiwe Nomsa Mokoena")).toBe("Thandiwe M.");
    expect(shortName("Sipho")).toBe("Sipho");
    expect(shortName("  ")).toBe("Learner");
  });
});

describe("badges", () => {
  const course = (over = {}) => ({
    courseId: "c1",
    category: "HEALTH_SAFETY" as const,
    dueAt: null,
    completedAt: new Date("2026-11-01"),
    sessionsHeld: 0,
    sessionsAttended: 0,
    ...over,
  });
  it("awards milestone badges from the facts", () => {
    expect(earnedBadges({ completedItems: 0, completedCourses: [], perfectQuizCourseIds: [] })).toEqual([]);
    const b = earnedBadges({
      completedItems: 5,
      completedCourses: [
        course({ dueAt: new Date("2026-11-05"), sessionsHeld: 2, sessionsAttended: 2 }),
        course({ courseId: "c2", category: "AI_DIGITAL", dueAt: new Date("2026-10-01") }),
        course({ courseId: "c3", sessionsHeld: 2, sessionsAttended: 1 }),
      ],
      perfectQuizCourseIds: ["c2", "c2"],
    });
    const codes = b.map((x) => `${x.badge}:${x.courseId ?? ""}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "FIRST_STEP:",
        "COURSE_COMPLETE:c1",
        "ON_TIME:c1",
        "FULL_ATTENDANCE:c1",
        "FULL_MARKS:c2",
        "THREE_COURSES:",
        "ALL_ROUNDER:",
      ]),
    );
    expect(codes).not.toContain("ON_TIME:c2"); // finished after its due date
    expect(codes).not.toContain("FULL_ATTENDANCE:c3");
    expect(codes.filter((c) => c === "FULL_MARKS:c2")).toHaveLength(1);
  });
});

describe("rating summaries", () => {
  const r = (k: number, at = new Date("2026-10-10")) => ({
    knowledge: k,
    clarity: 4,
    relevance: 4,
    engagement: 4,
    courseId: "c",
    createdAt: at,
    comment: null,
  });
  it("averages each criterion and overall", () => {
    expect(averages([r(5), r(3)])).toEqual({
      count: 2,
      overall: 4,
      byCriterion: { knowledge: 4, clarity: 4, relevance: 4, engagement: 4 },
    });
  });
  it("hides months with too few ratings", () => {
    const now = new Date("2026-10-22");
    const trend = monthlyTrend([r(5), r(5), r(5), r(4, new Date("2026-09-03"))], now);
    expect(trend).toHaveLength(12);
    expect(trend.at(-1)).toEqual({ month: "2026-10", count: 3, overall: 4.3 });
    expect(trend.at(-2)).toEqual({ month: "2026-09", count: 1, overall: null });
  });
});

describe("calendar export", () => {
  it("escapes text and folds long lines", () => {
    expect(icsEscape("Gate 3, Acme; bring PPE\nand ID")).toBe("Gate 3\\, Acme\\; bring PPE\\nand ID");
    const ics = buildIcs(
      [
        {
          id: "s-1",
          kind: "session",
          title: "A".repeat(120),
          course: { title: "SHE", slug: "she", category: "HEALTH_SAFETY" },
          start: new Date("2026-11-03T06:00:00Z"),
          end: new Date("2026-11-03T10:00:00Z"),
          location: "Gate 3",
          href: "/learn/she",
          done: false,
        },
      ],
      "https://academy.yarigroup.co.za",
      new Date("2026-10-22T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART:20261103T060000Z");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("announcement email text", () => {
  it("turns rich text into readable plain text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Site visit moved." }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Bring PPE" }] }],
            },
          ],
        },
      ],
    };
    expect(richTextToPlain(doc)).toBe("Site visit moved.\n\n• Bring PPE");
  });
});
