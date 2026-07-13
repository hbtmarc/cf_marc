/**
 * Teste A→B de competência entre localhost e GitHub Pages (UI real).
 * Uso: node scripts/validate-cross-origin-sync.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../docs/evidencias-etapa11");
fs.mkdirSync(outDir, { recursive: true });

const LOCAL_PROFILE = path.join(__dirname, "../.playwright-localhost-profile");
const GITHUB_PROFILE = path.join(__dirname, "../.playwright-github-profile");

async function openOrigin(profileDir, url) {
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  page.setDefaultTimeout(90000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await waitSynced(page);
  return { browser, page };
}

async function waitSynced(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => {
      const text = document.querySelector("#sync-status-host [role='status']")?.textContent ?? "";
      return (
        text.includes("Salvo neste dispositivo e na nuvem") ||
        text.includes("Dados mais recentes") ||
        text.includes("Offline — alterações salvas neste dispositivo")
      );
    },
    { timeout: timeoutMs },
  );
}

async function readStorageState(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cfm:v2:appData");
    const metaRaw = localStorage.getItem("cfm:v2:syncMeta");
    let data = null;
    let meta = null;
    try {
      data = raw ? JSON.parse(raw) : null;
      meta = metaRaw ? JSON.parse(metaRaw) : null;
    } catch {
      // ignore
    }
    return {
      selectedCompetenceMonth: data?.selectedCompetenceMonth ?? null,
      lastRemoteRevision: meta?.lastRemoteRevision ?? null,
      pendingSync: meta?.pendingSync ?? null,
      syncStatus:
        document.querySelector("#sync-status-host [role='status']")?.textContent?.trim() ?? null,
    };
  });
}

async function shiftCompetenceNext(page) {
  const next = page.locator(".competence-control__btn").last();
  await next.click();
  await page.waitForTimeout(1200);
}

const report = { steps: [] };

const local = await openOrigin(LOCAL_PROFILE, "http://localhost:5173/#/dashboard");
const github = await openOrigin(GITHUB_PROFILE, "https://hbtmarc.github.io/cf_marc/#/dashboard");

const initialA = await readStorageState(local.page);
const initialB = await readStorageState(github.page);
report.steps.push({ step: "initial", A: initialA, B: initialB });

await shiftCompetenceNext(local.page);
await local.page.waitForTimeout(2500);
await waitSynced(local.page);
const afterA = await readStorageState(local.page);
report.steps.push({ step: "A_shifted_competence", A: afterA });

await github.page.reload({ waitUntil: "domcontentloaded" });
await waitSynced(github.page);
const afterBReceived = await readStorageState(github.page);
report.steps.push({ step: "B_after_A_change", B: afterBReceived });

await shiftCompetenceNext(github.page);
await github.page.waitForTimeout(2500);
await waitSynced(github.page);
const afterB = await readStorageState(github.page);
report.steps.push({ step: "B_shifted_competence", B: afterB });

await local.page.reload({ waitUntil: "domcontentloaded" });
await waitSynced(local.page);
const finalA = await readStorageState(local.page);
report.steps.push({ step: "A_after_B_change", A: finalA });

// Restaurar competência original com dois cliques prev em A
const prev = local.page.locator(".competence-control__btn").first();
await prev.click();
await local.page.waitForTimeout(1200);
await prev.click();
await waitSynced(local.page);

report.summary = {
  initialRevisionA: initialA.lastRemoteRevision,
  initialRevisionB: initialB.lastRemoteRevision,
  revisionAfterA: afterA.lastRemoteRevision,
  revisionAfterB: afterB.lastRemoteRevision,
  revisionIncrementedOnA:
    (afterA.lastRemoteRevision ?? 0) > (initialA.lastRemoteRevision ?? 0),
  BReceivedACompetence: afterBReceived.selectedCompetenceMonth === afterA.selectedCompetenceMonth,
  AReceivedBCompetence: finalA.selectedCompetenceMonth === afterB.selectedCompetenceMonth,
  finalSyncStatusA: finalA.syncStatus,
  finalSyncStatusB: afterB.syncStatus,
};

const outPath = path.join(outDir, "cross-origin-sync.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

await local.browser.close();
await github.browser.close();
