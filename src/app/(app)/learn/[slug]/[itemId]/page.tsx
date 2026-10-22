import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Lock } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getLearnerItem, type LearnerItemView } from "@/server/courses/learner";
import { formatBytes } from "@/lib/file-types";
import { parseVideoEmbed } from "@/lib/video-embed";
import { buttonClasses } from "@/ui/button";
import { ITEM_TYPE_META } from "@/ui/item-type";
import { Notice } from "@/ui/primitives";
import { RichTextView } from "@/ui/rich-text-view";
import { CompleteButton, ViewTracker } from "./item-actions";

export const metadata: Metadata = { title: "Course item" };

export default async function ItemPage({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { user } = await requireUser();
  const { slug, itemId } = await params;
  const view = await getLearnerItem({ id: user.id, roles: user.roles }, slug, itemId);
  if (!view) notFound();
  const { course, item, moduleTitle, prevItemId, nextItemId } = view;
  const canOpen = item.lock.unlocked || course.preview;
  const tracking = Boolean(course.enrolment) && item.lock.unlocked && !course.course.archived;

  return (
    <article
      className="mx-auto max-w-3xl space-y-8"
      data-category={course.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital"}
    >
      {tracking && <ViewTracker itemId={item.id} />}
      <header className="animate-rise space-y-3">
        <Link href={`/learn/${slug}`} className="eyebrow hover:text-fg">
          ← {course.course.title}
        </Link>
        <p className="text-muted text-sm">
          {moduleTitle} · {ITEM_TYPE_META[item.type].label}
        </p>
        <h1 className="font-display text-h1 break-words">{item.title}</h1>
      </header>

      {course.preview && !item.lock.unlocked && (
        <Notice title="Locked for learners">{item.lock.reasons.join(" · ")}</Notice>
      )}

      {canOpen ? (
        <ItemContent item={item} />
      ) : (
        <div className="border-line-strong flex flex-col items-center gap-3 border border-dashed px-6 py-14 text-center">
          <Lock className="text-muted size-6" aria-hidden />
          <p className="font-display text-h3">Not open yet</p>
          <ul className="text-muted">
            {item.lock.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <footer className="border-line space-y-6 border-t pt-6">
        {tracking && (
          <CompleteButton
            slug={slug}
            itemId={item.id}
            completed={item.status === "COMPLETED"}
            nextHref={nextItemId ? `/learn/${slug}/${nextItemId}` : `/learn/${slug}`}
          />
        )}
        <nav aria-label="Course items" className="flex justify-between gap-3">
          {prevItemId ? (
            <Link href={`/learn/${slug}/${prevItemId}`} className={buttonClasses("ghost")}>
              <ArrowLeft className="size-4" aria-hidden /> Previous
            </Link>
          ) : (
            <span />
          )}
          {nextItemId && (
            <Link href={`/learn/${slug}/${nextItemId}`} className={buttonClasses("ghost")}>
              Next <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </nav>
      </footer>
    </article>
  );
}

function ItemContent({ item }: { item: LearnerItemView["item"] }) {
  const fileUrl = item.asset?.ready ? `/api/files/${item.asset.id}` : null;
  const notReady = item.asset && !item.asset.ready && (
    <Notice>This file is still being checked. Try again shortly.</Notice>
  );

  switch (item.type) {
    case "RICH_TEXT":
      return item.body ? <RichTextView doc={item.body} /> : null;

    case "VIDEO": {
      const embed = item.externalUrl ? parseVideoEmbed(item.externalUrl) : null;
      if (embed) {
        return (
          <div className="bg-ink aspect-video w-full">
            <iframe
              src={embed.embedUrl}
              title={item.title}
              className="size-full"
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        );
      }
      return fileUrl ? (
        <div className="space-y-2">
          {/* preload="none": nothing downloads until the learner presses play. */}
          <video src={fileUrl} controls preload="none" playsInline className="bg-ink aspect-video w-full" />
          <p className="text-muted font-mono text-xs">
            {formatBytes(item.asset!.bytes)} — uses mobile data when played.
          </p>
        </div>
      ) : (
        notReady || null
      );
    }

    case "PDF":
    case "SLIDES":
      return fileUrl ? (
        <div className="space-y-4">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener"
            className={buttonClasses("secondary", "lg", "w-full sm:w-auto")}
          >
            <ExternalLink className="size-4" aria-hidden /> Open {item.type === "SLIDES" ? "slides" : "PDF"} (
            {formatBytes(item.asset!.bytes)})
          </a>
          {/* Desktop shows the document inline; phones open it in their own viewer (iframes there are hidden and never load). */}
          <iframe
            src={fileUrl}
            title={item.title}
            loading="lazy"
            className="border-line hidden h-[80vh] w-full border md:block"
          />
        </div>
      ) : (
        notReady || null
      );

    case "DOWNLOAD":
      return fileUrl ? (
        <a
          href={`${fileUrl}?download`}
          className={buttonClasses("primary", "lg", "w-full sm:w-auto")}
          download
        >
          <Download className="size-4" aria-hidden /> Download {item.asset!.filename} (
          {formatBytes(item.asset!.bytes)})
        </a>
      ) : (
        notReady || null
      );

    case "LINK":
      return item.externalUrl ? (
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group border-line bg-surface hover:border-fg flex items-center gap-4 border p-5"
        >
          <ExternalLink className="text-muted size-5 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-medium group-hover:underline">Open the page</span>
            <span className="text-muted block truncate font-mono text-xs">
              {new URL(item.externalUrl).host}
            </span>
          </span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null;
  }
}
