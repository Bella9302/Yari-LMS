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
  heights: { id: string; slug: string; title: string };
  facilitator: { email: string; totpKey: string };
  aiAtWork: { slug: string; title: string };
}

export function fixtures(testInfo: TestInfo): ProjectFixtures & { password: string; orgA: string } {
  const all = JSON.parse(readFileSync(".e2e/fixtures.json", "utf8"));
  return { ...all[testInfo.project.name], password: all.password, orgA: all.orgA };
}

export interface DemoFixtures {
  orgId: string;
  admin: { email: string; totpBase32: string };
  trainer: { email: string; totpBase32: string };
  manager: { email: string };
  learner: { email: string };
}

export function demoFixtures(): DemoFixtures & { password: string } {
  const all = JSON.parse(readFileSync(".e2e/fixtures.json", "utf8"));
  return { ...all.demo, password: all.password };
}

/** Converts an authenticator key as shown to people (base32, spaced) to the base64 the helpers use. */
export function base32ToBase64(key: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of key.replace(/\s+/g, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = bits.match(/.{8}/g)!.map((b) => parseInt(b, 2));
  return Buffer.from(bytes).toString("base64");
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

/**
 * Signs in and completes the TOTP step. A code can only be used once (replay protection), so if
 * this user already signed in during the current 30-second window, wait for the next code.
 */
export async function signInWith2fa(page: Page, email: string, password: string, totpKey: string) {
  await signIn(page, email, password);
  await page.waitForURL(/\/login\/2fa/);
  for (let tries = 0; tries < 2; tries++) {
    await page.getByLabel("Verification code").fill(totp(totpKey));
    await page.getByRole("button", { name: "Verify" }).click();
    const ok = await page
      .waitForURL(/\/dashboard$/, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return;
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
  }
  throw new Error("Two-step sign-in failed");
}

/** No sideways scrolling on phones. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** WCAG 2.1 A/AA automated checks. */
export async function expectAccessible(page: Page) {
  // Let entrance animations finish so contrast is measured on the final colours.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}
