import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { ItemTypeIcon } from "@/ui/item-type";
import { EmptyState, Tag } from "@/ui/primitives";

export const metadata: Metadata = { title: "Marking" };

export default async function MarkingPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const items = await db.item.findMany({
    where: { module: { courseId: id }, type: { in: ["QUIZ", "ASSIGNMENT"] } },
    orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      quiz: { select: { _count: { select: { attempts: { where: { status: "NEEDS_MARKING" } } } } } },
      assignment: {
        select: {
          dueAt: true,
          _count: {
            select: {
              submissions: {
                where: { status: "SUBMITTED", OR: [{ mark: null }, { mark: { status: "DRAFT" } }] },
              },
            },
          },
        },
      },
    },
  });

  if (items.length === 0) {
    return <EmptyState title="Nothing to mark">Add a quiz or an assignment to the course first.</EmptyState>;
  }
  return (
    <ul className="divide-line border-line divide-y border-y">
      {items.map((i) => {
        const waiting = i.quiz?._count.attempts ?? i.assignment?._count.submissions ?? 0;
        return (
          <li key={i.id}>
            <Link
              href={`/teach/courses/${id}/marking/${i.id}`}
              className="hover:bg-sunk flex min-h-16 items-center gap-4 py-3 sm:px-2"
            >
              <ItemTypeIcon type={i.type} className="text-muted size-5" />
              <span className="flex-1 font-medium">{i.title}</span>
              {waiting > 0 ? (
                <Tag tone="accent">{waiting} to mark</Tag>
              ) : (
                <span className="text-muted text-sm">Up to date</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
