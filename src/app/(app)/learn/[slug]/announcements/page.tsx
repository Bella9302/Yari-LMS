import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/guards";
import { getLearnerCourse } from "@/server/courses/learner";
import { authorName, courseAnnouncements } from "@/server/engagement/announcements";
import { AnnouncementList } from "@/ui/announcement-list";

export const metadata: Metadata = { title: "Course announcements" };

export default async function LearnerAnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { user } = await requireUser();
  const { slug } = await params;
  const data = await getLearnerCourse({ id: user.id, roles: user.roles }, slug);
  if (!data) notFound();
  const items = await courseAnnouncements(data.course.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/learn/${slug}`} className="eyebrow hover:text-fg">
        ← {data.course.title}
      </Link>
      <h1 className="font-display text-h1">Announcements</h1>
      <AnnouncementList items={items.map((a) => ({ ...a, author: authorName(a) }))} />
    </div>
  );
}
