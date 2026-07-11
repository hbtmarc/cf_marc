import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE =
  process.env.CFM_PREVIEW_URL && process.env.CFM_PREVIEW_URL.includes("5175")
    ? process.env.CFM_PREVIEW_URL
    : "http://localhost:5175";
const REAL_IMPORT =
  process.env.CFM_REAL_IMPORT ??
  "C:/Users/hbmar/Downloads/cfm_import_20260710_2107_corrigido.json";
const OUT = join(process.cwd(), "docs", "screenshots-etapa5");

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

async function setCompetence(page, month) {
  await page.evaluate((value) => {
    const key = "cfm:v2:appData";
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.selectedCompetenceMonth = value;
    localStorage.setItem(key, JSON.stringify(data));
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

async function uploadImport(page, filePath) {
  await openImportEmpty(page);
  await page.locator("#import-file-input").setInputFiles(filePath);
  await page.waitForSelector(".import-review, .import-message--error", { timeout: 300000 });
}

await mkdir(OUT, { recursive: true });
const invalidPath = join(OUT, "_invalid-temp.json");
writeFileSync(invalidPath, "{ not-json");

const browser = await chromium.launch({ channel: "msedge" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.on("response", (res) => {
  if (res.status() >= 400) console.error("http", res.status(), res.url());
});

await desktop.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await desktop.evaluate(() => localStorage.clear());
await desktop.reload({ waitUntil: "load" });
await openImportEmpty(desktop);

await uploadImport(desktop, REAL_IMPORT);
await desktop.waitForSelector(".import-review");
await shot(desktop, "importar-review-1440.png");

await desktop.locator("#import-confirm").click();
await desktop.waitForSelector(".import-result");
await shot(desktop, "importar-success-1440.png");

const txBeforeInvalid = await desktop.evaluate(() => {
  const raw = localStorage.getItem("cfm:v2:appData");
  return raw ? JSON.parse(raw).transactions.length : 0;
});

await uploadImport(desktop, invalidPath);
await desktop.waitForSelector(".import-message--error");
await shot(desktop, "importar-error-1440.png");

const txAfterInvalid = await desktop.evaluate(() => {
  const raw = localStorage.getItem("cfm:v2:appData");
  return raw ? JSON.parse(raw).transactions.length : 0;
});
if (txBeforeInvalid !== txAfterInvalid) {
  throw new Error("Invalid import modified storage");
}

await uploadImport(desktop, REAL_IMPORT);
await desktop.waitForSelector(".import-review");
await shot(desktop, "importar-reimport-1440.png");
await desktop.locator("#import-confirm").click();
await desktop.waitForSelector(".import-result");

for (const month of ["2026-06", "2026-07", "2026-08"]) {
  await setCompetence(desktop, month);
  await desktop.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
  await desktop.waitForSelector(".panel--projection, #projection-title", { timeout: 20000 });
  const label = month === "2026-06" ? "junho" : month === "2026-07" ? "julho" : "agosto";
  await shot(desktop, `dashboard-${label}-1440.png`);
}

await setCompetence(desktop, "2026-07");
await desktop.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await desktop.waitForSelector(".data-table, .empty-state", { timeout: 20000 });
await shot(desktop, "lancamentos-importados-1440.png");

await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await desktop.waitForSelector(".card-panel, .empty-state", { timeout: 20000 });
await shot(desktop, "faturas-importadas-1440.png");

const desktopData = await desktop.evaluate(() => localStorage.getItem("cfm:v2:appData"));
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await mobile.evaluate((raw) => {
  localStorage.clear();
  if (raw) localStorage.setItem("cfm:v2:appData", raw);
}, desktopData);

await uploadImport(mobile, REAL_IMPORT);
await mobile.waitForSelector(".import-review");
await shot(mobile, "importar-review-390.png");
await mobile.locator("#import-confirm").click();
await mobile.waitForSelector(".import-result");
await shot(mobile, "importar-success-390.png");

await browser.close();
