import type { Metadata } from "next";
import { requireRole } from "@/server/guards";
import { authorName, platformAnnouncements } from "@/server/engagement/announcements";
import { PageHeader } from "@/ui/primitives";
import { AnnouncementForm } from "@/ui/announcement-form";
import { AnnouncementList } from "@/ui/announcement-list";

export const metadata: Metadata = { title: "Platform announcements" };

export default async function AdminAnnouncementsPage() {
  await requireRole("SUPER_ADMIN");
  const items = await platformAnnouncements();
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Platform announcements"
        description="Service notices for everyone on YARI Academy: maintenance, policy updates, new courses."
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="min-w-0">
          <AnnouncementList
            manage
            back="/admin/announcements"
            items={items.map((a) => ({ ...a, author: authorName(a) }))}
          />
        </section>
        <aside className="space-y-4">
          <h2 className="font-display text-h3">New announcement</h2>
          <AnnouncementForm courseId={null} audience="every active user" />
        </aside>
      </div>
    </div>
  );
}
