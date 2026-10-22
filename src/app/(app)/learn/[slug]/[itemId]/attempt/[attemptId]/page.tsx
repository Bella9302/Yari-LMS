import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/guards";
import { getAttemptForLearner, getAttemptReview } from "@/server/assessment/quiz";
import { NotFoundError } from "@/server/courses/access";
import { db } from "@/server/db";
import { AnswerSummary } from "@/ui/answer-summary";
import { buttonClasses } from "@/ui/button";
import { Notice } from "@/ui/primitives";
import { ProgressRing } from "@/ui/progress-ring";
import { QuizTaker } from "./quiz-taker";

export const metadata: Metadata = { title: "Quiz" };

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string; attemptId: string }>;
}) {
  const { user } = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const { slug, itemId, attemptId } = await params;
  const attempt = await getAttemptForLearner(actor, attemptId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (attempt.itemId !== itemId) notFound();
  const item = await db.item.findUniqueOrThrow({
    where: { id: itemId },
    select: { title: true, module: { select: { course: { select: { category: true } } } } },
  });
  const category = item.module.course.category === "HEALTH_SAFETY" ? "health-safety" : "ai-digital";
  const back = `/learn/${slug}/${itemId}`;

  if (attempt.status === "IN_PROGRESS") {
    return (
      <div className="mx-auto max-w-3xl space-y-6" data-category={category}>
        <header>
          <p className="eyebrow">Attempt {attempt.attemptNo}</p>
          <h1 className="font-display text-h1 mt-2">{item.title}</h1>
        </header>
        <QuizTaker
          slug={slug}
          itemId={itemId}
          attemptId={attempt.id}
          questions={attempt.questions}
          initialAnswers={attempt.answers}
          deadline={attempt.deadline?.toISOString() ?? null}
        />
      </div>
    );
  }

  const review = await getAttemptReview(actor, attemptId);
  return (
    <div className="mx-auto max-w-3xl space-y-8" data-category={category}>
      <Link href={back} className="eyebrow hover:text-fg">
        ← {item.title}
      </Link>
      <header className="flex flex-wrap items-center gap-6">
        {review.scorePct !== null && (
          <ProgressRing value={review.scorePct} label="Score" size={96} stroke={6} />
        )}
        <div>
          <p className="eyebrow">Attempt {review.attemptNo}</p>
          <h1 className="font-display text-h1 mt-2">
            {review.status === "NEEDS_MARKING" ? "Submitted" : review.passed ? "Passed" : "Not passed yet"}
          </h1>
          <p className="text-muted mt-1">Pass mark {review.passPct}%</p>
        </div>
      </header>
      {review.status === "NEEDS_MARKING" && (
        <Notice title="Some answers need checking">
          Your trainer will look at your written answers. Your result will appear on the quiz page.
        </Notice>
      )}
      <ol className="space-y-4">
        {review.questions.map((q, i) => (
          <li key={q.id} className="border-line bg-surface border p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Question {i + 1}</span>
              <span className="font-mono text-sm">
                {q.pending ? "being checked" : q.points === null ? `${q.max} pts` : `${q.points} / ${q.max}`}
              </span>
            </div>
            <AnswerSummary
              question={{ ...q, explanation: q.explanation }}
              answer={q.answer}
              correctKey={review.showAnswers ? q.correct : undefined}
            />
          </li>
        ))}
      </ol>
      {!review.showAnswers && review.status === "MARKED" && (
        <p className="text-muted text-sm">
          Correct answers aren&apos;t shown for this quiz{review.passed ? "" : " until you pass"}.
        </p>
      )}
      <Link href={back} className={buttonClasses("primary", "lg")}>
        Back to the quiz
      </Link>
    </div>
  );
}
