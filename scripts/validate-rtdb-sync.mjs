/**
 * Valida sessão anônima e estado do nó personal/finance no RTDB real.
 * Uso: node scripts/validate-rtdb-sync.mjs
 */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import { getDatabase, ref, get } from "firebase/database";

const config = {
  apiKey: "AIzaSyAUahyHNhXgL4KlkQCG1ZXbY0wtKPnz5Go",
  authDomain: "cfmarc-marc35.firebaseapp.com",
  databaseURL: "https://cfmarc-marc35-default-rtdb.firebaseio.com",
  projectId: "cfmarc-marc35",
  storageBucket: "cfmarc-marc35.firebasestorage.app",
  messagingSenderId: "113370477136",
  appId: "1:113370477136:web:6747c0aaca59b45e32d755",
};

const app = initializeApp(config);
const auth = getAuth(app);
const db = getDatabase(app);

await setPersistence(auth, browserLocalPersistence);

const uid = await new Promise((resolve, reject) => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    unsub();
    if (user) {
      resolve(user.uid);
      return;
    }
    try {
      const cred = await signInAnonymously(auth);
      resolve(cred.user.uid);
    } catch (error) {
      reject(error);
    }
  });
});

const snapshot = await get(ref(db, "personal/finance"));
const envelope = snapshot.val();

const maskUid = (value) =>
  value && value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "****";

const report = {
  uid: maskUid(uid),
  uidMatchesOwner: uid === "OUfla9cplmMwne0GGVwF8fMOxw93",
  rtdbPath: "personal/finance",
  envelopeExists: envelope !== null,
  schemaVersion: envelope?.schemaVersion ?? null,
  revision: envelope?.revision ?? null,
  updatedAt: envelope?.updatedAt ?? null,
  writerId: envelope?.writerId ? maskUid(envelope.writerId) : null,
  dataSchemaVersion: envelope?.data?.schemaVersion ?? null,
  transactionCount: Array.isArray(envelope?.data?.transactions)
    ? envelope.data.transactions.length
    : 0,
};

console.log(JSON.stringify(report, null, 2));
