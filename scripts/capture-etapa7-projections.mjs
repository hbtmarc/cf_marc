import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.CFM_DEV_URL ?? "http://localhost:5173";
const FIXTURE = join(process.cwd(), "src", "fixtures", "cfm-import-v1-projections.json");
const OUT = join(process.cwd(), "docs", "screenshots-etapa7");
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
  `npx tsx scripts/export-import-storage.ts ${JSON.stringify(FIXTURE)} ${JSON.stringify(STORAGE_TEMP)}`,
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
await desktop.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await desktop.waitForSelector(".panel--projected-installments");
await shot(desktop, "dashboard-projected-installments-1440.png");

await setCompetence(desktop, "2026-07");
await desktop.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await desktop.waitForSelector(".cfm-table__row--projected");
await shot(desktop, "lancamentos-projected-installments-1440.png");

await setCompetence(desktop, "2026-06");
await desktop.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await shot(desktop, "lancamentos-with-real-invoice-1440.png");

await setCompetence(mobile, "2026-07");
await mobile.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await mobile.waitForSelector(".panel--projected-installments");
await shot(mobile, "dashboard-projected-installments-390.png");

await setCompetence(mobile, "2026-07");
await mobile.goto(`${BASE}/#/lancamentos`, { waitUntil: "load" });
await mobile.waitForSelector(".cfm-table__row--projected");
await shot(mobile, "lancamentos-projected-installments-390.png");

await browser.close();
