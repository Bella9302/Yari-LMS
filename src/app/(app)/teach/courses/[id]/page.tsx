import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { addModuleAction } from "@/server/actions/courses";
import { courseItemOptions, getCourseStructure, getEditableCourse } from "@/server/courses/queries";
import { Button } from "@/ui/button";
import { ReleaseRules } from "@/ui/release-rules";
import { CourseBuilder, type BuilderModule } from "./course-builder";
import { ModuleSettingsForm } from "./module-settings";

export const metadata: Metadata = { title: "Course content" };

export default async function CourseContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  await getEditableCourse({ id: user.id, roles: user.roles }, id);
  const [modules, itemOptions] = await Promise.all([getCourseStructure(id), courseItemOptions(id)]);

  const builderModules: BuilderModule[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    hasRules: m.releaseRules.length > 0,
    items: m.items.map((i) => ({
      id: i.id,
      title: i.title,
      type: i.type,
      published: i.published,
      required: i.required,
      hasRules: i._count.releaseRules > 0,
    })),
  }));

  const settings = Object.fromEntries(
    modules.map((m) => [
      m.id,
      <details key={m.id} className="group border-line border-t">
        <summary className="text-muted hover:bg-sunk hover:text-fg flex min-h-12 cursor-pointer list-none items-center px-4 text-sm">
          Module settings &amp; release conditions
        </summary>
        <div className="space-y-6 p-4">
          <ModuleSettingsForm courseId={id} moduleId={m.id} title={m.title} description={m.description} />
          <div>
            <p className="mb-3 text-sm font-medium">When does this module open?</p>
            <ReleaseRules
              courseId={id}
              target={{ moduleId: m.id }}
              rules={m.releaseRules}
              itemOptions={itemOptions}
            />
          </div>
        </div>
      </details>,
    ]),
  );

  return (
    <div className="space-y-6">
      <CourseBuilder courseId={id} initialModules={builderModules} moduleSettings={settings} />
      <form action={addModuleAction} className="flex justify-center">
        <input type="hidden" name="courseId" value={id} />
        <input type="hidden" name="title" value={`Module ${modules.length + 1}`} />
        <Button type="submit" variant="secondary">
          Add module
        </Button>
      </form>
    </div>
  );
}
