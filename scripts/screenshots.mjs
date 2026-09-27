/**
 * Captures the portfolio screenshots into docs/screenshots/.
 * Run against an already-running dev/prod server:
 *   npm run dev   # in another shell (port 3003)
 *   node scripts/screenshots.mjs
 *
 * 01-login.png           1280x800  sign-in page
 * 02-marks-entry.png     1280x800  teacher marks entry roster grid (assigned
 *                                  class + subject, a few marks typed in)
 * 03-student-dashboard.png 1280x800 student dashboard (computed GPA,
 *                                  attendance, GPA trend chart)
 * 04-mobile.png           390x844  student dashboard at phone width
 * 05-admin.png            1280x800 admin dashboard with analytics charts
 */
import { chromium } from "@playwright/test";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "docs", "screenshots");
mkdirSync(outDir, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:3003";
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

const MIN_BYTES = 20 * 1024; // each capture must exceed 20 KB

const browser = await chromium.launch();

async function capture(name, { viewport = DESKTOP, url, setup }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(BASE + url, { waitUntil: "load" });
    if (setup) {
      await setup(page);
    }
    await page.waitForTimeout(1500); // fonts + charts settle
    const file = path.join(outDir, name);
    await page.screenshot({ path: file });
    const bytes = statSync(file).size;
    if (bytes <= MIN_BYTES) {
      throw new Error(`${name} is only ${bytes} bytes (<= 20 KB)`);
    }
    console.log(`captured ${name} (${(bytes / 1024).toFixed(1)} KB)`);
  } finally {
    await context.close();
  }
}

/** Sign in through /login and wait for the role landing page. */
async function login(page, email, landing) {
  await page.goto(BASE + "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(landing, { timeout: 30_000 });
}

await capture("01-login.png", { url: "/login" });

await capture("02-marks-entry.png", {
  // Teacher roster grid: Asha Khatun teaches Bangla to Class Nine (Science).
  // First Term 2026 is already published there, so a fresh Half Yearly sheet
  // gives an editable roster. A few marks are typed in for a lived-in look.
  url: "/teacher/marks",
  setup: async (page) => {
    await login(page, "teacher@demo.local", /\/teacher$/);
    await page.goto(BASE + "/teacher/marks");
    await page.getByLabel("Class", { exact: true }).selectOption("cls-9-science");
    await page.getByLabel("Exam", { exact: true }).selectOption("Half Yearly");
    await page.getByRole("button", { name: "Load Roster" }).click();
    await page.getByRole("heading", {
      name: "Class Nine (Science) · Bangla · Half Yearly",
    }).waitFor();
    const marksInputs = page.locator("input[data-marks-input]");
    const count = await marksInputs.count();
    const sampleMarks = [72, 65, 88, 54, 79, 91, 46];
    for (let i = 0; i < Math.min(7, count); i++) {
      await marksInputs.nth(i).fill(String(sampleMarks[i]));
    }
  },
});

await capture("03-student-dashboard.png", {
  url: "/student",
  setup: async (page) => {
    await login(page, "student@demo.local", /\/student$/);
  },
});

await capture("04-mobile.png", {
  url: "/student",
  viewport: MOBILE,
  setup: async (page) => {
    await login(page, "student@demo.local", /\/student$/);
  },
});

await capture("05-admin.png", {
  // Admin analytics dashboard: KPI cards + recharts charts.
  url: "/admin",
  setup: async (page) => {
    await login(page, "admin@demo.local", /\/admin$/);
    await page.locator("svg").first().waitFor({ timeout: 15_000 });
  },
});

await browser.close();
console.log("all screenshots captured to docs/screenshots/");
