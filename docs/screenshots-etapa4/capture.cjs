const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const outDir = __dirname;
const baseUrl = "http://localhost:5174";
const fixturePath = path.resolve(__dirname, "../../src/fixtures/import-valid.json");

function buildStorageState(competenceMonth = "2026-06") {
  return {
    cookies: [],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: "cfm:v2:appData",
            value: JSON.stringify({
              schemaVersion: "cfm.local.v2",
              selectedCompetenceMonth: competenceMonth,
              transactions: [],
              cards: [],
              invoices: [],
              importMeta: { fingerprints: [] },
            }),
          },
        ],
      },
    ],
  };
}

const shots = [
  {
    file: "importar-vazio-1440.png",
    route: "#/importar",
    width: 1440,
    height: 900,
  },
  {
    file: "importar-revisao-1440.png",
    route: "#/importar",
    width: 1440,
    height: 900,
    before: async (page) => {
      const input = page.locator("#import-file-input");
      await input.setInputFiles(fixturePath);
      await page.waitForSelector(".import-review");
    },
  },
  {
    file: "importar-erro-1440.png",
    route: "#/importar",
    width: 1440,
    height: 900,
    before: async (page) => {
      const badFile = path.join(outDir, "invalid.json");
      fs.writeFileSync(badFile, "{ invalid");
      const input = page.locator("#import-file-input");
      await input.setInputFiles(badFile);
      await page.waitForSelector(".import-message--error");
    },
  },
  {
    file: "importar-sucesso-1440.png",
    route: "#/importar",
    width: 1440,
    height: 900,
    before: async (page) => {
      const input = page.locator("#import-file-input");
      await input.setInputFiles(fixturePath);
      await page.waitForSelector("#import-confirm");
      await page.locator("#import-confirm").click();
      await page.waitForSelector(".import-result");
    },
  },
  {
    file: "importar-mobile-390.png",
    route: "#/importar",
    width: 390,
    height: 844,
  },
  {
    file: "dashboard-apos-importacao.png",
    route: "#/dashboard",
    width: 1440,
    height: 900,
    storage: "imported",
  },
  {
    file: "lancamentos-apos-importacao.png",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    storage: "imported",
  },
  {
    file: "faturas-apos-importacao.png",
    route: "#/faturas",
    width: 1440,
    height: 900,
    storage: "imported",
  },
];

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const importedStatePath = path.join(outDir, "storage-imported.json");

  for (const shot of shots) {
    let storageState = buildStorageState();
    if (shot.storage === "imported") {
      if (!fs.existsSync(importedStatePath)) {
        const context = await browser.newContext({
          storageState: buildStorageState(),
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        await page.goto(`${baseUrl}/#/importar`);
        await page.waitForSelector("#import-file-input");
        await page.locator("#import-file-input").setInputFiles(fixturePath);
        await page.waitForSelector("#import-confirm");
        await page.locator("#import-confirm").click();
        await page.waitForSelector(".import-result");
        await context.storageState({ path: importedStatePath });
        await context.close();
      }
      storageState = importedStatePath;
    }

    const context = await browser.newContext({
      storageState,
      viewport: { width: shot.width, height: shot.height },
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/${shot.route}`);
    await page.waitForSelector("#main-content");
    await page.waitForTimeout(400);
    if (shot.before) {
      await shot.before(page);
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(outDir, shot.file), fullPage: true });
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
