import { expect, test } from "@playwright/test";
import { expectAccessible, fixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a learner asks for a copy of their data", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await page.goto("/account/privacy");
  const card = page.locator("form").filter({ hasText: "Download my data" });
  await card.getByRole("button", { name: "Request" }).click();
  await expect(card.getByText("Request received")).toBeVisible();
});

test("an admin approves it and the learner downloads it", async ({ page, browser }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.admin.email, f.password, f.admin.totpKey);
  await page.goto("/admin/data-requests");
  const row = page
    .getByRole("listitem")
    .filter({ hasText: f.student.fullName })
    .filter({ hasText: "copy of their data" });
  await expectAccessible(page);
  await row.getByRole("button", { name: "Make download available" }).click();
  await expect(row.getByText("completed")).toBeVisible();

  const learner = await browser.newPage();
  await signedIn(learner, f.student.email, f.password);
  await learner.goto("/account/privacy");
  await expect(learner.getByText("Your copy is ready")).toBeVisible();
  const res = await learner.request.get("/account/privacy/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  const data = await res.json();
  expect(data.profile.fullName).toBe(f.student.fullName);
  expect(data.training.length).toBeGreaterThan(0);
  await learner.close();
});
