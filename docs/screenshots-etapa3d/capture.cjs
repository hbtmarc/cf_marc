const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5174";

const shots = [
  { file: "dashboard-1440x900.png", storage: "storage-volume.json", route: "#/dashboard", width: 1440, height: 900 },
  { file: "dashboard-content-stress-1440x900.png", storage: "storage-stress.json", route: "#/dashboard", width: 1440, height: 900 },
  { file: "dashboard-390x844.png", storage: "storage-volume.json", route: "#/dashboard", width: 390, height: 844 },
  { file: "lancamentos-volume-1440x900.png", storage: "storage-volume.json", route: "#/lancamentos", width: 1440, height: 900 },
  {
    file: "lancamentos-long-content-1440x900.png",
    storage: "storage-stress.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
  },
  { file: "lancamentos-390x844.png", storage: "storage-volume.json", route: "#/lancamentos", width: 390, height: 844 },
  { file: "faturas-single-card-1440x900.png", storage: "storage-single.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-multiple-cards-1440x900.png", storage: "storage-stress.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-long-content-1440x900.png", storage: "storage-stress.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-768x1024.png", storage: "storage-stress.json", route: "#/faturas", width: 768, height: 1024 },
  { file: "faturas-390x844.png", storage: "storage-stress.json", route: "#/faturas", width: 390, height: 844 },
  { file: "ajustes-1440x900.png", storage: "storage-volume.json", route: "#/ajustes", width: 1440, height: 900 },
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
  { file: "ajustes-390x844.png", storage: "storage-volume.json", route: "#/ajustes", width: 390, height: 844 },
  { file: "card-single-normal.png", storage: "storage-single.json", route: "#/faturas", width: 520, height: 360, selector: ".card-panel" },
  { file: "card-long-name.png", storage: "storage-stress.json", route: "#/faturas", width: 520, height: 400, selector: ".card-panel" },
  { file: "card-high-value.png", storage: "storage-stress.json", route: "#/faturas", width: 520, height: 400, selector: ".card-panel:nth-child(2)" },
  { file: "card-mobile.png", storage: "storage-stress.json", route: "#/faturas", width: 390, height: 420, selector: ".card-panel" },
  {
    file: "menu-last-row-open.png",
    storage: "storage-volume.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const trigger = page.locator(".row-menu__trigger").last();
      await trigger.click();
      await page.waitForTimeout(200);
    },
  },
  {
    file: "zoom-200-percent.png",
    storage: "storage-stress.json",
    route: "#/faturas",
    width: 1440,
    height: 900,
    zoom: 2,
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
