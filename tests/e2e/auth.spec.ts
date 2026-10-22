import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signIn, totp } from "./helpers";

test("protected pages send visitors to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test("a wrong password gets a generic error", async ({ page }, info) => {
  const f = fixtures(info);
  await signIn(page, f.manager.email, "not the right password");
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
  await signIn(page, "nobody@example.co.za", "not the right password");
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
});

test("an invited learner sets up their account", async ({ page }, info) => {
  const f = fixtures(info);
  await page.goto(`/invite/${f.invite.token}`);
  await expect(page.getByText(f.invite.email)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);

  // Server-side validation: a bad SA ID number is rejected.
  await page.getByLabel("SA ID number").fill("8001015009088");
  await page.getByLabel("New password", { exact: true }).fill("a long enough passphrase");
  await page.getByLabel("Confirm new password").fill("a long enough passphrase");
  await page.getByRole("checkbox", { name: /I have read the privacy notice/ }).check();
  await page.getByRole("checkbox", { name: /I accept the terms/ }).check();
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText("isn't a valid South African ID number")).toBeVisible();

  await page.getByLabel("SA ID number").fill(f.invite.idNumber);
  await page.getByLabel("New password", { exact: true }).fill("a long enough passphrase");
  await page.getByLabel("Confirm new password").fill("a long enough passphrase");
  await page.getByRole("button", { name: "Create my account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Hello, Lerato/ })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The learner sees their own ID masked.
  await page.goto("/account");
  await expect(page.getByText(`*********${f.invite.idNumber.slice(-4)}`)).toBeVisible();
  await expect(page.getByText(f.invite.idNumber)).toHaveCount(0);

  // The link is single-use.
  await page.context().clearCookies();
  await page.goto(`/invite/${f.invite.token}`);
  await expect(page.getByRole("heading", { name: "This invitation has expired" })).toBeVisible();
});

test("an admin signs in with two-step verification", async ({ page }, info) => {
  const f = fixtures(info);
  await signIn(page, f.admin.email, f.password);
  await expect(page).toHaveURL(/\/login\/2fa/);
  await expectAccessible(page);

  // Can't skip the second step.
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\/2fa/);

  await page.getByLabel("Verification code").fill(totp(f.admin.totpKey));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(page.getByText(f.staffName)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);

  await page.goto("/admin/audit");
  await expect(page.getByText("pii.viewed").first()).toBeVisible();
});

test("a trainer must set up two-step verification first", async ({ page }, info) => {
  const f = fixtures(info);
  await signIn(page, f.trainer.email, f.password);
  await expect(page).toHaveURL(/\/setup-2fa$/);
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/setup-2fa$/);
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test("a client manager sees only their own company", async ({ page }, info) => {
  const f = fixtures(info);
  await signIn(page, f.manager.email, f.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/org");
  await expect(page.getByRole("heading", { name: f.orgA })).toBeVisible();
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("table").getByText(f.staffName)).toBeVisible();
  await expect(page.getByText("Busisiwe Other-Company")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);

  const res = await page.goto("/admin/users");
  expect(res?.status()).toBe(404);
});

test("the style guide passes accessibility checks in both themes", async ({ page }) => {
  await page.goto("/styleguide");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});
