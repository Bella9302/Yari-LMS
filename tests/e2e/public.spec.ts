import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

let certCode = "";

test("a visitor reads the landing page and finds a course", async ({ page }, info) => {
  const f = fixtures(info);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("safer sites");
  // Both practices, with the services spelled as YARI GROUP lists them.
  await expect(page.getByText("Department of Employment and Labour visit preparation")).toBeVisible();
  await expect(page.getByText("SHE rep practical training", { exact: true })).toBeVisible();
  await expect(page.getByText("Digital migration", { exact: true })).toBeVisible();
  await expect(page.getByText("It is not an accredited qualification.").first()).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Courses" }).click();
  await page.waitForURL(/\/courses$/);
  const filters = page.getByRole("navigation", { name: "Filter by category" });
  await filters.getByRole("link", { name: "AI & Digital" }).click();
  await page.waitForURL(/category=ai-digital/);
  await expect(page.getByRole("link", { name: new RegExp(f.aiAtWork.title) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(f.heights.title) })).toHaveCount(0);
  await filters.getByRole("link", { name: "Health & Safety" }).click();
  await page.waitForURL(/category=health-safety/);
  await page.getByRole("link", { name: new RegExp(f.heights.title) }).click();
  await expect(page.getByRole("heading", { level: 1, name: f.heights.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What's covered" })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test("a visitor sends an enquiry about that course", async ({ page }, info) => {
  const f = fixtures(info);
  await page.goto(`/courses/${f.heights.slug}`);
  await page.getByRole("link", { name: "Enquire about this course" }).click();
  await page.waitForURL(/\/enquire\?course=/);
  await expect(page.getByLabel("A particular course?")).toHaveValue(/.+/);
  await expect(page.getByRole("radio", { name: /Health & Safety/ })).toBeChecked();

  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Please check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Please agree so we can reply to you.")).toBeVisible();

  await page.getByLabel("Your name").fill(`Lindiwe Khumalo ${info.project.name}`);
  await page.getByLabel("Company").fill("Acme Mining");
  await page.getByLabel("Email").fill("lindiwe@acme.example");
  await page
    .getByLabel("How can we help?")
    .fill("We need 20 staff trained before the DEL inspection in March.");
  await page.getByRole("checkbox", { name: /I agree that YARI GROUP/ }).check();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("We've received your enquiry")).toBeVisible();
});

test("an admin answers the enquiry", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.admin.email, f.password, f.admin.totpKey);
  await page.goto("/admin/enquiries");
  await page.getByRole("link", { name: new RegExp(`Lindiwe Khumalo ${info.project.name}`) }).click();
  await expect(page.getByRole("link", { name: "lindiwe@acme.example" })).toBeVisible();
  await expect(page.getByText("DEL inspection in March")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Mark as contacted" }).click();
  await expect(page.getByText("contacted", { exact: true })).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.getByText("Certificates are not accredited")).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test("a learner downloads their certificate", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await page.goto("/account/certificates");
  const card = page.getByRole("listitem").filter({ hasText: f.aiAtWork.title });
  await expect(card).toBeVisible();
  certCode = /YG-[2-9A-Z]{4}-[2-9A-Z]{4}/.exec((await card.textContent()) ?? "")?.[0] ?? "";
  expect(certCode).not.toBe("");
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  const pdf = await page.request.get(`/certificates/${certCode}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("anyone can verify the certificate with its code", async ({ page }, info) => {
  const f = fixtures(info);
  await page.goto("/verify");
  await expectAccessible(page);
  // Typed off paper: lower case, spaces instead of dashes.
  await page.getByLabel("Certificate code").fill(certCode.toLowerCase().replace(/-/g, " "));
  await page.getByRole("button", { name: "Check certificate" }).click();
  await page.waitForURL(new RegExp(`/verify/${certCode}$`));
  await expect(page.getByText("Genuine certificate")).toBeVisible();
  await expect(page.getByText(f.student.fullName)).toBeVisible();
  await expect(page.getByText(f.aiAtWork.title)).toBeVisible();
  await expect(page.getByText("It is not an accredited qualification.").first()).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.goto("/verify/YG-2222-2222");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  // Someone else can't download the PDF.
  expect((await page.request.get(`/certificates/${certCode}`)).status()).toBe(401);
});

test("an admin revokes it and it stops verifying", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.admin.email, f.password, f.admin.totpKey);
  await page.goto(`/admin/certificates?q=${certCode}`);
  await expect(page.getByText(f.student.fullName)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Revoke…" }).click();
  await page.getByLabel(/Reason/).fill("Issued in error during testing");
  await page.getByRole("button", { name: `Revoke ${certCode}` }).click();
  // The row now shows the revocation and its reason (admins only).
  await expect(page.getByText(/Revoked .*: Issued in error during testing/)).toBeVisible();

  await page.goto(`/verify/${certCode}`);
  await expect(page.getByRole("heading", { name: "Not valid" })).toBeVisible();
  await expect(page.getByText("Issued in error")).toHaveCount(0);
});
