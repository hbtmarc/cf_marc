/**
 * Capturas reais sem manipulação do DOM.
 * Uso: node scripts/capture-real-screenshots.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../docs/screenshots-etapa11");
fs.mkdirSync(outDir, { recursive: true });

async function capture(profileDir, url, file, options = {}) {
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector(".app-shell", { timeout: 20000 });

  if (options.waitSynced) {
    await page.waitForFunction(
      () => {
        const text = document.querySelector("#sync-status-host [role='status']")?.textContent ?? "";
        return (
          text.includes("Salvo neste dispositivo e na nuvem") ||
          text.includes("Offline") ||
          text.includes("Dados mais recentes")
        );
      },
      { timeout: 45000 },
    );
  }

  if (options.offline) {
    await page.context().setOffline(true);
    await page.locator(".competence-control__btn").last().click();
    await page.waitForTimeout(2000);
  }

  if (options.reconnect) {
    await page.context().setOffline(false);
    await page.waitForTimeout(8000);
  }

  await page.addStyleTag({
    content: `
      .metric-card__value, .table td, .table th,
      .dashboard-kpi__value, .amount, [data-sensitive] {
        filter: blur(8px);
        user-select: none;
      }
    `,
  });

  const target = options.selector
    ? page.locator(options.selector).first()
    : page.locator(".sidebar__footer");
  await target.screenshot({ path: path.join(outDir, file) });
  console.log(`saved ${file}`);
  await browser.close();
}

const LOCAL = path.join(__dirname, "../.playwright-localhost-profile");
const GITHUB = path.join(__dirname, "../.playwright-github-profile");

await capture(LOCAL, "http://localhost:5173/#/dashboard", "real-localhost-synced.png", {
  waitSynced: true,
});
await capture(GITHUB, "https://hbtmarc.github.io/cf_marc/#/dashboard", "real-github-synced.png", {
  waitSynced: true,
});

// Offline: mesma sessão localhost
const browser = await chromium.launchPersistentContext(LOCAL, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto("http://localhost:5173/#/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".app-shell");
await page.waitForFunction(
  () => {
    const text = document.querySelector("#sync-status-host [role='status']")?.textContent ?? "";
    return (
      text.includes("Salvo neste dispositivo e na nuvem") ||
      text.includes("Offline") ||
      text.includes("Dados mais recentes")
    );
  },
  { timeout: 90000 },
);
await page.context().setOffline(true);
await page.locator(".competence-control__btn").last().click();
await page.waitForTimeout(2500);
await page.addStyleTag({
  content: `.metric-card__value, .table td, .amount { filter: blur(8px); }`,
});
await page.locator(".sidebar__footer").screenshot({
  path: path.join(outDir, "real-offline.png"),
});
console.log("saved real-offline.png");

await page.context().setOffline(false);
await page.waitForTimeout(8000);
await page.locator(".sidebar__footer").screenshot({
  path: path.join(outDir, "real-reconnected.png"),
});
console.log("saved real-reconnected.png");
await browser.close();
