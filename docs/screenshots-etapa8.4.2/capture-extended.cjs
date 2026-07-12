const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5173";

const shots = [
  {
    file: "planejamento-suggestions-grouped-1440.png",
    storage: "storage-suggestions.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-suggestions-host",
  },
  {
    file: "planejamento-subscription-confirmed-1440.png",
    storage: "storage-subscription.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "planejamento-subscription-renewal-1440.png",
    storage: "storage-subscription-renewal.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "planejamento-fixed-bill-value-change-1440.png",
    storage: "storage-fixed-bill-versions.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "lancamentos-recurring-icons-1440.png",
    storage: "storage-lancamentos-recurring.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    selector: ".lancamentos-section--expense",
  },
  {
    file: "planejamento-subscription-390.png",
    storage: "storage-subscription.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    selector: "#planejamento-suggestions-host",
  },
  {
    file: "planejamento-fixed-bill-390.png",
    storage: "storage-fixed-bill-versions.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    selector: "#planejamento-rules-host",
  },
  {
    file: "lancamentos-recurring-icons-390.png",
    storage: "storage-lancamentos-recurring.json",
    route: "#/lancamentos",
    width: 390,
    height: 844,
    selector: ".lancamentos-section--expense",
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
    await page.waitForTimeout(500);
    const target = shot.selector ? page.locator(shot.selector).first() : page;
    await target.screenshot({ path: path.join(outDir, shot.file) });
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
