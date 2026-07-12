const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5173";

const shots = [
  {
    file: "planejamento-fixas-1440.png",
    storage: "storage-planejamento-fixas.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "planejamento-editar-fixa-modal-1440.png",
    storage: "storage-planejamento-fixas.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.getByRole("button", { name: "Editar fixa" }).first().click();
    },
    selector: '[role="dialog"]',
  },
  {
    file: "planejamento-atualizar-valor-modal-1440.png",
    storage: "storage-planejamento-fixas.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.getByRole("button", { name: "Atualizar valor" }).first().click();
    },
    selector: '[role="dialog"]',
  },
  {
    file: "planejamento-nova-regra-modal-1440.png",
    storage: "storage-planejamento-fixas.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.getByRole("button", { name: "Nova regra" }).click();
    },
    selector: '[role="dialog"]',
  },
  {
    file: "planejamento-fixas-390.png",
    storage: "storage-planejamento-fixas.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    selector: "#planejamento-rules-host",
  },
  {
    file: "planejamento-editar-fixa-modal-390.png",
    storage: "storage-planejamento-fixas.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    before: async (page) => {
      await page.getByRole("button", { name: "Editar fixa" }).first().click();
    },
    selector: '[role="dialog"]',
  },
  {
    file: "lancamentos-alias-projetado-1440.png",
    storage: "storage-lancamentos-projetado.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.getByRole("button", { name: "Ver detalhes" }).first().click();
    },
    selector: ".ledger-card-block__detail",
  },
  {
    file: "lancamentos-alias-projetado-390.png",
    storage: "storage-lancamentos-projetado.json",
    route: "#/lancamentos",
    width: 390,
    height: 844,
    before: async (page) => {
      await page.getByRole("button", { name: "Ver detalhes" }).first().click();
    },
    selector: ".ledger-card-block__detail",
  },
];

(async () => {
  const browser = await chromium.launch();
  for (const shot of shots) {
    const context = await browser.newContext({
      storageState: path.join(outDir, shot.storage),
      viewport: { width: shot.width, height: shot.height },
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/${shot.route}`);
    await page.waitForTimeout(600);
    if (shot.before) {
      await shot.before(page);
      await page.waitForTimeout(400);
    }
    const target = shot.selector ? page.locator(shot.selector).first() : page;
    await target.screenshot({ path: path.join(outDir, shot.file) });
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
