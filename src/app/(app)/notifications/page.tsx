import type { Metadata } from "next";
import Link from "next/link";
import { Award, CheckCircle2, Megaphone, MessagesSquare } from "lucide-react";
import { requireUser } from "@/server/guards";
import { listNotifications } from "@/server/engagement/notifications";
import { markAllReadAction } from "@/server/actions/engagement";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { cn } from "@/ui/cn";

export const metadata: Metadata = { title: "Notifications" };

const ICON = {
  ANNOUNCEMENT: Megaphone,
  DISCUSSION_REPLY: MessagesSquare,
  DISCUSSION_THREAD: MessagesSquare,
  MARK_RELEASED: CheckCircle2,
  BADGE: Award,
};

export default async function NotificationsPage() {
  const { user } = await requireUser();
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        actions={
          unread > 0 && (
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary">
                Mark all as read
              </Button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet">
          Announcements, replies, marks and badges will appear here.
        </EmptyState>
      ) : (
        <ul className="divide-line border-line divide-y border-y">
          {items.map((n) => {
            const Icon = ICON[n.type];
            return (
              <li key={n.id}>
                <Link
                  href={`/notifications/${n.id}/open`}
                  prefetch={false}
                  className={cn(
                    "hover:bg-sunk flex min-h-14 items-start gap-4 py-3 sm:px-2",
                    n.readAt && "text-muted",
                  )}
                >
                  <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block break-words", !n.readAt && "font-medium")}>{n.title}</span>
                    <span className="text-muted block font-mono text-xs">{formatDateTime(n.createdAt)}</span>
                  </span>
                  {!n.readAt && (
                    <span className="bg-fg mt-2 size-2 shrink-0 rounded-full" aria-label="Unread" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
