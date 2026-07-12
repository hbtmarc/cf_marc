const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5173";

const shots = [
  {
    file: "planejamento-suggestions-1440.png",
    storage: "storage-suggestions.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-suggestions-host",
  },
  {
    file: "planejamento-suggestion-confirmed-1440.png",
    storage: "storage-confirmed.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "planejamento-suggestion-ignored-1440.png",
    storage: "storage-ignored.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-suggestions-host",
  },
  {
    file: "planejamento-rules-1440.png",
    storage: "storage-rules.json",
    route: "#/planejamento",
    width: 1440,
    height: 900,
    selector: "#planejamento-rules-host",
  },
  {
    file: "planejamento-suggestions-390.png",
    storage: "storage-suggestions.json",
    route: "#/planejamento",
    width: 390,
    height: 844,
    selector: "#planejamento-suggestions-host",
  },
  {
    file: "planejamento-form-390.png",
    storage: "storage-suggestions.json",
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
    await page.waitForTimeout(500);
    if (shot.before) {
      await shot.before(page);
      await page.waitForTimeout(300);
    }
    const target = shot.selector ? page.locator(shot.selector).first() : page;
    await target.screenshot({ path: path.join(outDir, shot.file) });
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
