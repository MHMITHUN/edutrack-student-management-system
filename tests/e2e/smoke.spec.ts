import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end smoke flow (spec 13): one real user journey per role through
 * the seeded demo store, plus the anonymous redirect — with a no-console-
 * errors check on every step. Serial mode: the tests share one dev server,
 * so the teacher draft and the admin publish must happen in order.
 *
 * Expectations reference seeded facts (src/lib/db/seeds): the demo student
 * stu-031 (Rakib Hasan, Class Ten Science) has a published First Term 2026
 * GPA of 4.71 with verification ID CDF06B9930 — every number the pages show
 * is computed from the store, so these asserts pin that honesty.
 */

const DEMO_PASSWORD = "Demo@12345";

/** Collect console errors + uncaught page errors for the no-error assert. */
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Sign in through /login and wait for the role's landing page. */
async function login(page: Page, email: string, landing: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(landing);
}

test.describe.configure({ mode: "serial" });

test("(1) / redirects anonymous visitors to /login", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();

  expect(errors, "console errors during the anonymous flow").toEqual([]);
});

test("(2) student signs in and sees computed GPA + attendance", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await login(page, "student@demo.local", /\/student$/);
  await expect(
    page.getByRole("heading", { name: "Welcome, Rakib Hasan" }),
  ).toBeVisible();

  // GPA and attendance are computed from the store (First Term 2026: 4.71,
  // 83/86 classes attended = 96.5%).
  await expect(page.getByText("Current GPA")).toBeVisible();
  // The KPI reads "4.71/ 5.00"; the trailing slash keeps this from also
  // matching the chart helper text ("Annual 2025 4.71, First Term 2026 4.71").
  await expect(page.getByText("4.71/")).toBeVisible();
  await expect(page.getByText("My attendance")).toBeVisible();
  await expect(page.getByText("96.5")).toBeVisible();
  await expect(page.getByText(/83\/86 classes/)).toBeVisible();

  expect(errors, "console errors during the student flow").toEqual([]);
});

test("(3) student opens published First Term results and the printable marksheet", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await login(page, "student@demo.local", /\/student$/);
  // exact: the dashboard also has a "Full results" quick link.
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/results/);

  // The published First Term 2026 table for Class Ten Science.
  await expect(
    page.getByRole("heading", { name: "Subject results — First Term 2026" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bangla" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Physics" })).toBeVisible();

  // Print view: student details + the deterministic verification ID.
  await page.getByRole("link", { name: "Printable marksheet" }).click();
  await expect(page).toHaveURL(/\/student\/results\/First%20Term\/print/);
  await expect(
    page.getByRole("heading", { name: "EduTrack Demo School" }),
  ).toBeVisible();
  await expect(
    page.getByText("Statement of Results — First Term Examination 2026"),
  ).toBeVisible();
  await expect(page.getByText("Verification ID:")).toBeVisible();
  await expect(page.getByText("CDF06B9930")).toBeVisible();

  expect(errors, "console errors during the results/print flow").toEqual([]);
});

test("(4) teacher enters marks for an assigned class and saves a draft", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await login(page, "teacher@demo.local", /\/teacher$/);
  await page.getByRole("link", { name: "Marks Entry" }).click();
  await expect(page).toHaveURL(/\/teacher\/marks/);

  // Asha Khatun teaches Bangla; Class Nine (Science) is her first assignment.
  // First Term is already published there, so switch to a fresh Half Yearly
  // sheet to get an editable roster.
  await page.getByLabel("Class", { exact: true }).selectOption("cls-9-science");
  await page.getByLabel("Exam", { exact: true }).selectOption("Half Yearly");
  await page.getByRole("button", { name: "Load Roster" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Class Nine (Science) · Bangla · Half Yearly",
    }),
  ).toBeVisible();
  await expect(page.getByText("15 students on the roll")).toBeVisible();
  await expect(page.getByText("Md. Siam Hossain")).toBeVisible();

  // Enter one mark and save the draft.
  await page.getByLabel("Marks for Md. Siam Hossain").fill("72");
  await page.getByRole("button", { name: "Save Draft" }).click();

  await expect(
    page.getByText("Draft saved. You can come back and finish it later."),
  ).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  expect(errors, "console errors during the teacher marks flow").toEqual([]);
});

/** Sheet id published in test (5), reused by the audit assertion in (6). */
let publishedSheetId = "";

test("(5) admin reviews a submitted sheet and publishes it", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await login(page, "admin@demo.local", /\/admin$/);
  await page.getByRole("link", { name: "Marks Review" }).click();
  await expect(page).toHaveURL(/\/admin\/marks/);

  // The seeded review queue holds three submitted First Term sheets.
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

  // exact: the sidebar "Marks Review" link also contains the word "Review"
  // and comes first in the DOM.
  await page.getByRole("link", { name: "Review", exact: true }).first().click();
  // Client-side navigation is async — wait for the sheet URL before
  // reading the sheet id from it.
  await expect(page).toHaveURL(/\/admin\/marks\/ms-/);
  publishedSheetId = page.url().split("/").pop() ?? "";
  expect(publishedSheetId).toMatch(/^ms-/);

  await expect(
    page.getByRole("heading", { name: "Mark Sheet Review" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Decision" })).toBeVisible();

  await page.getByRole("button", { name: "Publish Result" }).click();
  // The action's toast unmounts as soon as revalidation swaps the Decision
  // card for the page-level confirmation, so assert the durable state:
  // the immutable note and the Published badge/status.
  await expect(
    page.getByText(/Published sheets are immutable/),
  ).toBeVisible();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();

  expect(errors, "console errors during the admin publish flow").toEqual([]);
});

test("(6) audit log lists the publish action from (5)", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  await login(page, "admin@demo.local", /\/admin$/);
  // exact: the admin dashboard also shows an "Audit log" quick-action card.
  await page.getByRole("link", { name: "Audit Log", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/audit/);

  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();

  // The row for the sheet published in test (5): correct action, actor and
  // resource — audit rows are written by the mutation itself.
  expect(publishedSheetId).not.toBe("");
  const row = page
    .locator("tbody tr", { hasText: publishedSheetId })
    .filter({ hasText: "marksheet.publish" })
    .first();
  await expect(row).toBeVisible();
  await expect(row.getByText("Md. Rafiqul Islam")).toBeVisible();

  expect(errors, "console errors during the audit flow").toEqual([]);
});
