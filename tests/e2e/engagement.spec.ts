import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

let threadUrl = "";

test("a trainer posts a course announcement", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.facilitator.email, f.password, f.facilitator.totpKey);
  await page.goto(`/teach/courses/${f.heights.id}/announcements`);
  await page.getByLabel("Title").fill("Bring your own harness on Friday");
  await page.getByRole("textbox", { name: "Announcement message" }).click();
  await page.keyboard.type("We meet at Gate 3 at 07:00. Hard hats on site.");
  await page.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByText(/Posted to 1 person/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bring your own harness on Friday" })).toBeVisible();
  await expectAccessible(page);
});

test("the learner sees it, rates the trainer and starts a discussion", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await expect(page.getByRole("link", { name: /Bring your own harness on Friday/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rate your trainer" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Notifications, \d\+? unread/ })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "Rate now" }).click();
  // Earlier specs may leave other ratings waiting; rate the harness practical.
  const card = page.getByRole("listitem").filter({ hasText: "Harness practical" });
  await expect(card.getByRole("heading", { name: /Nomsa Facilitator/ })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
  for (const [criterion, stars] of [
    ["Knowledge", 5],
    ["Clarity", 4],
    ["Practical relevance", 5],
    ["Engagement", 4],
  ] as const) {
    await card
      .getByRole("group", { name: new RegExp(criterion) })
      .locator("label", { hasText: `${stars} of 5` })
      .click();
  }
  await card.getByLabel("Comment").fill("Very practical, thank you.");
  await card.getByRole("button", { name: "Submit rating" }).click();
  await expect(page.getByText("Your rating has been recorded.", { exact: false })).toBeVisible();

  await page.goto(`/learn/${f.heights.slug}`);
  await page.getByRole("link", { name: "Discussions" }).click();
  await page.getByLabel("Topic").fill("Harness inspection checklist?");
  await page
    .getByLabel("Your question or comment")
    .fill("Is there a checklist we should use before each climb?");
  await page.getByRole("button", { name: "Start discussion" }).click();
  await page.waitForURL(/\/discussions\/[^/]+$/);
  threadUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "Harness inspection checklist?" })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test("the trainer is notified, replies and pins the topic", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.facilitator.email, f.password, f.facilitator.totpKey);
  await page.goto("/notifications");
  await page.getByRole("link", { name: /New discussion in .*Harness inspection checklist\?/ }).click();
  await page.waitForURL(new RegExp(threadUrl));
  // Trainers see learners' full names.
  await expect(page.getByText(f.student.fullName)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Reply" })
    .fill("Yes: use the checklist in Module 2, and tag out any damaged harness.");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText(/use the checklist in Module 2/)).toBeVisible();
  await page.getByRole("button", { name: "Pin" }).click();
  await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();
  await expectAccessible(page);
});

test("the learner sees the reply, their calendar and badges", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await page.goto("/notifications");
  await page.getByRole("link", { name: /New reply: Harness inspection checklist\?/ }).click();
  await page.waitForURL(new RegExp(threadUrl));
  const reply = page.getByRole("article", { name: "Reply 1" });
  await expect(reply.getByText("Trainer")).toBeVisible();
  await expect(reply.getByText(/use the checklist in Module 2/)).toBeVisible();
  await expect(page.getByText("Pinned")).toBeVisible();

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
  const ics = await page.request.get("/calendar/ics");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");

  await page.goto("/account/badges");
  await expect(page.getByText(/not qualifications or accreditation/)).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test("the trainer's own summary stays hidden until three people have rated", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.facilitator.email, f.password, f.facilitator.totpKey);
  await page.goto("/teach/ratings");
  await expect(page.getByText("Not enough ratings yet")).toBeVisible();
  await expect(page.getByText("Very practical, thank you.")).toHaveCount(0);
  await expectAccessible(page);
});

test("an admin sees who gave each rating", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.admin.email, f.password, f.admin.totpKey);
  await page.goto("/admin/ratings");
  // Admins see who rated (both test projects' ratings are listed, so pick this one's row).
  const row = page.locator("tr").filter({ hasText: f.student.fullName });
  await expect(row.getByText("Very practical, thank you.")).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});
