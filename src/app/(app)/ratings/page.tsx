import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { pendingRatings } from "@/server/engagement/ratings";
import { EmptyState, Notice, PageHeader } from "@/ui/primitives";
import { RatingForm } from "@/ui/rating-form";

export const metadata: Metadata = { title: "Rate your trainers" };

export default async function RatingsPage({ searchParams }: { searchParams: Promise<{ thanks?: string }> }) {
  const { user } = await requireUser();
  const { thanks } = await searchParams;
  const pending = await pendingRatings(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Feedback"
        title="Rate your trainers"
        description="Your ratings help YARI GROUP improve its training. Trainers only ever see averages and unnamed comments, and only once at least three people have rated them."
      />
      {thanks && (
        <Notice tone="success" title="Thank you">
          Your rating has been recorded. The trainer will never see your name.
        </Notice>
      )}
      {pending.length === 0 ? (
        <EmptyState title="Nothing to rate right now">
          After a session you attended or a course you finish, you can rate the trainer here.
        </EmptyState>
      ) : (
        <ol className="space-y-6">
          {pending.map((p, i) => (
            <li key={p.key} className="border-line bg-surface border p-5">
              <p className="eyebrow">{p.sessionTitle ? "Session" : "Course"}</p>
              <h2 className="font-display text-h3 mt-1 break-words">{p.trainerName}</h2>
              <p className="text-muted mt-1 text-sm">
                {p.sessionTitle ? `${p.sessionTitle} · ${p.courseTitle}` : p.courseTitle}
              </p>
              <div className="mt-5">
                <RatingForm
                  trainerId={p.trainerId}
                  courseId={p.courseId}
                  sessionId={p.sessionId}
                  idPrefix={`r${i}`}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
