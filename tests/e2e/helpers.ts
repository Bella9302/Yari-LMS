import { readFileSync } from "node:fs";
import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { generateTOTP } from "@oslojs/otp";

interface ProjectFixtures {
  admin: { email: string; totpKey: string };
  trainer: { email: string };
  manager: { email: string };
  staffName: string;
  builder: { email: string; totpKey: string };
  student: { email: string; fullName: string };
  invite: { token: string; email: string; idNumber: string };
}

export function fixtures(testInfo: TestInfo): ProjectFixtures & { password: string; orgA: string } {
  const all = JSON.parse(readFileSync(".e2e/fixtures.json", "utf8"));
  return { ...all[testInfo.project.name], password: all.password, orgA: all.orgA };
}

export function totp(base64Key: string) {
  return generateTOTP(new Uint8Array(Buffer.from(base64Key, "base64")), 30, 6);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until the app has accepted it. */
export async function signedIn(page: Page, email: string, password: string) {
  await signIn(page, email, password);
  await page.waitForURL(/\/(dashboard|setup-2fa|login\/2fa)/);
}

/** Signs in and completes the TOTP step. */
export async function signInWith2fa(page: Page, email: string, password: string, totpKey: string) {
  await signIn(page, email, password);
  await page.waitForURL(/\/login\/2fa/);
  await page.getByLabel("Verification code").fill(totp(totpKey));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/dashboard$/);
}

/** No sideways scrolling on phones. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** WCAG 2.1 A/AA automated checks. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}
