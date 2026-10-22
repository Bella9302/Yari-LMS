import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { authorName, platformAnnouncements } from "@/server/engagement/announcements";
import { PageHeader } from "@/ui/primitives";
import { AnnouncementList } from "@/ui/announcement-list";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireUser();
  const items = await platformAnnouncements();
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader eyebrow="YARI Academy" title="Announcements" />
      <AnnouncementList items={items.map((a) => ({ ...a, author: authorName(a) }))} />
    </div>
  );
}
