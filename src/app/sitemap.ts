import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { env } from "@/server/env";
import { publicCourses } from "@/server/public/catalogue";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = env().APP_URL;
  const courses = await publicCourses();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/courses`, changeFrequency: "weekly", priority: 0.9 },
    ...courses.map((c) => ({
      url: `${base}/courses/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${base}/enquire`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/verify`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
