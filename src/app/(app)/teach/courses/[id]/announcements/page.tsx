import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { authorName, courseAnnouncements } from "@/server/engagement/announcements";
import { AnnouncementForm } from "@/ui/announcement-form";
import { AnnouncementList } from "@/ui/announcement-list";

export const metadata: Metadata = { title: "Announcements" };

export default async function CourseAnnouncementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  const course = await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const items = await courseAnnouncements(id);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 space-y-4">
        <h2 className="font-display text-h2">Posted</h2>
        <AnnouncementList
          manage
          back={`/teach/courses/${id}/announcements`}
          items={items.map((a) => ({ ...a, author: authorName(a) }))}
        />
      </section>
      <aside className="space-y-4">
        <h2 className="font-display text-h3">New announcement</h2>
        {course.status !== "PUBLISHED" && (
          <p className="text-muted text-sm">The course is not published, so no emails will go out yet.</p>
        )}
        <AnnouncementForm courseId={id} audience="everyone on the course" />
      </aside>
    </div>
  );
}
