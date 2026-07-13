/**
 * Obtém o UID da sessão anônima persistida em localhost (perfil Playwright).
 * Uso: node scripts/obtain-owner-uid.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.join(__dirname, "../.playwright-owner-profile");

const browser = await chromium.launchPersistentContext(profileDir, { headless: true });
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto("http://localhost:5173/#/dashboard", { waitUntil: "domcontentloaded" });
const uid = await page.evaluate(async () => {
  const mod = await import("/src/auth-service.ts");
  return (await mod.ensureAnonymousSession()).uid;
});
console.log(uid);
await browser.close();
