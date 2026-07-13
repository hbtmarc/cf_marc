import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initFirebase } from "./firebase";
import { isFirebaseConfigured } from "./firebase-config";

const provider = new GoogleAuthProvider();

export type AuthListener = (user: User | null) => void;

export function ensureFirebaseAuth(): void {
  if (!isFirebaseConfigured()) {
    return;
  }
  initFirebase();
}

export async function signInWithGoogle(): Promise<User> {
  ensureFirebaseAuth();
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  ensureFirebaseAuth();
  await signOut(getFirebaseAuth());
}

export function subscribeAuthState(listener: AuthListener): () => void {
  ensureFirebaseAuth();
  return onAuthStateChanged(getFirebaseAuth(), listener);
}

export function getCurrentUser(): User | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  ensureFirebaseAuth();
  return getFirebaseAuth().currentUser;
}
