import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { EmptyState } from "@/ui/primitives";
import { CreateBankForm } from "./bank-forms";

export const metadata: Metadata = { title: "Question banks" };

export default async function QuestionBanksPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const banks = await db.questionBank.findMany({
    where: { courseId: id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { questions: { where: { archived: false } }, sections: true } } },
  });

  return (
    <div className="space-y-8">
      <p className="text-muted max-w-2xl">
        Questions live in banks. A quiz draws all, or a random set, from one or more banks — so each learner
        can get a different mix.
      </p>
      {banks.length === 0 ? (
        <EmptyState title="No question banks yet">Create a bank, then add questions to it.</EmptyState>
      ) : (
        <ul className="divide-line border-line divide-y border-y">
          {banks.map((b) => (
            <li key={b.id}>
              <Link
                href={`/teach/courses/${id}/questions/${b.id}`}
                className="hover:bg-sunk flex min-h-14 items-center gap-4 py-3 sm:px-2"
              >
                <span className="flex-1 font-medium">{b.title}</span>
                <span className="text-muted font-mono text-xs">
                  {b._count.questions} questions · used by {b._count.sections} quiz
                  {b._count.sections === 1 ? "" : "zes"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateBankForm courseId={id} />
    </div>
  );
}
