/**
 * Validação de integridade local vs remoto (sanitizado, hash em Node).
 * Uso: node scripts/validate-integrity.mjs
 */
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../docs/evidencias-etapa11");
fs.mkdirSync(outDir, { recursive: true });

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function countCollection(data, field) {
  const value = data?.[field];
  return Array.isArray(value) ? value.length : 0;
}

const COLLECTIONS = [
  "transactions",
  "cards",
  "invoices",
  "recurringRules",
  "recurringMatches",
  "ignoredRecurringSuggestions",
  "transactionDescriptionAliases",
  "monthlyBalances",
];

const profileDir = path.join(__dirname, "../.playwright-localhost-profile");

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = browser.pages()[0] ?? (await browser.newPage());

await page.goto("http://localhost:5173/#/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".app-shell", { timeout: 15000 });

await page.waitForFunction(
  () => {
    const text = document.querySelector("#sync-status-host [role='status']")?.textContent ?? "";
    return text.includes("Salvo neste dispositivo e na nuvem");
  },
  { timeout: 45000 },
);

const payload = await page.evaluate(async () => {
  const storage = await import("/src/storage.ts");
  const cloud = await import("/src/cloud-sync.ts");
  const metaMod = await import("/src/sync-meta.ts");
  const local = storage.loadAppData();
  const remote = await cloud.fetchRemoteFinance();
  const meta = metaMod.loadSyncMeta();

  if (!local.ok) return { error: "local_load_failed" };

  const localNorm = storage.normalizeAppData(structuredClone(local.data));
  const remoteNorm = remote?.data
    ? storage.normalizeAppData(structuredClone(remote.data))
    : null;

  return {
    localCanonical: storage.serializeAppData(localNorm),
    remoteCanonical: remoteNorm ? storage.serializeAppData(remoteNorm) : null,
    revision: remote?.revision ?? meta.lastRemoteRevision,
    selectedCompetenceMonth: localNorm.selectedCompetenceMonth,
    topLevelFields: Object.keys(localNorm).sort(),
    collectionCounts: {
      transactions: (localNorm.transactions ?? []).length,
      cards: (localNorm.cards ?? []).length,
      invoices: (localNorm.invoices ?? []).length,
      recurringRules: (localNorm.recurringRules ?? []).length,
      recurringMatches: (localNorm.recurringMatches ?? []).length,
      ignoredRecurringSuggestions: (localNorm.ignoredRecurringSuggestions ?? []).length,
      transactionDescriptionAliases: (localNorm.transactionDescriptionAliases ?? []).length,
      monthlyBalances: (localNorm.monthlyBalances ?? []).length,
    },
    remoteCollectionCounts: remoteNorm
      ? {
          transactions: (remoteNorm.transactions ?? []).length,
          cards: (remoteNorm.cards ?? []).length,
          invoices: (remoteNorm.invoices ?? []).length,
          recurringRules: (remoteNorm.recurringRules ?? []).length,
          recurringMatches: (remoteNorm.recurringMatches ?? []).length,
          ignoredRecurringSuggestions: (remoteNorm.ignoredRecurringSuggestions ?? []).length,
          transactionDescriptionAliases: (remoteNorm.transactionDescriptionAliases ?? []).length,
          monthlyBalances: (remoteNorm.monthlyBalances ?? []).length,
        }
      : null,
    syncStatus:
      document.querySelector("#sync-status-host [role='status']")?.textContent?.trim() ?? null,
  };
});

await browser.close();

if (payload.error) {
  console.error(payload.error);
  process.exit(1);
}

const localHash = sha256(payload.localCanonical);
const remoteHash = payload.remoteCanonical ? sha256(payload.remoteCanonical) : null;
const hashesMatch = remoteHash !== null && localHash === remoteHash;

const lines = [
  `validatedAt: ${new Date().toISOString()}`,
  `syncStatus: ${payload.syncStatus}`,
  `revision: ${payload.revision ?? "null"}`,
  `selectedCompetenceMonth: ${payload.selectedCompetenceMonth}`,
  `localHash: ${localHash}`,
  `remoteHash: ${remoteHash ?? "null"}`,
  `hashesMatch: ${hashesMatch}`,
  `topLevelFields: ${payload.topLevelFields.join(", ")}`,
  "collectionCounts:",
  ...COLLECTIONS.map((k) => `  ${k}: ${payload.collectionCounts[k] ?? 0}`),
];

if (payload.remoteCollectionCounts) {
  lines.push("remoteCollectionCounts:");
  for (const k of COLLECTIONS) {
    lines.push(`  ${k}: ${payload.remoteCollectionCounts[k] ?? 0}`);
  }
}

const content = lines.join("\n");
fs.writeFileSync(path.join(outDir, "local-remote-integrity.txt"), content);
console.log(content);
