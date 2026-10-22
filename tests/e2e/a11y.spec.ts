// Accessibility sweep over every main page, as each role, on the demo data (Phase 7).
// Phones get dark mode and desktops light mode, so both themes are checked at both sizes
// across the suite (the other specs run in light mode).
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { base32ToBase64, demoFixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

async function useTheme(page: Page, projectName: string) {
  const theme = projectName === "mobile" ? "dark" : "light";
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  return theme;
}

/** Visits each path and records axe violations and sideways scrolling, then reports them all at once. */
async function sweep(page: Page, paths: string[]) {
  const problems: string[] = [];
  for (const path of [...new Set(paths)]) {
    const res = await page.goto(path);
    if (!res || res.status() >= 400) {
      problems.push(`${path}: HTTP ${res?.status()}`);
      continue;
    }
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const v of violations)
      problems.push(`${path}: ${v.id} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${path}: scrolls sideways by ${overflow}px`);
  }
  expect(problems).toEqual([]);
}

/** Same-site links in the main content matching a pattern (to reach pages with ids in them). */
async function links(page: Page, path: string, pattern: RegExp, max = 6) {
  await page.goto(path);
  const hrefs = await page
    .locator("main a[href^='/']")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  // Exports and downloads are files, not pages.
  return [
    ...new Set(hrefs.filter((h) => pattern.test(h) && !/export|format=|\/certificates\//.test(h))),
  ].slice(0, max);
}

test("public pages", async ({ page }, info) => {
  await useTheme(page, info.project.name);
  const course = (await links(page, "/courses", /^\/courses\/[^/?]+$/, 1))[0]!;
  await sweep(page, [
    "/",
    "/courses",
    "/courses?category=ai-digital",
    course,
    "/enquire",
    "/verify",
    "/verify/YG-2222-2222",
    "/privacy",
    "/terms",
    "/login",
    "/forgot-password",
  ]);
});

test("keyboard users can skip straight to the content", async ({ page }, info) => {
  await useTheme(page, info.project.name);
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});

test("learner pages", async ({ page }, info) => {
  const d = demoFixtures();
  await useTheme(page, info.project.name);
  await signedIn(page, d.learner.email, d.password);
  const courses = await links(page, "/learn", /^\/learn\/[^/]+$/);
  const items = (await Promise.all(courses.map((c) => links(page, c, new RegExp(`^${c}/[^/]+$`), 4)))).flat();
  const threads = await links(page, `${courses[0]}/discussions`, /\/discussions\/[^/]+$/, 1);
  const certificates = await links(page, "/account/certificates", /^\/verify/, 1);
  await sweep(page, [
    "/dashboard",
    "/learn",
    ...courses,
    ...items,
    ...threads,
    "/calendar",
    "/notifications",
    "/announcements",
    "/ratings",
    "/account",
    "/account/security",
    "/account/privacy",
    "/account/certificates",
    "/account/badges",
    ...certificates,
  ]);
});

test("company manager pages", async ({ page }, info) => {
  const d = demoFixtures();
  await useTheme(page, info.project.name);
  await signedIn(page, d.manager.email, d.password);
  const base = `/org/${d.orgId}`;
  const staff = await links(page, `${base}/staff`, /\/staff\/[^/]+$/, 2);
  await sweep(page, ["/dashboard", base, `${base}/staff`, ...staff, `${base}/enrol`, `${base}/report`]);
});

test("trainer pages", async ({ page }, info) => {
  const d = demoFixtures();
  await useTheme(page, info.project.name);
  await signInWith2fa(page, d.trainer.email, d.password, base32ToBase64(d.trainer.totpBase32));
  const course = (await links(page, "/teach", /^\/teach\/courses\/[^/]+$/, 1))[0]!;
  const sections = [
    "",
    "/questions",
    "/rubrics",
    "/announcements",
    "/sessions",
    "/marking",
    "/progress",
    "/gradebook",
    "/people",
    "/settings",
  ].map((s) => course + s);
  const deeper = [
    ...(await links(page, `${course}/marking`, /\/marking\/.+/, 2)),
    ...(await links(page, `${course}/sessions`, /\/sessions\/[^/]+$/, 1)),
    ...(await links(page, `${course}/questions`, /\/questions\/[^/]+$/, 1)),
    ...(await links(page, course, /\/items\/[^/]+$/, 2)),
    ...(await links(page, `${course}/rubrics`, /\/rubrics\/[^/]+$/, 1)),
    ...(await links(page, `${course}/gradebook`, /\/gradebook\/[^/]+$/, 1)),
  ];
  await sweep(page, ["/teach", "/teach/new", ...sections, ...deeper, "/teach/ratings"]);
});

test("admin pages", async ({ page }, info) => {
  const d = demoFixtures();
  await useTheme(page, info.project.name);
  await signInWith2fa(page, d.admin.email, d.password, base32ToBase64(d.admin.totpBase32));
  const user = (await links(page, "/admin/users", /^\/admin\/users\/[^/]+$/, 1))[0]!;
  const enquiry = (await links(page, "/admin/enquiries", /^\/admin\/enquiries\/[^/]+$/, 1))[0]!;
  await sweep(page, [
    "/dashboard",
    "/admin/users",
    user,
    "/admin/organizations",
    "/admin/enquiries",
    enquiry,
    "/admin/certificates",
    "/admin/announcements",
    "/admin/ratings",
    "/admin/data-requests",
    "/admin/audit",
    "/admin/settings",
  ]);
});
