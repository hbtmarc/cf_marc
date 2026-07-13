import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initFirebase } from "./firebase";

let persistenceReady: Promise<void> | null = null;
let anonymousReady: Promise<User> | null = null;

async function ensurePersistence(): Promise<void> {
  initFirebase();
  const auth = getFirebaseAuth();
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence);
  }
  await persistenceReady;
}

export async function ensureAnonymousSession(): Promise<User> {
  await ensurePersistence();
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    return auth.currentUser;
  }
  if (!anonymousReady) {
    anonymousReady = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        anonymousReady = null;
      });
  }
  return anonymousReady;
}

export function subscribeAuthState(listener: (user: User | null) => void): () => void {
  initFirebase();
  void ensurePersistence();
  return onAuthStateChanged(getFirebaseAuth(), listener);
}

export function getCurrentUser(): User | null {
  initFirebase();
  return getFirebaseAuth().currentUser;
}

export function resetAuthForTests(): void {
  persistenceReady = null;
  anonymousReady = null;
}
