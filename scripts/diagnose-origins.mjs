/**
 * Diagnóstico sanitizado de sessão e erros RTDB por origem.
 * Uso: node scripts/diagnose-origins.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../docs/evidencias-etapa11");
fs.mkdirSync(outDir, { recursive: true });

const PREVIOUS_OWNER = "OUfla9cplmMwne0GGVwF8fMOxw93";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAUahyHNhXgL4KlkQCG1ZXbY0wtKPnz5Go",
  authDomain: "cfmarc-marc35.firebaseapp.com",
  databaseURL: "https://cfmarc-marc35-default-rtdb.firebaseio.com",
  projectId: "cfmarc-marc35",
  storageBucket: "cfmarc-marc35.firebasestorage.app",
  messagingSenderId: "113370477136",
  appId: "1:113370477136:web:6747c0aaca59b45e32d755",
};

function maskUid(uid) {
  if (!uid || uid.length < 8) return "****";
  return `${uid.slice(0, 6)}…${uid.slice(-6)}`;
}

function sanitizeError(error) {
  if (!error) return null;
  return String(error)
    .replace(/AIza[A-Za-z0-9_-]+/g, "[API_KEY]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[TOKEN]")
    .slice(0, 500);
}

function sanitizeOpError(e) {
  if (!e) return null;
  if (typeof e === "object") {
    const o = e;
    return {
      code: o.code ?? null,
      name: o.name ?? null,
      message: String(o.message ?? e).slice(0, 200),
    };
  }
  return { message: String(e).slice(0, 200) };
}

async function diagnoseLocalhost() {
  const profileDir = path.join(__dirname, "../.playwright-localhost-profile");
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  const rtdbErrors = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (/permission_denied|PERMISSION_DENIED/i.test(text)) {
      rtdbErrors.push(sanitizeError(text));
    }
  });

  await page.goto("http://localhost:5173/#/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".app-shell", { timeout: 15000 });
  await page.waitForTimeout(5000);

  const diag = await page.evaluate(async () => {
    const mask = (v) => (v && v.length > 8 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v);
    const authMod = await import("/src/auth-service.ts");
    const cloudMod = await import("/src/cloud-sync.ts");
    const storeMod = await import("/src/data-store.ts");
    const firebaseMod = await import("/src/firebase.ts");

    firebaseMod.initFirebase();
    const user = await authMod.ensureAnonymousSession();

    const result = {
      auth: {
        exists: Boolean(user),
        isAnonymous: user.isAnonymous,
        uidMasked: mask(user.uid),
        uid: user.uid,
      },
      connected: null,
      syncStatus: document.querySelector("#sync-status-host [role='status']")?.textContent?.trim() ?? null,
      syncState: storeMod.getSyncStatusState(),
      operations: [],
    };

    try {
      result.connected = await Promise.race([
        new Promise((resolve) => {
          const unsub = cloudMod.subscribeConnectivity((connected) => {
            unsub();
            resolve(connected);
          });
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
    } catch (e) {
      result.operations.push({ op: "read_connected", error: { code: e?.code, message: e?.message } });
    }

    try {
      await cloudMod.fetchRemoteFinance();
      result.operations.push({ op: "read_personal_finance", error: null });
    } catch (e) {
      result.operations.push({
        op: "read_personal_finance",
        error: { code: e?.code, name: e?.name, message: e?.message },
      });
    }

    return result;
  });

  await browser.close();

  return {
    origin: "localhost",
    url: "http://localhost:5173/#/dashboard",
    auth: {
      exists: diag.auth.exists,
      isAnonymous: diag.auth.isAnonymous,
      uid: diag.auth.uidMasked,
    },
    uidFull: diag.auth.uid,
    connected: diag.connected,
    syncStatus: diag.syncStatus,
    syncState: diag.syncState,
    operations: diag.operations,
    rtdbErrors,
  };
}

async function diagnoseGithubPages() {
  const profileDir = path.join(__dirname, "../.playwright-github-profile");
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  const rtdbErrors = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (/permission_denied|PERMISSION_DENIED/i.test(text)) {
      rtdbErrors.push(sanitizeError(text));
    }
  });

  await page.goto("https://hbtmarc.github.io/cf_marc/#/dashboard", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await page.waitForTimeout(5000);

  const diag = await page.evaluate(async (config) => {
    const mask = (v) => (v && v.length > 8 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v);
    const { initializeApp, getApps, getApp } = await import(
      "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"
    );
    const {
      getAuth,
      signInAnonymously,
      setPersistence,
      browserLocalPersistence,
    } = await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js");
    const { getDatabase, ref, get, onValue } = await import(
      "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js"
    );

    const app = getApps().length ? getApp() : initializeApp(config);
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    let user = auth.currentUser;
    if (!user) {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    }

    const result = {
      auth: {
        exists: Boolean(user),
        isAnonymous: user?.isAnonymous ?? null,
        uidMasked: mask(user?.uid),
        uid: user?.uid,
      },
      connected: null,
      syncStatus: document.querySelector("#sync-status-host [role='status']")?.textContent?.trim() ?? null,
      operations: [],
    };

    const db = getDatabase(app);

    try {
      result.connected = await Promise.race([
        new Promise((resolve, reject) => {
          const unsub = onValue(
            ref(db, ".info/connected"),
            (snap) => {
              unsub();
              resolve(snap.val() === true);
            },
            (err) => {
              unsub();
              reject(err);
            },
          );
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
    } catch (e) {
      result.operations.push({ op: "read_connected", error: { code: e?.code, message: e?.message } });
    }

    try {
      await get(ref(db, "personal/finance"));
      result.operations.push({ op: "read_personal_finance", error: null });
    } catch (e) {
      result.operations.push({
        op: "read_personal_finance",
        error: { code: e?.code, name: e?.name, message: e?.message },
      });
    }

    return result;
  }, FIREBASE_CONFIG);

  await browser.close();

  return {
    origin: "github-pages",
    url: "https://hbtmarc.github.io/cf_marc/#/dashboard",
    auth: {
      exists: diag.auth.exists,
      isAnonymous: diag.auth.isAnonymous,
      uid: diag.auth.uidMasked,
    },
    uidFull: diag.auth.uid,
    connected: diag.connected,
    syncStatus: diag.syncStatus,
    operations: diag.operations,
    rtdbErrors,
  };
}

const localhost = await diagnoseLocalhost();
const github = await diagnoseGithubPages();

const summary = {
  diagnosedAt: new Date().toISOString(),
  previouslyAuthorizedUid: maskUid(PREVIOUS_OWNER),
  uids: {
    localhost: maskUid(localhost.uidFull),
    githubPages: maskUid(github.uidFull),
  },
  uidsAreDifferent: localhost.uidFull !== github.uidFull,
  localhostAuthorizedInCurrentRules: localhost.uidFull === PREVIOUS_OWNER,
  githubPagesAuthorizedInCurrentRules: github.uidFull === PREVIOUS_OWNER,
  origins: [
    { ...localhost, uidFull: undefined },
    { ...github, uidFull: undefined },
  ],
};

fs.writeFileSync(path.join(outDir, "origin-diagnosis.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(outDir, "owner-uids.local.json"),
  JSON.stringify(
    {
      localhost: localhost.uidFull,
      githubPages: github.uidFull,
      previous: PREVIOUS_OWNER,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify(summary, null, 2));
