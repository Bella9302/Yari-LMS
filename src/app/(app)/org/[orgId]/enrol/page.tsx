import type { Metadata } from "next";
import { db } from "@/server/db";
import { requireRole } from "@/server/guards";
import { listUsers } from "@/server/pii/users";
import { OrgEnrol } from "./org-enrol";

export const metadata: Metadata = { title: "Enrol staff" };

export default async function OrgEnrolPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { user } = await requireRole("CLIENT_MANAGER");
  const { orgId } = await params;
  const [staff, courses] = await Promise.all([
    listUsers({ id: user.id, roles: user.roles }, { organizationId: orgId }),
    db.course.findMany({
      where: { status: "PUBLISHED", visibility: "PUBLIC", isTemplate: false },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        enrolments: {
          where: { organizationId: orgId, status: { not: "WITHDRAWN" } },
          select: { userId: true },
        },
      },
    }),
  ]);
  return (
    <section className="border-line bg-surface max-w-2xl border p-5">
      <h2 className="font-display text-h3 mb-1">Enrol staff on a course</h2>
      <p className="text-muted mb-5 text-sm">
        Choose a course from the YARI catalogue, then the people to enrol. Set a due date to track compliance.
      </p>
      <OrgEnrol
        organizationId={orgId}
        courses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          enrolledUserIds: c.enrolments.map((e) => e.userId),
        }))}
        staff={staff
          .filter((s) => s.status !== "SUSPENDED")
          .map((s) => ({ id: s.id, name: s.fullName, detail: s.email }))}
      />
    </section>
  );
}
