import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/guards";
import { getAttemptForMarking } from "@/server/assessment/quiz";
import { scoreQuestion } from "@/server/assessment/scoring";
import { db } from "@/server/db";
import { dec } from "@/server/pii/fields";
import type { Answer, SnapshotQuestion } from "@/lib/questions";
import { AnswerSummary } from "@/ui/answer-summary";
import { AttemptMarkForm } from "./attempt-mark-form";

export const metadata: Metadata = { title: "Mark attempt" };

export default async function AttemptMarkingPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { user } = await requireUser();
  const { id, attemptId } = await params;
  const attempt = await getAttemptForMarking({ id: user.id, roles: user.roles }, attemptId);
  const learner = await db.enrolment.findUniqueOrThrow({
    where: { id: attempt.enrolmentId },
    select: { user: { select: { id: true, profile: { select: { fullNameEnc: true } } } } },
  });
  const questions = attempt.questions as unknown as SnapshotQuestion[];
  const answers = attempt.answers as Record<string, Answer>;
  const awarded = attempt.awarded as Record<string, number>;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/teach/courses/${id}/marking/${attempt.quizId}`} className="eyebrow hover:text-fg">
        ← {attempt.quiz.item.title}
      </Link>
      <h2 className="font-display text-h2">
        {learner.user.profile ? dec.fullName(learner.user.id, learner.user.profile.fullNameEnc) : ""} ·
        attempt {attempt.attemptNo}
      </h2>
      <AttemptMarkForm
        courseId={id}
        attemptId={attempt.id}
        questions={questions.map((q) => ({
          id: q.id,
          max: q.points,
          awarded: awarded[q.id] ?? 0,
          needsMarking: scoreQuestion(q, answers[q.id]).needsMarking,
          content: <AnswerSummary question={q} answer={answers[q.id]} showKey />,
        }))}
      />
    </div>
  );
}
