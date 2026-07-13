import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import { FIREBASE_WEB_CONFIG, useFirebaseEmulators } from "./firebase-config";

let emulatorsConnected = false;

function getOrCreateApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(FIREBASE_WEB_CONFIG);
}

export function initFirebase(): void {
  const app = getOrCreateApp();
  const auth = getAuth(app);
  const database = getDatabase(app);

  if (useFirebaseEmulators() && !emulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(database, "127.0.0.1", 9000);
    emulatorsConnected = true;
  }
}

export function getFirebaseAuth(): Auth {
  initFirebase();
  return getAuth(getOrCreateApp());
}

export function getFirebaseDatabase(): Database {
  initFirebase();
  return getDatabase(getOrCreateApp());
}

export function resetFirebaseForTests(): void {
  emulatorsConnected = false;
}
