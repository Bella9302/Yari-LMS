"use client";

import { useState } from "react";
import { EnrolForm } from "@/ui/enrol-form";
import { Field, Select } from "@/ui/field";

export function OrgEnrol({
  organizationId,
  courses,
  staff,
}: {
  organizationId: string;
  courses: { id: string; title: string; enrolledUserIds: string[] }[];
  staff: { id: string; name: string; detail: string }[];
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === courseId);
  if (courses.length === 0)
    return <p className="text-muted text-sm">No catalogue courses are available yet.</p>;
  return (
    <div className="space-y-5">
      <Field label="Course" name="enrol-course">
        {(p) => (
          <Select {...p} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {course && (
        <EnrolForm
          key={course.id}
          courseId={course.id}
          organizationId={organizationId}
          people={staff.filter((s) => !course.enrolledUserIds.includes(s.id))}
        />
      )}
    </div>
  );
}
