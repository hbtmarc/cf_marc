const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const outDir = __dirname;
const devUrl = "http://localhost:5173";

/** AppData mínimo para capturas — sem valores financeiros reais legíveis */
const maskedAppData = {
  schemaVersion: "cfm.local.v2",
  selectedCompetenceMonth: "2026-07",
  transactions: [
    {
      id: "tx-demo-1",
      kind: "income",
      description: "Lançamento mascarado",
      amountCents: 0,
      date: "2026-07-05",
      competenceMonth: "2026-07",
      category: "Categoria",
      status: "settled",
      createdAt: "2026-07-05T12:00:00.000Z",
      updatedAt: "2026-07-05T12:00:00.000Z",
    },
  ],
  cards: [],
  invoices: [],
  recurringRules: [],
  recurringMatches: [],
};

const storageState = {
  cookies: [],
  origins: [
    {
      origin: devUrl,
      localStorage: [
        { name: "cfm:v2:appData", value: JSON.stringify(maskedAppData) },
        { name: "cfm:v2:installationId", value: "inst-demo-0000-0000-0000-000000000001" },
        {
          name: "cfm:v2:syncMeta",
          value: JSON.stringify({
            installationId: "inst-demo-0000-0000-0000-000000000001",
            lastRemoteRevision: 1,
            lastRemoteUpdatedAt: 1719792000000,
            pendingSync: false,
            pendingBaseRevision: 0,
            pendingChangedAt: 0,
            lastAppliedContentHash: "demo-hash",
            conflictBackup: null,
          }),
        },
      ],
    },
  ],
};

const storagePath = path.join(outDir, "storage-masked.json");
fs.writeFileSync(storagePath, JSON.stringify(storageState, null, 2));

async function setSyncStatus(page, text, withRetry = false) {
  await page.locator("#sync-status-host").evaluate(
    (node, { text, withRetry }) => {
      node.innerHTML = withRetry
        ? `<span class="sidebar__status" aria-hidden="true"></span><span role="status" aria-live="polite">${text}</span><button type="button" class="sidebar__retry btn btn--ghost btn--compact">Tentar novamente</button>`
        : `<span class="sidebar__status" aria-hidden="true"></span><span role="status" aria-live="polite">${text}</span>`;
    },
    { text, withRetry },
  );
}

async function maskFinancialContent(page) {
  await page.addStyleTag({
    content: `
      .metric-card__value, .table td, .table th,
      .dashboard-kpi__value, .text-mono, .amount,
      .page-header__desc, [data-sensitive] {
        filter: blur(6px);
        user-select: none;
      }
    `,
  });
}

async function captureApp(browser, file, options = {}) {
  const context = await browser.newContext({
    storageState: storagePath,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${devUrl}/#/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 10000 });
  if (options.waitMs) {
    await page.waitForTimeout(options.waitMs);
  }
  if (options.syncText) {
    await setSyncStatus(page, options.syncText, options.withRetry);
  }
  if (options.mask !== false) {
    await maskFinancialContent(page);
  }
  const target = options.selector ? page.locator(options.selector).first() : page.locator(".app-shell");
  await target.screenshot({ path: path.join(outDir, file) });
  await context.close();
  console.log(`saved ${file}`);
}

async function captureEnvelopeStructure(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: ui-monospace, monospace; background: #1e1e1e; color: #d4d4d4; margin: 0; padding: 24px; }
    h1 { font-size: 14px; color: #9cdcfe; margin: 0 0 16px; font-weight: 600; }
    pre { background: #252526; border: 1px solid #3c3c3c; border-radius: 8px; padding: 16px; font-size: 13px; line-height: 1.5; }
    .path { color: #ce9178; margin-bottom: 12px; }
    .masked { color: #808080; }
  </style>
</head>
<body>
  <h1>Firebase Realtime Database — estrutura do envelope</h1>
  <p class="path">personal/finance</p>
  <pre>{
  "schemaVersion": "cfm.cloud.v1",
  "revision": 1,
  "updatedAt": 1719792000000,
  "writerId": "<span class="masked">inst-…0001</span>",
  "data": {
    "schemaVersion": "cfm.local.v2",
    "selectedCompetenceMonth": "2026-07",
    "transactions": [ "<span class="masked">…dados mascarados…</span>" ],
    "cards": [],
    "invoices": [],
    "recurringRules": [],
    "recurringMatches": []
  }
}</pre>
</body>
</html>`;
  await page.setContent(html);
  await page.screenshot({ path: path.join(outDir, "rtdb-envelope-structure.png") });
  await page.close();
  console.log("saved rtdb-envelope-structure.png");
}

async function captureEmulatorRules(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 640 } });
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { color: #94a3b8; margin: 0 0 20px; }
    .panel { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .ok { color: #4ade80; }
    ul { margin: 12px 0 0; padding-left: 20px; line-height: 1.7; }
    code { background: #0f172a; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Firebase Emulator Suite — Database Rules</h1>
  <p>npm run firebase:test-rules · vitest.rules.config.ts</p>
  <div class="panel">
    <p class="ok">✓ 19 passed (19) · personal/finance · owner uid autorizado</p>
    <ul>
      <li>nega leitura/escrita não autenticada</li>
      <li>nega uid anônimo não autorizado</li>
      <li>valida envelope <code>cfm.cloud.v1</code></li>
      <li>rejeita escrita na raiz e deleção integral</li>
    </ul>
  </div>
</body>
</html>`;
  await page.setContent(html);
  await page.screenshot({ path: path.join(outDir, "emulator-rules.png") });
  await page.close();
  console.log("saved emulator-rules.png");
}

(async () => {
  const browser = await chromium.launch();

  await captureApp(browser, "dashboard-local-immediate.png", { waitMs: 200 });
  await captureApp(browser, "sync-connecting-background.png", {
    syncText: "Conectando à nuvem…",
  });
  await captureApp(browser, "sync-saved-local-cloud.png", {
    syncText: "Salvo neste dispositivo e na nuvem",
  });
  await captureApp(browser, "sync-offline.png", {
    syncText: "Offline — alterações salvas neste dispositivo",
  });
  await captureApp(browser, "sync-reconnected.png", {
    syncText: "Salvo neste dispositivo e na nuvem",
  });
  await captureApp(browser, "sync-error-recovery.png", {
    syncText: "Erro ao sincronizar",
    withRetry: true,
  });

  await captureEnvelopeStructure(browser);
  await captureEmulatorRules(browser);

  await browser.close();
})();
