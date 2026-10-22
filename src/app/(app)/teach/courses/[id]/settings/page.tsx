import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { removeCoverAction } from "@/server/actions/courses";
import { getEditableCourse } from "@/server/courses/queries";
import { COVER_RULE } from "@/lib/file-types";
import { Button } from "@/ui/button";
import { FileUploader } from "@/ui/file-uploader";
import { isSuperAdmin } from "@/server/rbac";
import { accreditationSettings } from "@/server/settings";
import { courseAccreditationSchema, formatUnitStandards } from "@/lib/certificates";
import { DeleteCourseForm, SettingsForm } from "./settings-form";
import { CourseAccreditationForm } from "./accreditation-form";

export const metadata: Metadata = { title: "Course settings" };

export default async function CourseSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  const course = await getEditableCourse({ id: user.id, roles: user.roles }, id);
  // Accreditation details only matter (and are only editable) once YARI GROUP is accredited.
  const showAccreditation = isSuperAdmin(user.roles) && (await accreditationSettings()).enabled;
  const accreditation = courseAccreditationSchema.safeParse(course.accreditation ?? {});
  const acc = accreditation.success ? accreditation.data : courseAccreditationSchema.parse({});

  return (
    <div className="grid max-w-4xl gap-12 lg:grid-cols-[1fr_18rem]">
      <SettingsForm
        course={{
          id: course.id,
          title: course.title,
          summary: course.summary,
          category: course.category,
          visibility: course.visibility,
          estMinutes: course.estMinutes,
        }}
      />
      <aside className="space-y-8">
        <section className="space-y-3">
          <h2 className="font-display text-h3">Cover image</h2>
          {course.coverAsset && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file */}
              <img
                src={`/api/files/${course.coverAsset.id}`}
                alt=""
                className="border-line aspect-[16/9] w-full border object-cover"
                loading="lazy"
              />
              <form action={removeCoverAction}>
                <input type="hidden" name="courseId" value={course.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove image
                </Button>
              </form>
            </div>
          )}
          <FileUploader
            purpose="cover"
            courseId={course.id}
            rule={COVER_RULE}
            label={course.coverAsset ? "Replace image" : "Choose an image"}
          />
        </section>
        {showAccreditation && (
          <section className="border-line space-y-3 border-t pt-6">
            <h2 className="font-display text-h3">Accreditation</h2>
            <CourseAccreditationForm
              courseId={course.id}
              current={{
                unitStandards: formatUnitStandards(acc.unitStandards),
                nqfLevel: acc.nqfLevel ? String(acc.nqfLevel) : "",
                credits: acc.credits ? String(acc.credits) : "",
              }}
            />
          </section>
        )}
        {course.status === "DRAFT" && course._count.enrolments === 0 && !course.isTemplate && (
          <section className="border-line border-t pt-6">
            <DeleteCourseForm courseId={course.id} />
          </section>
        )}
      </aside>
    </div>
  );
}
