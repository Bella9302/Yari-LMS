import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/guards";
import { getThread } from "@/server/engagement/discussions";
import { deletePostAction, moderateThreadAction } from "@/server/actions/engagement";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { Notice, Tag } from "@/ui/primitives";
import { EditPost, ReplyForm } from "@/ui/discussion-forms";

export const metadata: Metadata = { title: "Discussion" };

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>;
}) {
  const { user } = await requireUser();
  const { slug, threadId } = await params;
  const data = await getThread({ id: user.id, roles: user.roles }, threadId);
  if (!data || data.access.course.slug !== slug) notFound();
  const { access, thread, posts } = data;
  const back = `/learn/${slug}/discussions/${threadId}`;
  const canReply = access.canPost && (!thread.locked || access.isStaff);

  return (
    <div
      className="mx-auto max-w-3xl space-y-8"
      data-category={access.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
    >
      <div className="space-y-3">
        <Link href={`/learn/${slug}/discussions`} className="eyebrow hover:text-fg">
          ← Discussions · {access.course.title}
        </Link>
        <h1 className="font-display text-h1 break-words">{thread.title}</h1>
        <div className="flex flex-wrap gap-2">
          {thread.pinned && <Tag tone="accent">Pinned</Tag>}
          {thread.locked && <Tag>Locked</Tag>}
        </div>
      </div>

      {access.isStaff && (
        <div className="border-line flex flex-wrap gap-2 border-y py-3">
          <span className="eyebrow self-center">Moderate</span>
          <form action={moderateThreadAction}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="pinned" value={String(!thread.pinned)} />
            <Button type="submit" variant="secondary" size="sm">
              {thread.pinned ? "Unpin" : "Pin"}
            </Button>
          </form>
          <form action={moderateThreadAction}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="locked" value={String(!thread.locked)} />
            <Button type="submit" variant="secondary" size="sm">
              {thread.locked ? "Unlock" : "Lock"}
            </Button>
          </form>
        </div>
      )}

      <ol className="space-y-4">
        {posts.map((p, i) => (
          <li key={p.id}>
            <article
              className={
                p.author.staff
                  ? "border-accent bg-surface border-l-2 py-4 pr-4 pl-5"
                  : "border-line bg-surface border p-5"
              }
              aria-label={i === 0 ? "Opening post" : `Reply ${i}`}
            >
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{p.author.name || "Member"}</span>
                {p.author.staff && <Tag tone="accent">Trainer</Tag>}
                {p.author.self && <Tag>You</Tag>}
                <span className="text-muted ml-auto font-mono text-xs">
                  {formatDateTime(p.createdAt)}
                  {p.editedAt && " · edited"}
                </span>
              </header>
              {p.deleted ? (
                <p className="text-muted mt-3 italic">This post was removed.</p>
              ) : (
                <p className="mt-3 break-words whitespace-pre-wrap">{p.body}</p>
              )}
              {(p.canEdit || p.canDelete) && (
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  {p.canEdit && <EditPost postId={p.id} body={p.body ?? ""} back={back} />}
                  {p.canDelete && (
                    <form action={deletePostAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <input type="hidden" name="back" value={back} />
                      <Button type="submit" variant="ghost" size="sm">
                        {p.author.self ? "Delete" : "Remove"}
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </article>
          </li>
        ))}
      </ol>

      {canReply ? (
        <section aria-label="Add to the discussion" className="border-line border-t pt-6">
          <ReplyForm threadId={thread.id} slug={slug} />
        </section>
      ) : (
        <Notice>{thread.locked ? "This topic is locked." : "This discussion is read-only."}</Notice>
      )}
    </div>
  );
}
