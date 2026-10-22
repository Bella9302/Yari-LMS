import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signedIn, signInWith2fa } from "./helpers";

test.describe.configure({ mode: "serial" });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const title = (project: string) => `Fall Protection ${project}`;
let courseUrl = "";

async function addItem(page: Page, type: string, name: string) {
  await page.goto(courseUrl);
  await page.getByRole("button", { name: "Add item" }).first().click();
  await page.getByLabel("Type").selectOption({ label: type });
  await page.getByLabel("Title", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForURL(/\/items\//);
}

test("a trainer builds a quiz and a rubric-marked assignment", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.builder.email, f.password, f.builder.totpKey);
  await page.goto("/teach/new");
  await page.getByLabel("Course title").fill(title(info.project.name));
  await page.getByRole("button", { name: "Create course" }).click();
  await page.waitForURL(/\/teach\/courses\/[^/]+$/);
  courseUrl = page.url();

  // Question bank with two questions.
  await page.goto(`${courseUrl}/questions`);
  await page.getByLabel("New bank").fill("Basics");
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.waitForURL(/\/questions\/[^/]+$/);
  await page.getByLabel("Question", { exact: true }).fill("Which of these is PPE?");
  await page.getByLabel("Option 1", { exact: true }).fill("Hard hat");
  await page.getByLabel("Option 2", { exact: true }).fill("Coffee");
  await page.getByLabel("Option 1 is correct").check();
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.locator("summary").getByText("Which of these is PPE?")).toBeVisible();
  await page.getByLabel("Question type").last().selectOption("TRUE_FALSE");
  await page.getByLabel("Question", { exact: true }).last().fill("Harnesses must be inspected before use.");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.locator("summary").getByText("Harnesses must be inspected before use.")).toBeVisible();
  await expectAccessible(page);

  // Quiz drawing every question from the bank, pass mark 100%.
  await addItem(page, "Quiz", "Fall protection quiz");
  await page.getByLabel("Question bank").selectOption({ label: "Basics (2)" });
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByText("Each attempt: 2 questions")).toBeVisible();
  await page.getByLabel("Pass mark (%)").fill("100");
  await page.getByRole("button", { name: "Save quiz settings" }).click();
  await expect(page.getByText("Quiz settings saved.")).toBeVisible();
  await page.getByText("Visible to learners").click();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  // Rubric.
  await page.goto(`${courseUrl}/rubrics/new`);
  await page.getByLabel("Rubric title").fill("Site report");
  await page.getByLabel("Criterion 1", { exact: true }).fill("Hazards identified");
  await page.getByRole("button", { name: "Save rubric" }).click();
  await page.waitForURL(/\/rubrics\/(?!new)[^/]+$/);

  // Assignment marked with the rubric.
  await addItem(page, "Assignment", "Site report");
  await page.getByLabel("Mark with").selectOption({ label: "Rubric: Site report (10 pts)" });
  await page.getByRole("button", { name: "Save assignment settings" }).click();
  await expect(page.getByText("Assignment settings saved.")).toBeVisible();
  await page.getByRole("textbox", { name: "Assignment instructions" }).click();
  await page.keyboard.type("Inspect your work area and list the fall hazards.");
  await page.getByText("Visible to learners").click();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expectAccessible(page);

  await page.goto(`${courseUrl}/settings`);
  await page.getByLabel("Who can be enrolled").selectOption("PUBLIC");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("button", { name: "Publish course" }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
});

test("the learner is enrolled by their company", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.manager.email, f.password);
  await page.goto("/org");
  await page.getByRole("link", { name: "Enrol staff", exact: true }).click();
  await page.getByLabel("Course", { exact: true }).selectOption({ label: title(info.project.name) });
  await page.getByRole("checkbox", { name: new RegExp(f.student.fullName) }).check();
  await page.getByRole("button", { name: "Enrol 1 person" }).click();
  await expect(page.getByText("1 enrolled.")).toBeVisible();
});

test("the learner fails, retries and passes the quiz, then hands in the assignment", async ({
  page,
}, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await page.goto("/learn");
  await page.getByRole("link", { name: new RegExp(title(info.project.name)) }).click();
  await page.getByRole("link", { name: /Fall protection quiz/ }).click();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Start the quiz" }).click();
  await page.waitForURL(/\/attempt\//);
  await page.getByLabel("Coffee").check();
  await page.getByLabel("False").check();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("heading", { name: "Not passed yet" })).toBeVisible();

  await page.getByRole("link", { name: "Back to the quiz" }).click();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL(/\/attempt\//);
  await page.getByLabel("Hard hat").check();
  await page.getByLabel("True", { exact: true }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("heading", { name: "Passed" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Correct option" }).first()).toBeVisible(); // answers shown after the attempt

  await page.getByRole("link", { name: "Back to the quiz" }).click();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Site report" })).toBeVisible();
  await page.getByLabel("Your answer").fill("Open edge near the loading bay; ladder without footing.");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "photos.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText("photos.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Hand in" }).click();
  await expect(page.getByText("Handed in — your trainer will mark it.")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the trainer marks inline with the rubric and the gradebook updates", async ({ page }, info) => {
  const f = fixtures(info);
  await signInWith2fa(page, f.builder.email, f.password, f.builder.totpKey);
  await page.goto(`${courseUrl}/marking`);
  await expect(page.getByText("1 to mark")).toBeVisible();
  await page.getByRole("link", { name: /Site report/ }).click();
  await page.getByRole("link", { name: f.student.fullName }).click();
  await expect(page.getByText("Open edge near the loading bay")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("radio", { name: /Competent/ }).check();
  await expect(page.getByText("100% · pass")).toBeVisible();
  await page.getByLabel("Written feedback").fill("Clear and complete. Well spotted.");
  await page.getByRole("button", { name: "Release & next" }).click();
  await expect(page.getByText("Marked · 10")).toBeVisible();

  await page.goto(`${courseUrl}/gradebook`);
  const row =
    info.project.name === "mobile"
      ? page.locator("li", { hasText: f.student.fullName })
      : page.getByRole("row", { name: new RegExp(f.student.fullName) });
  await expect(row.getByText("100%").first()).toBeVisible();
  await expectAccessible(page);

  const csv = await page.request.get(`${courseUrl}/gradebook/export?format=csv`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain(f.student.fullName);
  expect(body).toContain("Fall protection quiz (%)");
  const pdf = await page.request.get(`${courseUrl}/gradebook/export?format=pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("the learner sees their feedback and the course is complete", async ({ page }, info) => {
  const f = fixtures(info);
  await signedIn(page, f.student.email, f.password);
  await page.goto("/learn");
  await page.getByRole("link", { name: new RegExp(title(info.project.name)) }).click();
  await expect(page.getByText("Course completed")).toBeVisible();
  await page.getByRole("link", { name: /Site report/ }).click();
  await expect(page.getByText("10 / 10")).toBeVisible();
  await expect(page.getByText("Clear and complete. Well spotted.")).toBeVisible();
  await expectAccessible(page);
});
