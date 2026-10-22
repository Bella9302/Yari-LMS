import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { getRubric } from "@/server/assessment/authoring";
import { duplicateRubricAction } from "@/server/actions/assessment";
import { Button } from "@/ui/button";
import { RubricEditor } from "@/ui/rubric-editor";
import { DeleteRubricForm } from "./delete-form";

export const metadata: Metadata = { title: "Rubric" };

export default async function RubricPage({ params }: { params: Promise<{ id: string; rubricId: string }> }) {
  const { user } = await requireUser();
  const { id, rubricId } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const rubric = await getRubric(rubricId);
  if (!rubric || rubric.courseId !== id) notFound();
  const marked = await db.mark.count({ where: { submission: { assignment: { rubricId } } } });

  return (
    <div className="space-y-6">
      <Link href={`/teach/courses/${id}/rubrics`} className="eyebrow hover:text-fg">
        ← Rubrics
      </Link>
      <RubricEditor courseId={id} rubricId={rubric.id} initial={rubric} locked={marked > 0} />
      <div className="border-line flex flex-wrap gap-3 border-t pt-6">
        <form action={duplicateRubricAction}>
          <input type="hidden" name="courseId" value={id} />
          <input type="hidden" name="rubricId" value={rubric.id} />
          <Button type="submit" variant="secondary">
            Duplicate
          </Button>
        </form>
        <DeleteRubricForm courseId={id} rubricId={rubric.id} />
      </div>
    </div>
  );
}
