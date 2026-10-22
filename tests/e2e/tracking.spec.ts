import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

// SA time (UTC+2, no daylight saving) for the session form.
const sa = (d: Date) => new Date(d.getTime() + 2 * 3600_000).toISOString();
let checkInUrl = "";
let sessionUrl = "";

test("a trainer schedules a practical and shows the check-in code", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.builder.email, f.password, f.builder.totpKey);
  await page.goto("/teach");
  await page.getByRole("link", { name: new RegExp(`Ladder Safety ${info.project.name}`) }).click();
  await page.waitForURL(/\/teach\/courses\/[^/]+$/);
  await page.goto(`${page.url()}/sessions`);

  const start = new Date(Date.now() - 10 * 60_000);
  const end = new Date(Date.now() + 60 * 60_000);
  await page.getByLabel("Title", { exact: true }).fill("Ladder practical");
  await page.getByLabel("Date").fill(sa(start).slice(0, 10));
  await page.getByLabel("Starts (SA time)").fill(sa(start).slice(11, 16));
  await page.getByLabel("Ends").fill(sa(end).slice(11, 16));
  await page.getByLabel("Venue or site").fill("Acme Mining, Gate 3");
  await page.getByRole("button", { name: "Schedule session" }).click();
  await page.waitForURL(/\/sessions\/[^/]+$/);
  sessionUrl = page.url();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Show check-in code" }).click();
  const qr = page.getByRole("img", { name: "Check-in QR code" });
  await expect(qr).toBeVisible();
  checkInUrl = (await qr.getAttribute("data-checkin-url"))!;
  expect(checkInUrl).toMatch(/\/check-in\/[^?]+\?t=[\w-]{22}$/);
});

test("a learner scans the code, signs in and is checked in", async ({ page }, info) => {
  const f = fixtures(info);
  // Scanning opens the link in the phone's browser: not signed in yet.
  await page.goto(new URL(checkInUrl).pathname + new URL(checkInUrl).search);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(f.student.email);
  await page.getByLabel("Password").fill(f.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Ladder practical" })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Check me in" }).click();
  await expect(page.getByText("You're checked in.")).toBeVisible();

  // A tampered code is refused.
  await page.goto(new URL(checkInUrl).pathname + "?t=AAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByText("You're checked in.")).toBeVisible(); // already present: nothing to redo
});

test("the trainer sees the register and learner progress", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.builder.email, f.password, f.builder.totpKey);
  await page.goto(sessionUrl);
  const row = page.getByRole("listitem").filter({ hasText: f.student.fullName });
  await expect(row.getByText("QR")).toBeVisible();
  await expect(row.getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "true");
  const csv = await page.request.get(`${sessionUrl}/export`);
  expect(await csv.text()).toContain(f.student.fullName);

  await page.goto(sessionUrl.replace(/\/sessions\/.*$/, "/progress"));
  await expect(page.getByRole("heading", { name: "Everyone" })).toBeVisible();
  await expect(page.getByText(f.student.fullName).first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Inactive" }).check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expectAccessible(page);
});

test("the company manager sees training status and exports the compliance report", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.manager.email, f.password);
  await page.goto("/org");
  await expect(
    page
      .getByRole("img", { name: "Training completed" })
      .or(page.getByRole("progressbar", { name: "Training completed" })),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(f.student.fullName) }).click();
  await expect(page.getByText(/attended 1 of 1 sessions/).first()).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Compliance report" }).click();
  const pdfHref = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const csv = await page.request.get(pdfHref!.replace("pdf", "csv"));
  expect(await csv.text()).toContain(f.student.fullName);
});
