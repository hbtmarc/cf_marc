import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.CFM_DEV_URL ?? "http://localhost:5173";
const REAL_IMPORT =
  process.env.CFM_IMPORT_JSON ??
  "C:/Users/hbmar/Downloads/cfm_import_20260710_2107_corrigido.json";
const OUT = join(process.cwd(), "docs", "screenshots-etapa6");
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

await mkdir(OUT, { recursive: true });
execSync(
  `npx tsx scripts/export-import-storage.ts ${JSON.stringify(REAL_IMPORT)} ${JSON.stringify(STORAGE_TEMP)}`,
  { cwd: process.cwd(), stdio: "inherit" },
);
const storageJson = readFileSync(STORAGE_TEMP, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });

for (const page of [desktop, mobile]) {
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
  await page.evaluate((raw) => localStorage.setItem("cfm:v2:appData", raw), storageJson);
  await page.reload({ waitUntil: "load" });
}

await setCompetence(desktop, "2026-07");
await desktop.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await desktop.locator(".table-sort-btn[data-sort-column='amount']").click();
await shot(desktop, "lancamentos-sort-amount-1440.png");

await setCompetence(desktop, "2026-07");
await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await desktop.locator(".cfm-table--invoice .table-sort-btn[data-sort-column='total']").click();
await shot(desktop, "faturas-sort-total-1440.png");

await desktop.locator("[data-invoice-view]").first().click();
await desktop.waitForSelector(".cfm-table--invoice-lines");
await desktop.locator(".cfm-table--invoice-lines .table-sort-btn[data-sort-column='description']").click();
await shot(desktop, "fatura-detalhe-sort-descricao-1440.png");

await setCompetence(mobile, "2026-07");
await mobile.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await shot(mobile, "lancamentos-sort-mobile-390.png");

await setCompetence(mobile, "2026-07");
await mobile.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await mobile.locator("[data-invoice-view]").first().click();
await mobile.waitForSelector(".table-sort-mobile");
await shot(mobile, "fatura-detalhe-sort-mobile-390.png");

await browser.close();
