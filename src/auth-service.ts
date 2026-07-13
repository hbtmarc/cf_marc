import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  type Unsubscribe,
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

function waitForInitialAuthState(): Promise<User | null> {
  const auth = getFirebaseAuth();
  return new Promise((resolve) => {
    let unsub: Unsubscribe = () => undefined;
    unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

export async function ensureAnonymousSession(): Promise<User> {
  await ensurePersistence();
  if (!anonymousReady) {
    anonymousReady = (async () => {
      const restored = await waitForInitialAuthState();
      if (restored) {
        return restored;
      }
      const auth = getFirebaseAuth();
      const credential = await signInAnonymously(auth);
      return credential.user;
    })().finally(() => {
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
