import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.CFM_DEV_URL ?? "http://localhost:5173";
const REAL_IMPORT =
  process.env.CFM_IMPORT_JSON ??
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

async function openInvoiceDetail(page, cardNamePart) {
  const row = page.locator(".data-table__row--invoice").filter({ hasText: cardNamePart }).first();
  await row.locator("[data-invoice-view]").click();
  await page.waitForSelector(".invoice-detail", { timeout: 20000 });
}

await mkdir(OUT, { recursive: true });
execSync(
  `npx tsx scripts/export-import-storage.ts ${JSON.stringify(REAL_IMPORT)} ${JSON.stringify(STORAGE_TEMP)}`,
  { cwd: process.cwd(), stdio: "inherit" },
);
const storageJson = readFileSync(STORAGE_TEMP, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await desktop.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await desktop.evaluate((raw) => localStorage.setItem("cfm:v2:appData", raw), storageJson);
await desktop.reload({ waitUntil: "load" });

await setCompetence(desktop, "2026-06");
await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await desktop.waitForSelector(".card-panel", { timeout: 20000 });
await shot(desktop, "faturas-junho-totais-1440.png");

await setCompetence(desktop, "2026-07");
await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await desktop.waitForSelector(".card-panel", { timeout: 20000 });
await shot(desktop, "faturas-julho-totais-1440.png");

await openInvoiceDetail(desktop, "Nubank");
await shot(desktop, "fatura-detalhe-nubank-1440.png");

await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await openInvoiceDetail(desktop, "Porto");
await shot(desktop, "fatura-detalhe-porto-1440.png");

await setCompetence(desktop, "2026-06");
await desktop.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await openInvoiceDetail(desktop, "Mercado Pago");
await shot(desktop, "fatura-detalhe-mercado-pago-1440.png");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${BASE}/#/dashboard`, { waitUntil: "load" });
await mobile.evaluate((raw) => localStorage.setItem("cfm:v2:appData", raw), storageJson);
await mobile.reload({ waitUntil: "load" });
await setCompetence(mobile, "2026-07");
await mobile.goto(`${BASE}/#/faturas`, { waitUntil: "load" });
await openInvoiceDetail(mobile, "Porto");
await shot(mobile, "fatura-detalhe-mobile-390.png");

await browser.close();
