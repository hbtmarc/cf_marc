const { chromium } = require("playwright");
const path = require("node:path");

const outDir = __dirname;
const baseUrl = "http://localhost:5174";

const shots = [
  { file: "dashboard-filled-1440x900.png", storage: "storage-volume.json", route: "#/dashboard", width: 1440, height: 900 },
  { file: "dashboard-negative-1440x900.png", storage: "storage-negative.json", route: "#/dashboard", width: 1440, height: 900 },
  { file: "dashboard-empty-390x844.png", storage: "storage-empty.json", route: "#/dashboard", width: 390, height: 844 },
  { file: "lancamentos-volume-1440x900.png", storage: "storage-volume.json", route: "#/lancamentos", width: 1440, height: 900 },
  {
    file: "lancamentos-filtered-1440x900.png",
    storage: "storage-volume.json",
    route: "#/lancamentos",
    width: 1440,
    height: 900,
    before: async (page) => {
      await page.fill("#tx-search", "mercado");
      await page.waitForTimeout(300);
    },
  },
  { file: "lancamentos-mobile-390x844.png", storage: "storage-volume.json", route: "#/lancamentos", width: 390, height: 844 },
  { file: "faturas-multiple-1440x900.png", storage: "storage-volume.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-single-1440x900.png", storage: "storage-single-fatura.json", route: "#/faturas", width: 1440, height: 900 },
  { file: "faturas-mobile-390x844.png", storage: "storage-volume.json", route: "#/faturas", width: 390, height: 844 },
  { file: "ajustes-1440x900.png", storage: "storage-volume.json", route: "#/ajustes", width: 1440, height: 900 },
  { file: "ajustes-mobile-390x844.png", storage: "storage-volume.json", route: "#/ajustes", width: 390, height: 844 },
];

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  for (const shot of shots) {
    const context = await browser.newContext({
      storageState: path.join(outDir, shot.storage),
      viewport: { width: shot.width, height: shot.height },
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/${shot.route}`);
    await page.waitForSelector("#main-content");
    await page.waitForTimeout(500);
    if (shot.before) {
      await shot.before(page);
    }
    await page.screenshot({ path: path.join(outDir, shot.file), fullPage: true });
    await context.close();
    console.log(`saved ${shot.file}`);
  }
  await browser.close();
})();
