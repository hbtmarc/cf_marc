const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const outDir = __dirname;
const devUrl = "http://localhost:5173";
const previewUrl = "http://localhost:4177/cf_marc/";

const authHtml = `
<section class="auth-screen">
  <div class="auth-screen__card">
    <p class="auth-screen__mark" aria-hidden="true">CFM</p>
    <h1 class="auth-screen__title">Controle Financeiro Mensal</h1>
    <p class="auth-screen__text">
      Seus dados financeiros ficam vinculados à sua conta Google e sincronizados na nuvem.
    </p>
    <button type="button" class="btn btn--primary auth-screen__button">Entrar com Google</button>
  </div>
</section>
`;

const authErrorHtml = authHtml.replace(
  "<button",
  '<p class="auth-screen__error" role="alert">Não foi possível entrar com Google.</p><button',
);

async function captureAuth(browser, file, width, height, html = authHtml) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${devUrl}/`);
  await page.addStyleTag({ url: `${devUrl}/src/styles.css` });
  await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><body>${html}</body></html>`);
  await page.locator(".auth-screen").screenshot({ path: path.join(outDir, file) });
  await page.close();
  console.log(`saved ${file}`);
}

async function captureAppShot(browser, shot) {
  const context = await browser.newContext({
    storageState: path.join(outDir, shot.storage),
    viewport: { width: shot.width, height: shot.height },
  });
  const page = await context.newPage();
  await page.goto(`${devUrl}/${shot.route}`);
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

(async () => {
  const browser = await chromium.launch();

  await captureAuth(browser, "login-desktop-1440.png", 1440, 900);
  await captureAuth(browser, "login-mobile-390.png", 390, 844);

  const appShots = [
    {
      file: "dashboard-synced-1440.png",
      storage: "storage-dashboard.json",
      route: "#/dashboard",
      width: 1440,
      height: 900,
      selector: ".app-shell",
      before: async (p) => {
        await p.locator("#sync-status-host").evaluate((node) => {
          node.innerHTML =
            '<span class="sidebar__status" aria-hidden="true"></span><span role="status" aria-live="polite">Salvo na nuvem</span>';
        });
      },
    },
    {
      file: "dashboard-synced-390.png",
      storage: "storage-dashboard.json",
      route: "#/dashboard",
      width: 390,
      height: 844,
      selector: ".app-shell",
      before: async (p) => {
        await p.locator("#sync-status-host").evaluate((node) => {
          node.innerHTML =
            '<span class="sidebar__status" aria-hidden="true"></span><span role="status" aria-live="polite">Salvo na nuvem</span>';
        });
      },
    },
    {
      file: "sync-offline-1440.png",
      storage: "storage-dashboard.json",
      route: "#/dashboard",
      width: 1440,
      height: 900,
      selector: ".sidebar__footer",
      before: async (p) => {
        await p.locator("#sync-status-host").evaluate((node) => {
          node.innerHTML =
            '<span class="sidebar__status" aria-hidden="true"></span><span role="status" aria-live="polite">Offline — salvo neste dispositivo</span>';
        });
      },
    },
    {
      file: "sync-error-1440.png",
      storage: "storage-dashboard.json",
      route: "#/dashboard",
      width: 1440,
      height: 900,
      selector: ".sidebar__footer",
      before: async (p) => {
        await p.locator("#sync-status-host").evaluate((node) => {
          node.innerHTML =
            '<span class="sidebar__status" aria-hidden="true"></span><span role="status" aria-live="polite">Erro ao sincronizar</span><button type="button" class="sidebar__retry btn btn--ghost btn--compact">Tentar novamente</button>';
        });
      },
    },
    {
      file: "migration-modal-1440.png",
      storage: "storage-local-migration.json",
      route: "#/dashboard",
      width: 1440,
      height: 900,
      selector: ".modal-panel",
      before: async (p) => {
        await p.evaluate(() => {
          const backdrop = document.createElement("div");
          backdrop.className = "modal-backdrop";
          backdrop.innerHTML = `
            <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <header class="modal-panel__header">
                <h2 class="modal-panel__title" id="modal-title">Levar dados deste dispositivo para a nuvem</h2>
              </header>
              <div class="modal-panel__body">
                <p class="text-body">Foram encontrados dados financeiros salvos neste dispositivo. Eles serão copiados para a sua conta autenticada. Os dados locais permanecem como cache.</p>
              </div>
              <footer class="modal-panel__footer">
                <button type="button" class="btn btn--secondary">Agora não</button>
                <button type="button" class="btn btn--primary">Levar para a nuvem</button>
              </footer>
            </div>`;
          document.body.appendChild(backdrop);
          document.body.classList.add("modal-open");
        });
      },
    },
    {
      file: "logout-ajustes-1440.png",
      storage: "storage-dashboard.json",
      route: "#/ajustes",
      width: 1440,
      height: 900,
      selector: ".settings-layout",
      before: async (p) => {
        await p.locator(".settings-layout").evaluate((node) => {
          const section = document.createElement("section");
          section.className = "settings-section";
          section.innerHTML = `
            <header class="settings-section__header"><h2 class="settings-section__title">Conta</h2></header>
            <p class="text-body">Sessão autenticada com Google.</p>
            <button type="button" class="btn btn--secondary">Sair</button>`;
          node.prepend(section);
        });
      },
    },
  ];

  for (const shot of appShots) {
    await captureAppShot(browser, shot);
  }

  const storageRaw = JSON.parse(
    fs.readFileSync(path.join(outDir, "storage-dashboard.json"), "utf8"),
  ).origins[0].localStorage[0].value;

  const previewContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await previewContext.addInitScript((raw) => {
    localStorage.setItem("cfm:v2:appData", raw);
  }, storageRaw);
  const previewPage = await previewContext.newPage();
  await previewPage.goto(`${previewUrl}#/lancamentos`, { waitUntil: "networkidle" });
  await previewPage.waitForSelector(".app-shell", { timeout: 15000 });
  await previewPage.locator(".app-shell").screenshot({
    path: path.join(outDir, "production-refresh-lancamentos-1440.png"),
  });
  console.log("saved production-refresh-lancamentos-1440.png");
  await previewContext.close();

  await browser.close();
})();
