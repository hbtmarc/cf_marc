import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import {
  isFirebaseConfigured,
  readFirebaseConfig,
  useFirebaseEmulators,
} from "./firebase-config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;
let emulatorsConnected = false;

export function initFirebase(): void {
  if (!isFirebaseConfigured() || app) {
    return;
  }

  const config = readFirebaseConfig();
  if (!config) {
    return;
  }

  app = initializeApp(config);
  auth = getAuth(app);
  database = getDatabase(app);

  if (useFirebaseEmulators() && !emulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(database, "127.0.0.1", 9000);
    emulatorsConnected = true;
  }
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    throw new Error("Firebase Auth não inicializado.");
  }
  return auth;
}

export function getFirebaseDatabase(): Database {
  if (!database) {
    throw new Error("Firebase Database não inicializado.");
  }
  return database;
}

export function resetFirebaseForTests(): void {
  app = null;
  auth = null;
  database = null;
  emulatorsConnected = false;
}
