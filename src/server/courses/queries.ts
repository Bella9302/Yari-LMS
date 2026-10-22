import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { canEditCourse } from "@/server/courses/access";
import type { Actor } from "@/server/pii/users";

/** Loads a course for its staff, or 404s. Used by every /teach/courses/[id] page. */
export async function getEditableCourse(actor: Actor, courseId: string) {
  if (!(await canEditCourse(actor, courseId))) notFound();
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      coverAsset: { select: { id: true, filename: true } },
      _count: { select: { enrolments: { where: { status: { not: "WITHDRAWN" } } } } },
    },
  });
  if (!course) notFound();
  return course;
}

export async function getCourseStructure(courseId: string) {
  return db.module.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    include: {
      releaseRules: {
        include: { dependsOnItem: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      },
      items: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          published: true,
          required: true,
          _count: { select: { releaseRules: true } },
        },
      },
    },
  });
}

/** All items of a course in order, for "depends on" pickers. */
export async function courseItemOptions(courseId: string) {
  const modules = await db.module.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: {
      title: true,
      items: { orderBy: { position: "asc" }, select: { id: true, title: true, type: true } },
    },
  });
  return modules.map((m) => ({ module: m.title, items: m.items }));
}
