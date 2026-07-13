/**
 * Obtém UID anônimo persistido por origem.
 * Uso: node scripts/obtain-owner-uid.mjs [localhost|github]
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? "localhost";

const configs = {
  localhost: {
    url: "http://localhost:5173/#/dashboard",
    profileDir: path.join(__dirname, "../.playwright-localhost-profile"),
  },
  github: {
    url: "https://hbtmarc.github.io/cf_marc/#/dashboard",
    profileDir: path.join(__dirname, "../.playwright-github-profile"),
  },
};

const cfg = configs[target];
if (!cfg) {
  console.error("Uso: node scripts/obtain-owner-uid.mjs [localhost|github]");
  process.exit(1);
}

const browser = await chromium.launchPersistentContext(cfg.profileDir, { headless: true });
const page = browser.pages()[0] ?? (await browser.newPage());
await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: 45000 });

if (target === "localhost") {
  const uid = await page.evaluate(async () => {
    const mod = await import("/src/auth-service.ts");
    return (await mod.ensureAnonymousSession()).uid;
  });
  console.log(uid);
} else {
  const uid = await page.evaluate(async () => {
    const { initializeApp, getApps, getApp } = await import(
      "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"
    );
    const { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } = await import(
      "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"
    );
    const config = {
      apiKey: "AIzaSyAUahyHNhXgL4KlkQCG1ZXbY0wtKPnz5Go",
      authDomain: "cfmarc-marc35.firebaseapp.com",
      databaseURL: "https://cfmarc-marc35-default-rtdb.firebaseio.com",
      projectId: "cfmarc-marc35",
      storageBucket: "cfmarc-marc35.firebasestorage.app",
      messagingSenderId: "113370477136",
      appId: "1:113370477136:web:6747c0aaca59b45e32d755",
    };
    const app = getApps().length ? getApp() : initializeApp(config);
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    let user = auth.currentUser;
    if (!user) {
      user = (await signInAnonymously(auth)).user;
    }
    return user.uid;
  });
  console.log(uid);
}

await browser.close();
