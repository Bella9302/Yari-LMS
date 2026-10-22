import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/guards";
import { getEditableCourse } from "@/server/courses/queries";
import { RubricEditor } from "@/ui/rubric-editor";

export const metadata: Metadata = { title: "New rubric" };

export default async function NewRubricPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  return (
    <div className="space-y-6">
      <Link href={`/teach/courses/${id}/rubrics`} className="eyebrow hover:text-fg">
        ← Rubrics
      </Link>
      <RubricEditor courseId={id} rubricId={null} />
    </div>
  );
}
