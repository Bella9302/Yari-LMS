import Link from "next/link";
import type { QuizOverview } from "@/server/assessment/quiz";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/ui/button";
import { Notice, Stat, Tag } from "@/ui/primitives";
import { StartAttemptButton } from "./start-attempt";

export function QuizPanel({ slug, itemId, quiz }: { slug: string; itemId: string; quiz: QuizOverview }) {
  const used = quiz.attempts.length;
  return (
    <div className="space-y-8">
      {quiz.instructions && <p className="text-lg whitespace-pre-line">{quiz.instructions}</p>}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Questions" value={quiz.questionCount} />
        <Stat label="Pass mark" value={`${quiz.passPct}%`} />
        <Stat
          label="Time"
          value={quiz.timeLimitMin ? `${quiz.timeLimitMin}m` : "—"}
          hint={quiz.timeLimitMin ? "Timer starts when you begin" : "No time limit"}
        />
        <Stat
          label="Attempts"
          value={quiz.maxAttempts ? `${used}/${quiz.maxAttempts}` : used}
          hint={quiz.maxAttempts ? undefined : "Unlimited"}
        />
      </div>

      {quiz.passed && (
        <Notice tone="success" title={`Passed with ${Math.round(quiz.bestPct ?? 0)}%`}>
          Well done — this item is complete.
        </Notice>
      )}
      {quiz.pending && !quiz.passed && (
        <Notice title="Waiting for your trainer">
          Some of your answers need a trainer to check them. Your result will appear here.
        </Notice>
      )}

      {quiz.inProgressId ? (
        <Link
          href={`/learn/${slug}/${itemId}/attempt/${quiz.inProgressId}`}
          className={buttonClasses("primary", "lg")}
        >
          Continue your attempt
        </Link>
      ) : quiz.canStart ? (
        <StartAttemptButton
          slug={slug}
          itemId={itemId}
          label={used ? "Try again" : "Start the quiz"}
          timed={quiz.timeLimitMin}
        />
      ) : (
        !quiz.passed &&
        !quiz.pending && (
          <Notice>You&apos;ve used all your attempts. Speak to your trainer if you need another.</Notice>
        )
      )}

      {used > 0 && (
        <section aria-labelledby="attempts-heading">
          <h2 id="attempts-heading" className="eyebrow mb-2">
            Your attempts
          </h2>
          <ul className="divide-line border-line divide-y border-y">
            {quiz.attempts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/learn/${slug}/${itemId}/attempt/${a.id}`}
                  className="hover:bg-sunk flex min-h-12 items-center gap-4 py-2 sm:px-2"
                >
                  <span className="text-muted font-mono text-sm">#{a.attemptNo}</span>
                  <span className="text-muted flex-1 text-sm">{formatDateTime(a.submittedAt)}</span>
                  {a.status === "NEEDS_MARKING" ? (
                    <Tag>Being checked</Tag>
                  ) : (
                    <span className="font-mono">{Math.round(a.scorePct ?? 0)}%</span>
                  )}
                  {a.passed === true && <Tag tone="success">Pass</Tag>}
                  {a.passed === false && <Tag tone="danger">Not yet</Tag>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
