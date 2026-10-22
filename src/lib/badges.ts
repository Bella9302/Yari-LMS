// Achievement badges: recognition for milestones on YARI Academy. Not credentials or accreditation.

export type BadgeCode =
  | "FIRST_STEP"
  | "COURSE_COMPLETE"
  | "FULL_MARKS"
  | "ON_TIME"
  | "FULL_ATTENDANCE"
  | "THREE_COURSES"
  | "ALL_ROUNDER";

export interface BadgeDef {
  code: BadgeCode;
  name: string;
  description: string;
  /** Earned once per course (true) or once overall (false). */
  perCourse: boolean;
}

export const BADGES: Record<BadgeCode, BadgeDef> = {
  FIRST_STEP: {
    code: "FIRST_STEP",
    name: "First step",
    description: "Completed your first item.",
    perCourse: false,
  },
  COURSE_COMPLETE: {
    code: "COURSE_COMPLETE",
    name: "Course complete",
    description: "Completed a course.",
    perCourse: true,
  },
  FULL_MARKS: {
    code: "FULL_MARKS",
    name: "Full marks",
    description: "Scored 100% on a quiz.",
    perCourse: true,
  },
  ON_TIME: {
    code: "ON_TIME",
    name: "On time",
    description: "Finished a course before its due date.",
    perCourse: true,
  },
  FULL_ATTENDANCE: {
    code: "FULL_ATTENDANCE",
    name: "Full attendance",
    description: "Attended every live session of a course.",
    perCourse: true,
  },
  THREE_COURSES: {
    code: "THREE_COURSES",
    name: "Committed learner",
    description: "Completed three courses.",
    perCourse: false,
  },
  ALL_ROUNDER: {
    code: "ALL_ROUNDER",
    name: "All-rounder",
    description: "Completed courses in both Health & Safety and AI & Digital.",
    perCourse: false,
  },
};

export const BADGE_DISCLAIMER =
  "Badges celebrate progress on YARI Academy. They are not qualifications or accreditation.";
