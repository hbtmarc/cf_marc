/**
 * Valida sync via app em localhost com perfil persistente e cache local.
 * Uso: node scripts/validate-localhost-sync.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devUrl = "http://localhost:5173/#/dashboard";
const profileDir = path.join(__dirname, "../.playwright-owner-profile");
const storageFixture = path.join(
  __dirname,
  "../docs/screenshots-etapa10/storage-dashboard.json",
);

const OWNER_UID = "OUfla9cplmMwne0GGVwF8fMOxw93";

function maskUid(value) {
  return value && value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

(async () => {
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });

  const page = browser.pages()[0] ?? (await browser.newPage());

  const report = {
    url: devUrl,
    dashboardVisible: false,
    authScreenAbsent: true,
    syncStatusText: null,
    authUid: null,
    authUidMatchesOwner: false,
    localStorageHasAppData: false,
    pendingSync: null,
    lastRemoteRevision: null,
    rtdbEnvelope: null,
    reloadDashboardVisible: false,
    error: null,
  };

  try {
    if (fs.existsSync(storageFixture)) {
      const fixture = JSON.parse(fs.readFileSync(storageFixture, "utf8"));
      const appEntry = fixture.origins?.[0]?.localStorage?.find(
        (e) => e.name === "cfm:v2:appData",
      );
      if (appEntry?.value) {
        await page.addInitScript((raw) => {
          if (!localStorage.getItem("cfm:v2:appData")) {
            localStorage.setItem("cfm:v2:appData", raw);
          }
        }, appEntry.value);
      }
    }

    await page.goto(devUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector(".app-shell", { timeout: 10000 });
    report.dashboardVisible = true;
    report.authScreenAbsent = (await page.locator(".auth-screen").count()) === 0;

    await page.waitForTimeout(3000);

    const authInfo = await page.evaluate(async () => {
      const authMod = await import("/src/auth-service.ts");
      const user = await authMod.ensureAnonymousSession();
      return { uid: user.uid };
    });
    report.authUid = maskUid(authInfo.uid);
    report.authUidMatchesOwner = authInfo.uid === OWNER_UID;

    const storage = await page.evaluate(() => {
      const metaRaw = localStorage.getItem("cfm:v2:syncMeta");
      let meta = null;
      try {
        meta = metaRaw ? JSON.parse(metaRaw) : null;
      } catch {
        meta = null;
      }
      return {
        hasAppData: Boolean(localStorage.getItem("cfm:v2:appData")),
        pendingSync: meta?.pendingSync ?? null,
        lastRemoteRevision: meta?.lastRemoteRevision ?? null,
      };
    });
    report.localStorageHasAppData = storage.hasAppData;
    report.pendingSync = storage.pendingSync;
    report.lastRemoteRevision = storage.lastRemoteRevision;

    await page
      .waitForFunction(
        () => {
          const el = document.querySelector("#sync-status-host [role='status']");
          const text = el?.textContent ?? "";
          return (
            text.includes("Salvo neste dispositivo e na nuvem") ||
            text.includes("Offline") ||
            text.includes("Erro ao sincronizar") ||
            text.includes("Dados mais recentes") ||
            text.includes("Sincronizando")
          );
        },
        { timeout: 25000 },
      )
      .catch(() => {});

    const syncHost = page.locator("#sync-status-host [role='status']");
    if ((await syncHost.count()) > 0) {
      report.syncStatusText = (await syncHost.first().textContent())?.trim() ?? null;
    }

    if (report.authUidMatchesOwner) {
      report.rtdbEnvelope = await page.evaluate(async () => {
        const mask = (v) => (v && v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)}` : v);
        try {
          const cloud = await import("/src/cloud-sync.ts");
          const env = await cloud.fetchRemoteFinance();
          if (!env) {
            return { exists: false };
          }
          return {
            exists: true,
            schemaVersion: env.schemaVersion,
            revision: env.revision,
            updatedAt: env.updatedAt,
            writerId: mask(env.writerId),
            dataSchemaVersion: env.data?.schemaVersion ?? null,
            transactionCount: Array.isArray(env.data?.transactions)
              ? env.data.transactions.length
              : 0,
          };
        } catch (error) {
          return { exists: false, error: String(error) };
        }
      });
    } else {
      report.rtdbEnvelope = {
        skipped: true,
        reason: "uid não autorizado nas Rules",
      };
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 10000 });
    report.reloadDashboardVisible = true;

    const syncAfterReload = page.locator("#sync-status-host [role='status']");
    if ((await syncAfterReload.count()) > 0) {
      report.syncStatusAfterReload = (await syncAfterReload.first().textContent())?.trim() ?? null;
    }
  } catch (error) {
    report.error = String(error);
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
