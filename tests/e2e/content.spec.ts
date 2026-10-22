import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

// A minimal valid PDF.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

const courseTitle = (project: string) => `Ladder Safety ${project}`;

async function addItem(page: Page, type: string, title: string) {
  await page.getByRole("button", { name: "Add item" }).first().click();
  await page.getByLabel("Type").selectOption({ label: type });
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForURL(/\/items\//);
}

test("a trainer builds and publishes a course", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.builder.email, f.password, f.builder.totpKey);

  await page.goto("/teach/new");
  await expect(page.getByText("SHE Rep Practical Training")).toBeVisible();
  await page.getByLabel("Course title").fill(courseTitle(info.project.name));
  await page.getByRole("button", { name: "Create course" }).click();
  await page.waitForURL(/\/teach\/courses\/[^/]+$/);
  const courseUrl = page.url();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // A text item.
  await addItem(page, "Text", "Ladder basics");
  await page.getByRole("textbox", { name: "Item content" }).click();
  await page.keyboard.type("Always keep three points of contact.");
  await page.getByText("Visible to learners").click();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expectAccessible(page);

  // A PDF item, locked until the text item is done.
  await page.goto(courseUrl);
  await addItem(page, "PDF", "Inspection form");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "inspection.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("link", { name: "inspection.pdf" })).toBeVisible();
  await page.getByText("Visible to learners").click();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByLabel("Item", { exact: true }).selectOption({ label: "Ladder basics" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("After “Ladder basics” is completed")).toBeVisible();

  // Rejects a disguised file.
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ not a pdf") });
  await expect(page.getByText(/couldn't be checked and was deleted/)).toBeVisible();

  // Reorder with the keyboard (drag-and-drop is keyboard accessible).
  await page.goto(courseUrl);
  const rows = page.locator("main ol li ul > li a");
  await expect(rows).toHaveText(["Ladder basics", "Inspection form"].map((t) => new RegExp(t)));
  await page.getByRole("button", { name: "Move Inspection form" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  // Wait until the drag has registered its new target before dropping (as a person would).
  await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Inspection form is over Ladder basics.");
  await page.keyboard.press("Space");
  await expect(page.getByText("Order saved")).toBeVisible();
  await page.reload();
  await expect(rows).toHaveText([/Inspection form/, /Ladder basics/]);

  // Catalogue visibility, then publish.
  await page.goto(`${courseUrl}/settings`);
  await page.getByLabel("Who can be enrolled").selectOption("PUBLIC");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish course" }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
});

test("a client manager enrols a staff member", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.manager.email, f.password);
  await page.goto("/org");
  await page.getByLabel("Course", { exact: true }).selectOption({ label: courseTitle(info.project.name) });
  await page.getByRole("checkbox", { name: new RegExp(f.student.fullName) }).check();
  await page.getByRole("button", { name: "Enrol 1 person" }).click();
  await expect(page.getByText("1 enrolled.")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("a learner works through the course with release conditions", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await expect(page.getByRole("link", { name: new RegExp(courseTitle(info.project.name)) })).toBeVisible();

  await page.goto("/learn");
  await page.getByRole("link", { name: new RegExp(courseTitle(info.project.name)) }).click();
  await expect(page.getByText("Complete “Ladder basics” first")).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
  const outline = page.url();

  await page.getByRole("link", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ladder basics" })).toBeVisible();
  await expect(page.getByText("Always keep three points of contact.")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Mark as complete" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  await page.goto(outline);
  await page.getByRole("link", { name: /Inspection form/ }).click();
  const open = page.getByRole("link", { name: /Open PDF/ });
  await expect(open).toBeVisible();
  const fileUrl = await open.getAttribute("href");
  const res = await page.request.get(fileUrl!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Mark as complete" }).click();
  await expect(page.getByText("You've completed this course.")).toBeVisible();

  // Someone not on the course can't fetch the file.
  await page.context().clearCookies();
  await signedIn(page, f.manager.email, f.password);
  expect((await page.request.get(fileUrl!)).status()).toBe(404);
});
