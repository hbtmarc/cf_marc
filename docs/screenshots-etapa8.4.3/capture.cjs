const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5173";

const shots = [
  {
    file: "lancamentos-renomear-exibicao-1440.png",
    storage: "storage-lancamentos-alias.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.locator('[data-row-actions="tx-bmi-7"] button').first().click();
    },
  },
  {
    file: "lancamentos-alias-aplicado-1440.png",
    storage: "storage-lancamentos-alias.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    selector: ".lancamentos-section--expense",
  },
  {
    file: "fatura-alias-aplicado-1440.png",
    storage: "storage-faturas-alias.json",
    route: "#/faturas",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.getByRole("button", { name: "Ver fatura" }).first().click();
    },
    selector: ".invoice-detail",
  },
  {
    file: "dashboard-alias-aplicado-1440.png",
    storage: "storage-dashboard-alias.json",
    route: "#/dashboard",
    width: 1440,
    height: 900,
    selector: ".dashboard-recent",
  },
  {
    file: "planejamento-consolidado-1440.png",
    storage: "storage-planejamento-consolidado.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: ".planejamento-page",
  },
  {
    file: "planejamento-sugestoes-1440.png",
    storage: "storage-planejamento-consolidado.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-suggestions-host",
  },
  {
    file: "planejamento-ocorrencias-1440.png",
    storage: "storage-planejamento-consolidado.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-occurrences-host",
  },
  {
    file: "planejamento-regras-1440.png",
    storage: "storage-planejamento-consolidado.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "lancamentos-alias-390.png",
    storage: "storage-lancamentos-alias.json",
    route: "#/lancamentos",
    width: 390,
    height: 844,
    selector: ".lancamentos-section--expense",
  },
  {
    file: "planejamento-consolidado-390.png",
    storage: "storage-planejamento-consolidado.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    selector: ".planejamento-page",
  },
  {
    file: "planejamento-formulario-390.png",
    storage: "storage-planejamento-consolidado.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    before: async (page) => {
      await page.getByRole("button", { name: "Nova regra" }).click();
    },
    selector: "#planejamento-form-host",
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
