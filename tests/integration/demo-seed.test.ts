import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { seedDemo } from "@/server/demo/seed";
import { trainerSummary } from "@/server/engagement/ratings";
import { getCompanyOverview } from "@/server/tracking/company";

describe("demo data", () => {
  it("builds the brief's demo: 2 courses, 1 admin, 2 trainers, 10 learners, 1 company with a manager", async () => {
    const logins = await seedDemo({ password: "demo password for tests" });
    expect(logins).not.toBeNull();
    const roles = logins!.people.map((p) => p.role);
    expect(roles.filter((r) => r === "Learner")).toHaveLength(10);
    expect(roles.filter((r) => r.startsWith("Trainer"))).toHaveLength(2);
    expect(logins!.people.filter((p) => p.totp)).toHaveLength(3); // admin + trainers use 2FA

    const courses = await db.course.findMany({
      where: {
        title: { in: ["SHE Representative Practical Training", "AI Tools for the Workplace"] },
        status: "PUBLISHED",
      },
    });
    expect(courses).toHaveLength(2);
    const she = courses.find((c) => c.category === "HEALTH_SAFETY")!;

    // Quizzes, a rubric-marked assignment, certificates for those who finished.
    expect(
      await db.quizAttempt.count({ where: { quiz: { item: { module: { courseId: she.id } } } } }),
    ).toBeGreaterThanOrEqual(5);
    expect(
      await db.mark.count({
        where: { status: "RELEASED", submission: { assignment: { rubricId: { not: null } } } },
      }),
    ).toBeGreaterThanOrEqual(3);
    expect(await db.certificate.count({ where: { courseId: she.id, revokedAt: null } })).toBe(3);
    const ai = courses.find((c) => c.category === "AI_DIGITAL")!;
    expect(await db.certificate.count({ where: { courseId: ai.id, revokedAt: null } })).toBe(2);

    // Ratings are visible to the trainer (enough of them), and someone is flagged at risk.
    const nomsaUser = await db.user.findFirstOrThrow({
      where: { courseStaff: { some: { courseId: she.id } }, roles: { some: { role: "TRAINER" } } },
    });
    const summary = await trainerSummary(nomsaUser.id);
    expect(summary.enough).toBe(true);
    expect(
      await db.atRiskFlag.count({ where: { enrolment: { courseId: she.id }, resolvedAt: null } }),
    ).toBeGreaterThanOrEqual(1);

    // The company dashboard has something to show.
    const marker = await db.platformSetting.findUniqueOrThrow({ where: { key: "demo" } });
    const orgId = (marker.value as { orgId: string }).orgId;
    const admin = await db.user.findFirstOrThrow({
      where: { roles: { some: { role: "SUPER_ADMIN" } }, status: "ACTIVE" },
    });
    const overview = await getCompanyOverview(
      { id: admin.id, roles: [{ role: "SUPER_ADMIN", organizationId: null }] },
      orgId,
    );
    expect(overview.stats.completed).toBeGreaterThanOrEqual(5);
    expect(await db.enquiry.count()).toBeGreaterThanOrEqual(2);

    // Running it again does nothing.
    expect(await seedDemo()).toBeNull();
  }, 120_000);
});
