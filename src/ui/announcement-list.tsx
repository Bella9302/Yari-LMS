import { Pin } from "lucide-react";
import { deleteAnnouncementAction } from "@/server/actions/engagement";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { EmptyState, Tag } from "@/ui/primitives";
import { RichTextView } from "@/ui/rich-text-view";

export interface AnnouncementView {
  id: string;
  title: string;
  body: unknown;
  pinned: boolean;
  createdAt: Date;
  author: string;
  recipients?: number;
  emailed?: boolean;
}

export function AnnouncementList({
  items,
  manage,
  back,
}: {
  items: AnnouncementView[];
  manage?: boolean;
  back?: string;
}) {
  if (items.length === 0) return <EmptyState title="No announcements yet" />;
  return (
    <ol className="space-y-4">
      {items.map((a) => (
        <li key={a.id}>
          <article className="border-line bg-surface border p-5">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {a.pinned && <Pin className="text-accent-text size-4" aria-label="Pinned" />}
              <h3 className="font-display text-h3 flex-1">{a.title}</h3>
              <span className="text-muted font-mono text-xs">{formatDateTime(a.createdAt)}</span>
            </header>
            <p className="text-muted mt-1 text-sm">
              {a.author}
              {manage && a.recipients !== undefined && ` · ${a.recipients} recipients`}
              {manage && a.emailed && <Tag className="ml-2">Emailed</Tag>}
            </p>
            <RichTextView doc={a.body} className="mt-4" />
            {manage && (
              <form action={deleteAnnouncementAction} className="border-line mt-4 border-t pt-3">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="back" value={back} />
                <Button type="submit" variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            )}
          </article>
        </li>
      ))}
    </ol>
  );
}
