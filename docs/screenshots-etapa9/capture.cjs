const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5173";

const shots = [
  {
    file: "balanco-empty-1440.png",
    storage: "storage-balanco-empty.json",
    route: "#/balanco",
    width: 1440,
    height: 900,
    selector: ".balanco-page",
  },
  {
    file: "balanco-registered-1440.png",
    storage: "storage-balanco-registered.json",
    route: "#/balanco",
    width: 1440,
    height: 900,
    selector: ".balanco-page",
  },
  {
    file: "balanco-modal-1440.png",
    storage: "storage-balanco.json",
    route: "#/balanco",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.getByRole("button", { name: "Registrar balanço" }).click();
    },
    selector: ".modal-panel",
  },
  {
    file: "balanco-history-1440.png",
    storage: "storage-balanco-registered.json",
    route: "#/balanco",
    width: 1440,
    height: 900,
    selector: ".balanco-history-panel",
  },
  {
    file: "balanco-registered-390.png",
    storage: "storage-balanco-registered.json",
    route: "#/balanco",
    width: 390,
    height: 844,
    selector: ".balanco-page",
  },
  {
    file: "balanco-modal-390.png",
    storage: "storage-balanco.json",
    route: "#/balanco",
    width: 390,
    height: 844,
    before: async (page) => {
      await page.getByRole("button", { name: "Registrar balanço" }).click();
    },
    selector: ".modal-panel",
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
    await page.waitForTimeout(700);
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
