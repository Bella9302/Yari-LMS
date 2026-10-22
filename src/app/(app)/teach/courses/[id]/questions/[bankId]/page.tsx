import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { archiveQuestionAction } from "@/server/actions/assessment";
import { QUESTION_TYPE_LABELS } from "@/lib/questions";
import { Button } from "@/ui/button";
import { EmptyState, Tag } from "@/ui/primitives";
import { QuestionEditor, type EditableQuestion } from "@/ui/question-editor";
import { BankSettings } from "../bank-forms";

export const metadata: Metadata = { title: "Question bank" };

export default async function BankPage({ params }: { params: Promise<{ id: string; bankId: string }> }) {
  const { user } = await requireUser();
  const { id, bankId } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const bank = await db.questionBank.findFirst({
    where: { id: bankId, courseId: id },
    include: { questions: { where: { archived: false }, orderBy: { position: "asc" } } },
  });
  if (!bank) notFound();

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-8">
        <div>
          <Link href={`/teach/courses/${id}/questions`} className="eyebrow hover:text-fg">
            ← Question banks
          </Link>
          <h2 className="font-display text-h2 mt-3">{bank.title}</h2>
          <p className="text-muted mt-1 font-mono text-xs">{bank.questions.length} questions</p>
        </div>

        {bank.questions.length === 0 ? (
          <EmptyState title="No questions yet">Add the first one below.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {bank.questions.map((q, i) => (
              <li key={q.id} className="border-line bg-surface border">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                    <span className="text-muted font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words whitespace-pre-line">{q.prompt}</span>
                      <span className="mt-1 flex flex-wrap gap-2">
                        <Tag>{QUESTION_TYPE_LABELS[q.type]}</Tag>
                        <Tag>
                          {q.points} pt{q.points === 1 ? "" : "s"}
                        </Tag>
                      </span>
                    </span>
                    <span className="text-muted text-sm group-open:hidden">Edit</span>
                  </summary>
                  <div className="border-line space-y-4 border-t p-4">
                    <QuestionEditor
                      courseId={id}
                      bankId={bank.id}
                      question={q as unknown as EditableQuestion}
                    />
                    <form action={archiveQuestionAction} className="border-line border-t pt-4">
                      <input type="hidden" name="courseId" value={id} />
                      <input type="hidden" name="questionId" value={q.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove from bank
                      </Button>
                      <p className="text-muted mt-1 text-xs">
                        Past attempts keep their copy of the question.
                      </p>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}

        <section className="border-line bg-surface border p-5">
          <h3 className="font-display text-h3 mb-5">Add a question</h3>
          <QuestionEditor key={bank.questions.length} courseId={id} bankId={bank.id} />
        </section>
      </div>
      <aside>
        <BankSettings courseId={id} bankId={bank.id} title={bank.title} />
      </aside>
    </div>
  );
}
