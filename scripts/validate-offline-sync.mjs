/**
 * Testa offline/reconexão em localhost (perfil persistente).
 * Uso: node scripts/validate-offline-sync.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.join(__dirname, "../.playwright-owner-profile");
const devUrl = "http://localhost:5173/#/dashboard";

(async () => {
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());

  const report = { offline: {}, reconnect: {} };

  await page.goto(devUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".app-shell");
  await page.waitForTimeout(2000);

  // Pré-carrega módulos enquanto online
  await page.evaluate(async () => {
    await import("/src/data-store.ts");
    await import("/src/storage.ts");
  });

  await page.context().setOffline(true);
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const raw = localStorage.getItem("cfm:v2:appData");
    if (!raw) return;
    const data = JSON.parse(raw);
    data.selectedCompetenceMonth = "2026-08";
    localStorage.setItem("cfm:v2:appData", JSON.stringify(data));
    window.dispatchEvent(new StorageEvent("storage", { key: "cfm:v2:appData" }));
  });

  // Trigger persist via data-store API
  await page.evaluate(async () => {
    const store = await import("/src/data-store.ts");
    const storage = await import("/src/storage.ts");
    const loaded = storage.loadAppData();
    if (loaded.ok) {
      store.persistAppData(loaded.data);
    }
  });

  await page.waitForTimeout(1000);

  report.offline = await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem("cfm:v2:syncMeta") ?? "{}");
    const status = document.querySelector("#sync-status-host [role='status']")?.textContent ?? "";
    return {
      pendingSync: meta.pendingSync ?? false,
      status,
      dashboardVisible: Boolean(document.querySelector(".app-shell")),
    };
  });

  await page.context().setOffline(false);
  await page.waitForTimeout(8000);

  report.reconnect = await page.evaluate(async () => {
    const meta = JSON.parse(localStorage.getItem("cfm:v2:syncMeta") ?? "{}");
    const status = document.querySelector("#sync-status-host [role='status']")?.textContent ?? "";
    let revision = null;
    try {
      const cloud = await import("/src/cloud-sync.ts");
      const env = await cloud.fetchRemoteFinance();
      revision = env?.revision ?? null;
    } catch {
      revision = null;
    }
    return {
      pendingSync: meta.pendingSync ?? false,
      lastRemoteRevision: meta.lastRemoteRevision ?? null,
      status,
      remoteRevision: revision,
    };
  });

  // Revert competence month change
  await page.evaluate(() => {
    const raw = localStorage.getItem("cfm:v2:appData");
    if (!raw) return;
    const data = JSON.parse(raw);
    data.selectedCompetenceMonth = "2026-07";
    localStorage.setItem("cfm:v2:appData", JSON.stringify(data));
  });
  await page.evaluate(async () => {
    const store = await import("/src/data-store.ts");
    const storage = await import("/src/storage.ts");
    const loaded = storage.loadAppData();
    if (loaded.ok) {
      await store.retryCloudSync(loaded.data);
    }
  });
  await page.waitForTimeout(6000);

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
