const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5173";

const shots = [
  {
    file: "dashboard-final-1440.png",
    storage: "storage-dashboard.json",
    route: "#/dashboard",
    width: 1440,
    height: 900,
    selector: ".dashboard-page",
  },
  {
    file: "dashboard-final-390.png",
    storage: "storage-dashboard.json",
    route: "#/dashboard",
    width: 390,
    height: 844,
    selector: ".dashboard-page",
  },
  {
    file: "dashboard-final-empty-1440.png",
    storage: "storage-dashboard-empty.json",
    route: "#/dashboard",
    width: 1440,
    height: 900,
    selector: ".dashboard-page",
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
    const target = shot.selector ? page.locator(shot.selector).first() : page;
    await target.screenshot({ path: path.join(outDir, shot.file) });
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
