import "server-only";
import { db } from "@/server/db";
import { hasRole, isSuperAdmin } from "@/server/rbac";
import type { Actor } from "@/server/pii/users";

export interface CalendarEvent {
  id: string;
  kind: "session" | "assignment" | "course-due";
  title: string;
  course: { title: string; slug: string; category: "HEALTH_SAFETY" | "AI_DIGITAL" };
  start: Date;
  end: Date | null;
  location: string | null;
  href: string;
  /** For learners: handed in / completed. */
  done: boolean;
}

/** Sessions and due dates for the courses a person learns on or teaches, between two dates. */
export async function calendarEvents(actor: Actor, from: Date, to: Date): Promise<CalendarEvent[]> {
  const teaching = hasRole(actor.roles, "TRAINER") || isSuperAdmin(actor.roles);
  const learnerCourses = {
    status: { in: ["PUBLISHED" as const] },
    enrolments: { some: { userId: actor.id, status: { not: "WITHDRAWN" as const } } },
  };
  const courseWhere = teaching
    ? { OR: [learnerCourses, { staff: { some: { userId: actor.id } } }] }
    : learnerCourses;
  const courseSelect = {
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      staff: { where: { userId: actor.id }, select: { userId: true } },
    },
  } as const;

  const [sessions, assignments, enrolments] = await Promise.all([
    db.liveSession.findMany({
      where: { cancelledAt: null, startsAt: { lt: to }, endsAt: { gte: from }, course: courseWhere },
      include: {
        course: courseSelect,
        attendance: { where: { userId: actor.id }, select: { status: true } },
      },
    }),
    db.assignment.findMany({
      where: { dueAt: { gte: from, lt: to }, item: { published: true, module: { course: courseWhere } } },
      include: {
        item: { select: { id: true, title: true, module: { select: { course: courseSelect } } } },
        submissions: { where: { enrolment: { userId: actor.id } }, select: { id: true } },
      },
    }),
    db.enrolment.findMany({
      where: {
        userId: actor.id,
        status: { not: "WITHDRAWN" },
        dueAt: { gte: from, lt: to },
        course: { status: "PUBLISHED" },
      },
      include: { course: courseSelect },
    }),
  ]);

  const events: CalendarEvent[] = [
    ...sessions.map((s) => ({
      id: `s-${s.id}`,
      kind: "session" as const,
      title: s.title,
      course: s.course,
      start: s.startsAt,
      end: s.endsAt,
      location: s.mode === "ONLINE" ? "Online" : s.location,
      href: s.course.staff.length
        ? `/teach/courses/${s.course.id}/sessions/${s.id}`
        : `/learn/${s.course.slug}`,
      done: s.attendance[0]?.status === "PRESENT",
    })),
    ...assignments.map((a) => {
      const course = a.item.module.course;
      return {
        id: `a-${a.itemId}`,
        kind: "assignment" as const,
        title: `Due: ${a.item.title}`,
        course,
        start: a.dueAt!,
        end: null,
        location: null,
        href: course.staff.length
          ? `/teach/courses/${course.id}/marking/${a.itemId}`
          : `/learn/${course.slug}/${a.itemId}`,
        done: a.submissions.length > 0,
      };
    }),
    ...enrolments.map((e) => ({
      id: `c-${e.id}`,
      kind: "course-due" as const,
      title: `Course due: ${e.course.title}`,
      course: e.course,
      start: e.dueAt!,
      end: null,
      location: null,
      href: `/learn/${e.course.slug}`,
      done: e.status === "COMPLETED",
    })),
  ];
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---------------------------------------------------------------------------
// iCalendar export (RFC 5545)
// ---------------------------------------------------------------------------

const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export const icsEscape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds lines longer than 75 octets, as the spec requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(events: CalendarEvent[], appUrl: string, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YARI GROUP//YARI Academy//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:YARI Academy",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@yari-academy`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end ?? new Date(e.start.getTime() + 30 * 60_000))}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(e.course.title)}`,
      ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
      `URL:${appUrl}${e.href}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
