import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { rubricMax } from "@/server/assessment/scoring";
import { buttonClasses } from "@/ui/button";
import { EmptyState } from "@/ui/primitives";

export const metadata: Metadata = { title: "Rubrics" };

export default async function RubricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const rubrics = await db.rubric.findMany({
    where: { courseId: id },
    orderBy: { createdAt: "asc" },
    include: { criteria: { include: { levels: true } }, _count: { select: { assignments: true } } },
  });
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted max-w-2xl">
          Rubrics set out what good work looks like. Attach one to an assignment to mark with it.
        </p>
        <Link href={`/teach/courses/${id}/rubrics/new`} className={buttonClasses("primary")}>
          New rubric
        </Link>
      </div>
      {rubrics.length === 0 ? (
        <EmptyState title="No rubrics yet" />
      ) : (
        <ul className="divide-line border-line divide-y border-y">
          {rubrics.map((r) => (
            <li key={r.id}>
              <Link
                href={`/teach/courses/${id}/rubrics/${r.id}`}
                className="hover:bg-sunk flex min-h-14 items-center gap-4 py-3 sm:px-2"
              >
                <span className="flex-1 font-medium">{r.title}</span>
                <span className="text-muted font-mono text-xs">
                  {r.criteria.length} criteria · {rubricMax(r)} pts · {r._count.assignments} assignment
                  {r._count.assignments === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
