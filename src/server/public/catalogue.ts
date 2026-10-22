import "server-only";
import { db } from "@/server/db";

// What anyone may see without signing in: published courses marked Public, never templates.
const publicWhere = { status: "PUBLISHED", visibility: "PUBLIC", isTemplate: false } as const;

export async function publicCourses(category?: "HEALTH_SAFETY" | "AI_DIGITAL") {
  const rows = await db.course.findMany({
    where: { ...publicWhere, ...(category ? { category } : {}) },
    orderBy: [{ category: "asc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      estMinutes: true,
      _count: { select: { modules: true } },
    },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, modules: _count.modules }));
}

export async function publicCourse(slug: string) {
  return db.course.findFirst({
    where: { ...publicWhere, slug },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      estMinutes: true,
      modules: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          items: {
            where: { published: true },
            orderBy: { position: "asc" },
            select: { title: true, type: true },
          },
        },
      },
    },
  });
}
