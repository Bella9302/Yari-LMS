import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addItem, createCourse, enrolLearners, setCourseStatus, updateItem } from "@/server/courses/builder";
import { completeItem } from "@/server/courses/learner";
import {
  adminCertificates,
  backfillCertificates,
  certificateForDownload,
  eraseCertificateHolder,
  myCertificates,
  reissueCertificate,
  revokeCertificate,
  verifyCertificate,
} from "@/server/certificates/service";
import { setCourseAccreditation } from "@/server/certificates/course-accreditation";
import { accreditationSettings, siteSettings, updateSettings } from "@/server/settings";
import { getEnquiry, listEnquiries, submitEnquiry, EnquiryRejected } from "@/server/public/enquiries";
import { publicCourse, publicCourses } from "@/server/public/catalogue";
import { BRAND } from "@/lib/brand";
import { PermissionError } from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, trainer: U, manager: U, otherManager: U, learner: U, other: U, orgId: string;
const doc = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});

async function courseWithItem(title: string, opts: { public?: boolean } = {}) {
  const course = await createCourse(trainer, { title, category: "HEALTH_SAFETY" });
  const mod = await db.module.findFirstOrThrow({ where: { courseId: course.id } });
  const item = await addItem(trainer, mod.id, "RICH_TEXT", "Only item");
  await updateItem(trainer, item.id, {
    title: "Only item",
    required: true,
    published: true,
    estMinutes: null,
    body: doc("Hi"),
  });
  await db.course.update({
    where: { id: course.id },
    data: { estMinutes: 480, visibility: opts.public ? "PUBLIC" : "PRIVATE" },
  });
  await setCourseStatus(trainer, course.id, "PUBLISHED");
  return { course, item };
}

beforeAll(async () => {
  const org = await createOrg();
  const org2 = await createOrg();
  orgId = org.id;
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  trainer = await createUser({ roles: [{ role: "TRAINER" }], fullName: "Nomsa Dlamini" });
  manager = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: org.id }] });
  otherManager = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: org2.id }] });
  learner = await createUser({
    roles: [{ role: "LEARNER" }],
    memberOf: [org.id],
    fullName: "Thandiwe Mokoena",
  });
  other = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [org.id] });
});

describe("certificates", () => {
  it("are issued on completion, once, with a notification", async () => {
    const { course, item } = await courseWithItem("Working at Heights");
    await enrolLearners(admin, course.id, [learner.id], { organizationId: orgId });
    await completeItem(learner.id, item.id);
    await completeItem(learner.id, item.id);
    const certs = await db.certificate.findMany({ where: { courseId: course.id } });
    expect(certs).toHaveLength(1);
    expect(certs[0]!.code).toMatch(/^YG-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    // The holder's name is encrypted at rest.
    expect(certs[0]!.holderEnc).not.toContain("Thandiwe");
    expect(await db.notification.count({ where: { userId: learner.id, type: "CERTIFICATE" } })).toBe(1);

    const v = await verifyCertificate(certs[0]!.code.toLowerCase());
    expect(v).toMatchObject({
      status: "valid",
      learnerName: "Thandiwe Mokoena",
      courseTitle: "Working at Heights",
    });
    if (v.status === "valid") {
      expect(v.wording.statement).toBe(BRAND.nonAccreditationStatement);
      expect(v).not.toHaveProperty("trainers");
    }
  });

  it("freeze what was printed, even if the course is renamed later", async () => {
    const { course, item } = await courseWithItem("Fire Marshal Basics");
    await enrolLearners(admin, course.id, [learner.id]);
    await completeItem(learner.id, item.id);
    await db.course.update({ where: { id: course.id }, data: { title: "Fire Marshal (2027 edition)" } });
    const [mine] = (await myCertificates(learner.id)).filter((c) => c.course?.slug === course.slug);
    expect(mine!.courseTitle).toBe("Fire Marshal Basics");
    const pdfDoc = await certificateForDownload(learner, mine!.code);
    expect(pdfDoc.trainers).toEqual(["Nomsa Dlamini"]);
    expect(pdfDoc.durationMinutes).toBe(480);
  });

  it("can be downloaded by the holder, an admin and their company's manager only", async () => {
    const cert = await db.certificate.findFirstOrThrow({
      where: { userId: learner.id, courseTitle: "Working at Heights" },
    });
    await expect(certificateForDownload(learner, cert.code)).resolves.toMatchObject({ code: cert.code });
    await expect(certificateForDownload(admin, cert.code)).resolves.toMatchObject({ code: cert.code });
    await expect(certificateForDownload(manager, cert.code)).resolves.toMatchObject({ code: cert.code });
    await expect(certificateForDownload(otherManager, cert.code)).rejects.toThrow(PermissionError);
    await expect(certificateForDownload(other, cert.code)).rejects.toThrow(PermissionError);
    await expect(certificateForDownload(trainer, cert.code)).rejects.toThrow(PermissionError);
    expect(await db.auditLog.count({ where: { action: "certificate.downloaded", entityId: cert.id } })).toBe(
      2,
    );
  });

  it("can be revoked and reissued by an admin; the old code stops verifying", async () => {
    const cert = await db.certificate.findFirstOrThrow({
      where: { userId: learner.id, courseTitle: "Working at Heights" },
    });
    await expect(revokeCertificate(trainer, cert.code, "Wrong")).rejects.toThrow(PermissionError);
    const fresh = await reissueCertificate(admin, cert.code);
    expect(fresh.code).not.toBe(cert.code);
    expect(await verifyCertificate(cert.code)).toMatchObject({ status: "revoked" });
    expect(await verifyCertificate(fresh.code)).toMatchObject({ status: "valid" });
    await expect(certificateForDownload(learner, cert.code)).rejects.toThrow(PermissionError);
    // The public result never includes the internal reason.
    expect(JSON.stringify(await verifyCertificate(cert.code))).not.toContain("Replaced");
    const listed = await adminCertificates(admin, cert.code.toLowerCase());
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      learnerName: "Thandiwe Mokoena",
      revokeReason: "Replaced by a reissued certificate",
    });
  });

  it("are backfilled for courses completed before certificates existed", async () => {
    const { course } = await courseWithItem("Legacy course");
    await enrolLearners(admin, course.id, [other.id]);
    await db.enrolment.updateMany({
      where: { courseId: course.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    expect(await backfillCertificates({ courseId: course.id })).toBe(1);
    expect(await backfillCertificates({ courseId: course.id })).toBe(0);
  });

  it("stay unaccredited until the platform is accredited, whatever the course says", async () => {
    const { course, item } = await courseWithItem("Accreditable course");
    await setCourseAccreditation(admin, course.id, {
      unitStandards: "259617 — Apply AI tools safely",
      nqfLevel: "4",
      credits: "12",
    });
    await expect(
      setCourseAccreditation(trainer, course.id, { unitStandards: "1 — x", nqfLevel: "", credits: "" }),
    ).rejects.toThrow(PermissionError);
    const [a, b] = await Promise.all([
      createUser({ roles: [{ role: "LEARNER" }] }),
      createUser({ roles: [{ role: "LEARNER" }] }),
    ]);
    await enrolLearners(admin, course.id, [a.id, b.id]);
    await completeItem(a.id, item.id);
    const before = await db.certificate.findFirstOrThrow({ where: { userId: a.id } });
    expect(before.accreditation).toBeNull();

    await expect(
      updateSettings(admin, "accreditation", { enabled: true, body: "", providerNumber: "" }),
    ).rejects.toThrow();
    await updateSettings(admin, "accreditation", {
      enabled: true,
      body: "QCTO",
      providerNumber: "07-QCTO/SDP040523",
    });
    await completeItem(b.id, item.id);
    const after = await db.certificate.findFirstOrThrow({ where: { userId: b.id } });
    const v = await verifyCertificate(after.code);
    expect(v.status === "valid" && v.wording.accredited).toBe(true);
    // Earlier certificates are unchanged.
    const old = await verifyCertificate(before.code);
    expect(old.status === "valid" && old.wording.statement).toBe(BRAND.nonAccreditationStatement);
    await updateSettings(admin, "accreditation", { enabled: false, body: "", providerNumber: "" });
    expect((await accreditationSettings()).enabled).toBe(false);
  });

  it("are erased with the holder's account", async () => {
    const victim = await createUser({ roles: [{ role: "LEARNER" }], fullName: "Erase Me" });
    const { course, item } = await courseWithItem("Erasure course");
    await enrolLearners(admin, course.id, [victim.id]);
    await completeItem(victim.id, item.id);
    const cert = await db.certificate.findFirstOrThrow({ where: { userId: victim.id } });
    await eraseCertificateHolder(victim.id);
    const v = await verifyCertificate(cert.code);
    expect(v.status).toBe("revoked");
    expect(JSON.stringify(v)).not.toContain("Erase Me");
    expect((await db.certificate.findUniqueOrThrow({ where: { id: cert.id } })).holderEnc).toBeNull();
  });

  it("reject unknown codes", async () => {
    expect(await verifyCertificate("YG-2222-2222")).toEqual({ status: "invalid" });
    expect(await verifyCertificate("nonsense")).toEqual({ status: "invalid" });
  });
});

describe("settings", () => {
  it("fall back to defaults when a stored value is invalid", async () => {
    await db.platformSetting.upsert({
      where: { key: "site" },
      create: { key: "site", value: { academyName: 42 } },
      update: { value: { academyName: 42 } },
    });
    expect((await siteSettings()).academyName).toBe(BRAND.academyName);
    await expect(updateSettings(trainer, "site", { academyName: "X Academy" })).rejects.toThrow(
      PermissionError,
    );
    await updateSettings(admin, "site", { academyName: "YARI Academy", contactEmail: "", contactPhone: "" });
  });
});

describe("public catalogue", () => {
  it("lists only published, public, non-template courses", async () => {
    const { course: pub } = await courseWithItem("Public course", { public: true });
    const { course: priv } = await courseWithItem("Private course");
    const slugs = (await publicCourses()).map((c) => c.slug);
    expect(slugs).toContain(pub.slug);
    expect(slugs).not.toContain(priv.slug);
    expect(await publicCourse(priv.slug)).toBeNull();
    const detail = await publicCourse(pub.slug);
    expect(detail?.modules[0]?.items.map((i) => i.title)).toEqual(["Only item"]);
    await setCourseStatus(trainer, pub.id, "ARCHIVED");
    expect(await publicCourse(pub.slug)).toBeNull();
  });
});

describe("enquiries", () => {
  const valid = {
    name: "Lindiwe Khumalo",
    email: "lindiwe@acme.co.za",
    phone: "082 123 4567",
    company: "Acme Mining",
    interest: "SHE" as const,
    courseId: "",
    message: "We need SHE rep training for 20 staff in Rustenburg.",
    consent: true as const,
  };

  it("are stored encrypted and announced to admins without the details", async () => {
    const { id } = await submitEnquiry(valid, "198.51.100.7");
    const raw = await db.enquiry.findUniqueOrThrow({ where: { id } });
    expect(JSON.stringify(raw)).not.toMatch(/Lindiwe|lindiwe@|082 123|Rustenburg/);
    const note = await db.notification.findFirstOrThrow({
      where: { userId: admin.id, type: "ENQUIRY", href: `/admin/enquiries/${id}` },
    });
    expect(note.title).not.toContain("Lindiwe");
    expect(await getEnquiry(admin, id)).toMatchObject({
      name: "Lindiwe Khumalo",
      phone: "082 123 4567",
      message: valid.message,
    });
    await expect(listEnquiries(trainer)).rejects.toThrow(PermissionError);
  });

  it("need consent and valid details, and are rate-limited per connection", async () => {
    await expect(submitEnquiry({ ...valid, consent: false }, "198.51.100.8")).rejects.toThrow();
    await expect(submitEnquiry({ ...valid, email: "nope" }, "198.51.100.8")).rejects.toThrow();
    for (let i = 0; i < 5; i++) await submitEnquiry(valid, "198.51.100.9");
    await expect(submitEnquiry(valid, "198.51.100.9")).rejects.toThrow(EnquiryRejected);
  });
});
