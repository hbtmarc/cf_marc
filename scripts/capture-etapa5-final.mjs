import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://localhost:5175";
const REAL_IMPORT =
  "C:/Users/hbmar/Downloads/cfm_import_20260710_2107_corrigido.json";
const OUT = join(process.cwd(), "docs", "screenshots-etapa5");
const STORAGE_TEMP = join(OUT, "_storage-temp.json");

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

async function setCompetence(page, month) {
  await page.evaluate((value) => {
    const raw = localStorage.getItem("cfm:v2:appData");
    if (!raw) return;
    const data = JSON.parse(raw);
    data.selectedCompetenceMonth = value;
    localStorage.setItem("cfm:v2:appData", JSON.stringify(data));
  }, month);
}

async function openImportEmpty(page) {
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
  await page.goto(`${BASE}/#/importar`, { waitUntil: "load" });
  const retry = page.locator("#import-new-file, #import-cancel-review");
  if ((await retry.count()) > 0) {
    await retry.first().click();
  }
  await page.waitForSelector("#import-file-input", { state: "attached", timeout: 60000 });
}

await mkdir(OUT, { recursive: true });
execSync(`npx tsx scripts/export-import-storage.ts ${JSON.stringify(REAL_IMPORT)} ${JSON.stringify(STORAGE_TEMP)}`, {
  cwd: process.cwd(),
  stdio: "inherit",
});
const storageJson = readFileSync(STORAGE_TEMP, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await desktop.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await desktop.evaluate((raw) => localStorage.setItem("cfm:v2:appData", raw), storageJson);
await desktop.reload({ waitUntil: "load" });

for (const month of ["2026-06", "2026-07", "2026-08"]) {
  await setCompetence(desktop, month);
  await desktop.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
  await desktop.waitForSelector("#projection-title", { timeout: 20000 });
  const label = month === "2026-06" ? "junho" : month === "2026-07" ? "julho" : "agosto";
  await shot(desktop, `dashboard-${label}-1440.png`);
}

await setCompetence(desktop, "2026-07");
await desktop.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await desktop.waitForSelector(".data-table", { timeout: 20000 });
await shot(desktop, "lancamentos-importados-1440.png");

await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await desktop.waitForSelector(".card-panel", { timeout: 20000 });
await shot(desktop, "faturas-importadas-1440.png");

await openImportEmpty(desktop);
await desktop.locator("#import-file-input").setInputFiles(REAL_IMPORT);
await desktop.waitForSelector(".import-review", { timeout: 300000 });
await shot(desktop, "importar-reimport-1440.png");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await mobile.evaluate((raw) => localStorage.setItem("cfm:v2:appData", raw), storageJson);
await mobile.reload({ waitUntil: "load" });

await openImportEmpty(mobile);
await mobile.locator("#import-file-input").setInputFiles(REAL_IMPORT);
await mobile.waitForSelector(".import-review", { timeout: 300000 });
await shot(mobile, "importar-review-390.png");
await mobile.locator("#import-confirm").click();
await mobile.waitForSelector(".import-result", { timeout: 300000 });
await shot(mobile, "importar-success-390.png");

await browser.close();
