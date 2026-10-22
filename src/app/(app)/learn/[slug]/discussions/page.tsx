import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, MessageSquare, Pin } from "lucide-react";
import { requireUser } from "@/server/guards";
import { listThreads } from "@/server/engagement/discussions";
import { formatDateTime } from "@/lib/format";
import { EmptyState, Notice, Tag } from "@/ui/primitives";
import { NewThreadForm } from "@/ui/discussion-forms";

export const metadata: Metadata = { title: "Discussions" };

export default async function DiscussionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { user } = await requireUser();
  const { slug } = await params;
  const data = await listThreads({ id: user.id, roles: user.roles }, slug);
  if (!data) notFound();
  const { access, threads } = data;

  return (
    <div
      className="mx-auto max-w-3xl space-y-8"
      data-category={access.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
    >
      <div className="space-y-3">
        <Link href={`/learn/${slug}`} className="eyebrow hover:text-fg">
          ← {access.course.title}
        </Link>
        <h1 className="font-display text-h1">Discussions</h1>
        <p className="text-muted">
          Ask questions and share what you&apos;ve seen on site. Other learners see your first name and
          initial.
        </p>
      </div>

      {!access.canPost && <Notice>This course is archived, so its discussions are read-only.</Notice>}

      {threads.length === 0 ? (
        <EmptyState title="No discussions yet">Start the first one below.</EmptyState>
      ) : (
        <ul className="border-line divide-line divide-y border-y">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/learn/${slug}/discussions/${t.id}`}
                className="hover:bg-sunk flex min-h-16 items-start gap-3 px-1 py-4 transition-colors"
              >
                <MessageSquare aria-hidden className="text-accent-text mt-1 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">{t.title}</span>
                    {t.pinned && (
                      <Tag tone="accent">
                        <Pin aria-hidden className="size-3" /> Pinned
                      </Tag>
                    )}
                    {t.locked && (
                      <Tag>
                        <Lock aria-hidden className="size-3" /> Locked
                      </Tag>
                    )}
                  </span>
                  <span className="text-muted mt-1 block text-sm">
                    {t.author.name}
                    {t.author.staff && " (trainer)"} · {t.replies} {t.replies === 1 ? "reply" : "replies"}
                  </span>
                </span>
                <span className="text-muted shrink-0 font-mono text-xs">{formatDateTime(t.lastPostAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {access.canPost && (
        <section aria-labelledby="new-thread-heading" className="border-line border-t pt-6">
          <h2 id="new-thread-heading" className="font-display text-h3 mb-4">
            Start a discussion
          </h2>
          <NewThreadForm courseId={access.course.id} slug={slug} />
        </section>
      )}
    </div>
  );
}
