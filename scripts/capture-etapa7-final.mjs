import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.CFM_DEV_URL ?? "http://127.0.0.1:5173";
const FIXTURE = join(process.cwd(), "src", "fixtures", "cfm-import-v1-valid.json");
const OUT = join(process.cwd(), "docs", "screenshots-etapa7-final");
const STORAGE_TEMP = join(OUT, "_storage-temp.json");

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

async function openImportEmpty(page) {
  await page.goto(`${BASE}/#/importar`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#import-file-input", { state: "attached", timeout: 60000 });
}

await openImportEmpty(desktop);
await desktop.locator("#import-file-input").setInputFiles(FIXTURE);
await desktop.waitForSelector(".import-card-completion");
await shot(desktop, "import-review-card-fields-1440.png");

await openImportEmpty(mobile);
await mobile.locator("#import-file-input").setInputFiles(FIXTURE);
await mobile.waitForSelector(".import-card-completion");
await mobile.locator('[data-card-completion-field="closingDay"]').first().fill("40");
await mobile.locator('[data-card-completion-field="dueDay"]').first().fill("10.5");
await mobile.evaluate(() => {
  Array.from(document.querySelectorAll("[data-card-completion]")).forEach((input) => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});
await mobile.waitForSelector(".field__error");
await shot(mobile, "import-review-card-validation-390.png");

execSync(
  `npx tsx scripts/export-import-storage.ts ${JSON.stringify(FIXTURE)} ${JSON.stringify(STORAGE_TEMP)}`,
  { cwd: process.cwd(), stdio: "inherit" },
);
const storageJson = readFileSync(STORAGE_TEMP, "utf8");

for (const page of [desktop, mobile]) {
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: "networkidle" });
  await page.evaluate((raw) => {
    const data = JSON.parse(raw);
    data.selectedCompetenceMonth = "2026-01";
    localStorage.setItem("cfm:v2:appData", JSON.stringify(data));
  }, storageJson);
  await page.reload({ waitUntil: "networkidle" });
}

await desktop.waitForSelector(".cfm-table--dashboard-recent");
await shot(desktop, "dashboard-recent-transactions-1440.png");

await desktop.locator(".cfm-table--dashboard-recent .table-sort-btn[data-sort-column='amount']").click();
await shot(desktop, "dashboard-recent-transactions-sort-1440.png");

await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "networkidle" });
await desktop.locator("[data-invoice-view]").first().click();
await desktop.waitForSelector(".cfm-table--invoice-lines");
await shot(desktop, "invoice-cash-purchase-1440.png");

await mobile.waitForSelector(".cfm-table--dashboard-recent");
await shot(mobile, "dashboard-recent-transactions-390.png");

await browser.close();
