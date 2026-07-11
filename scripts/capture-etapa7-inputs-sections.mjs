import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.CFM_DEV_URL ?? "http://127.0.0.1:5173";
const FIXTURE = join(process.cwd(), "src", "fixtures", "cfm-import-v1-valid.json");
const PROJECTIONS = join(process.cwd(), "src", "fixtures", "cfm-import-v1-projections.json");
const OUT = join(process.cwd(), "docs", "screenshots-etapa7-inputs-sections");
const STORAGE_TEMP = join(OUT, "_storage-temp.json");
const STORAGE_PROJ = join(OUT, "_storage-projections.json");

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

async function openImportEmpty(page) {
  await page.goto(`${BASE}/#/importar`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#import-file-input", { state: "attached" });
}

await mkdir(OUT, { recursive: true });

execSync(
  `npx tsx scripts/export-import-storage.ts ${JSON.stringify(FIXTURE)} ${JSON.stringify(STORAGE_TEMP)}`,
  { cwd: process.cwd(), stdio: "inherit" },
);
execSync(
  `npx tsx scripts/export-import-storage.ts ${JSON.stringify(PROJECTIONS)} ${JSON.stringify(STORAGE_PROJ)}`,
  { cwd: process.cwd(), stdio: "inherit" },
);

const storageJson = readFileSync(STORAGE_TEMP, "utf8");
const storageProjections = readFileSync(STORAGE_PROJ, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

await openImportEmpty(desktop);
await desktop.locator("#import-file-input").setInputFiles(FIXTURE);
await desktop.waitForSelector(".import-card-completion");
const closingDesktop = desktop.locator(
  '[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]',
);
await closingDesktop.click();
await closingDesktop.fill("10");
await shot(desktop, "import-card-fields-typing-1440.png");

await openImportEmpty(mobile);
await mobile.locator("#import-file-input").setInputFiles(FIXTURE);
await mobile.waitForSelector(".import-card-completion");
const closingMobile = mobile.locator(
  '[data-card-completion="card_ourocard"][data-card-completion-field="closingDay"]',
);
await closingMobile.click();
await closingMobile.fill("31");
await shot(mobile, "import-card-fields-typing-390.png");

for (const page of [desktop, mobile]) {
  await page.goto(`${BASE}/#/lancamentos`, { waitUntil: "networkidle" });
  await page.evaluate((raw) => {
    const data = JSON.parse(raw);
    data.selectedCompetenceMonth = "2026-01";
    localStorage.setItem("cfm:v2:appData", JSON.stringify(data));
  }, storageJson);
  await page.reload({ waitUntil: "networkidle" });
}

await desktop.waitForSelector(".lancamentos-section--income");
await shot(desktop, "lancamentos-sections-1440.png");

await desktop.locator("[data-ledger-toggle]").first().click();
await desktop.waitForSelector(".ledger-card-block__detail table tbody tr");
await shot(desktop, "lancamentos-invoice-expanded-1440.png");

await desktop.goto(`${BASE}/#/lancamentos`, { waitUntil: "networkidle" });
await desktop.evaluate((raw) => {
  const data = JSON.parse(raw);
  data.selectedCompetenceMonth = "2026-07";
  localStorage.setItem("cfm:v2:appData", JSON.stringify(data));
}, storageProjections);
await desktop.reload({ waitUntil: "networkidle" });
await desktop.waitForSelector(".lancamentos-section--cards");
await shot(desktop, "lancamentos-projected-card-1440.png");

await shot(mobile, "lancamentos-sections-390.png");
await mobile.locator("[data-ledger-toggle]").first().click();
await mobile.waitForSelector(".ledger-card-block__detail table tbody tr");
await shot(mobile, "lancamentos-invoice-expanded-390.png");

await browser.close();
