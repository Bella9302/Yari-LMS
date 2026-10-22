import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/guards";
import { CRITERIA, CRITERIA_LABELS, MIN_RESPONSES, trainerSummary } from "@/server/engagement/ratings";
import { EmptyState, PageHeader, Stat } from "@/ui/primitives";
import { RatingTrend } from "@/ui/rating-trend";

export const metadata: Metadata = { title: "Your ratings" };

/** A thin 1–5 meter: the filled part is the score, the rest is the remaining scale. */
function Meter({ value }: { value: number }) {
  return (
    <span aria-hidden className="bg-sunk block h-1.5 w-full overflow-hidden rounded-full">
      <span className="bg-accent-text block h-full rounded-full" style={{ width: `${(value / 5) * 100}%` }} />
    </span>
  );
}

export default async function TrainerRatingsPage() {
  const { user } = await requireRole("TRAINER", "SUPER_ADMIN");
  const s = await trainerSummary(user.id);
  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Teaching"
        title="Your ratings"
        description="What learners say after your sessions and courses. Ratings are anonymous: you see averages and unnamed comments only."
      />
      {!s.enough ? (
        <EmptyState title="Not enough ratings yet">
          Your summary appears once {MIN_RESPONSES} learners have rated you ({s.count} so far), so no one can
          be identified from their scores.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="overall-heading" className="space-y-6">
            <h2 id="overall-heading" className="sr-only">
              Overall
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
              <Stat
                label="Overall"
                value={
                  <>
                    {s.overall.toFixed(1)}
                    <span className="text-muted text-xl"> / 5</span>
                  </>
                }
              />
              <Stat label="Ratings" value={s.count} />
            </div>
            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              {CRITERIA.map((c) => (
                <div key={c} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>{CRITERIA_LABELS[c]}</dt>
                    <dd className="font-mono tabular-nums">{s.byCriterion[c].toFixed(1)}</dd>
                  </div>
                  <Meter value={s.byCriterion[c]} />
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="trend-heading" className="space-y-4">
            <h2 id="trend-heading" className="font-display text-h2">
              Over time
            </h2>
            <RatingTrend points={s.trend} min={MIN_RESPONSES} />
          </section>

          {s.courses.length > 0 && (
            <section aria-labelledby="courses-heading" className="space-y-4">
              <h2 id="courses-heading" className="font-display text-h2">
                By course
              </h2>
              <ul className="border-line divide-line divide-y border-y">
                {s.courses.map((c) => (
                  <li key={c.courseId} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="min-w-0 break-words">{c.title}</span>
                    <span className="text-muted shrink-0 font-mono text-sm tabular-nums">
                      <span className="text-fg">{c.overall.toFixed(1)}</span> · {c.count} ratings
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="comments-heading" className="space-y-4">
            <h2 id="comments-heading" className="font-display text-h2">
              Comments
            </h2>
            {s.comments.length === 0 ? (
              <p className="text-muted">No written comments yet.</p>
            ) : (
              <ul className="space-y-3">
                {s.comments.map((c, i) => (
                  <li key={i} className="border-line border-l-2 py-1 pl-4 break-words whitespace-pre-wrap">
                    {c}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted text-sm">
              Shown in random order, without dates, to protect learners&apos; anonymity.
            </p>
          </section>
        </>
      )}
      <Link href="/teach" className="text-sm underline underline-offset-4">
        Back to your courses
      </Link>
    </div>
  );
}
