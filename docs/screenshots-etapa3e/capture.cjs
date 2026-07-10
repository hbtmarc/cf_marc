const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5174";

const shots = [
  { file: "dashboard-alignment-1440x900.png", storage: "storage-volume.json", route: "#/dashboard", width: 1440, height: 900 },
  { file: "dashboard-alignment-1366x768.png", storage: "storage-volume.json", route: "#/dashboard", width: 1366, height: 768 },
  { file: "dashboard-columns-1024x768.png", storage: "storage-volume.json", route: "#/dashboard", width: 1024, height: 768 },
  { file: "dashboard-mobile-390x844.png", storage: "storage-volume.json", route: "#/dashboard", width: 390, height: 844 },
  { file: "lancamentos-toolbar-1440x900.png", storage: "storage-volume.json", route: "#/lancamentos", width: 1440, height: 900 },
  { file: "lancamentos-volume-1440x900.png", storage: "storage-volume.json", route: "#/lancamentos", width: 1440, height: 900 },
  {
    file: "lancamentos-reflow-200-percent.png",
    storage: "storage-volume.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    zoom: 2,
  },
  { file: "lancamentos-mobile-390x844.png", storage: "storage-volume.json", route: "#/lancamentos", width: 390, height: 844 },
  { file: "faturas-single-1440x900.png", storage: "storage-single.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-multiple-1440x900.png", storage: "storage-stress.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-table-alignment-1440x900.png", storage: "storage-volume.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-mobile-390x844.png", storage: "storage-stress.json", route: "#/faturas", width: 390, height: 844 },
  { file: "ajustes-alignment-1440x900.png", storage: "storage-volume.json", route: "#/ajustes", width: 1440, height: 900 },
  {
    file: "ajustes-details-open-1440x900.png",
    storage: "storage-volume.json",
    route: "#/ajustes",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.locator("details.settings-details summary").click();
    },
  },
  { file: "ajustes-mobile-390x844.png", storage: "storage-volume.json", route: "#/ajustes", width: 390, height: 844 },
  {
    file: "sidebar-alignment.png",
    storage: "storage-volume.json",
    route: "#/dashboard",
    width: 1440,
    height: 900,
    selector: ".sidebar",
  },
  {
    file: "controls-baseline.png",
    storage: "storage-volume.json",
    route: "#/lancamentos",
    width: 1440,
    height: 420,
    selector: ".toolbar-panel",
  },
  {
    file: "tables-alignment.png",
    storage: "storage-volume.json",
    route: "#/faturas",
    width: 1440,
    height: 720,
    selector: ".data-table-panel",
  },
];

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  for (const shot of shots) {
    const context = await browser.newContext({
      storageState: path.join(outDir, shot.storage),
      viewport: { width: shot.width, height: shot.height },
    });
    const page = await context.newPage();
    if (shot.zoom) {
      await page.goto(`${baseUrl}/${shot.route}`);
      await page.evaluate(() => {
        document.body.style.zoom = "200%";
      });
    } else {
      await page.goto(`${baseUrl}/${shot.route}`);
    }
    await page.waitForSelector("#main-content");
    await page.waitForTimeout(400);
    if (shot.before) {
      await shot.before(page);
      await page.waitForTimeout(300);
    }
    if (shot.selector) {
      const el = page.locator(shot.selector).first();
      await el.screenshot({ path: path.join(outDir, shot.file) });
    } else {
      await page.screenshot({ path: path.join(outDir, shot.file), fullPage: true });
    }
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
