import {
  browserLocalPersistence,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initFirebase } from "./firebase";

const provider = new GoogleAuthProvider();

export type AuthListener = (user: User | null) => void;

let persistenceReady: Promise<void> | null = null;

function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Não foi possível entrar com Google.";
  }
  const code = (error as { code?: string }).code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Entrada cancelada.";
  }
  if (code === "auth/popup-blocked") {
    return "Popup bloqueado. Tentando redirecionamento…";
  }
  if (code === "auth/unauthorized-domain") {
    return "Este domínio não está autorizado no Firebase Authentication.";
  }
  if (code === "auth/network-request-failed") {
    return "Falha de rede ao autenticar. Verifique sua conexão.";
  }
  return "Não foi possível entrar com Google.";
}

function isPopupBlocked(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code ?? "";
  return code === "auth/popup-blocked" || code === "auth/cancelled-popup-request";
}

export class AuthRedirectStartedError extends Error {
  constructor() {
    super("Redirecionamento de autenticação iniciado.");
    this.name = "AuthRedirectStartedError";
  }
}

async function ensurePersistence(): Promise<void> {
  initFirebase();
  const auth = getFirebaseAuth();
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence);
  }
  await persistenceReady;
}

export async function ensureFirebaseAuthReady(): Promise<void> {
  await ensurePersistence();
}

export async function completeRedirectSignIn(): Promise<User | null> {
  await ensurePersistence();
  const result = await getRedirectResult(getFirebaseAuth());
  return result?.user ?? null;
}

export async function signInWithGoogle(): Promise<User> {
  await ensurePersistence();
  const auth = getFirebaseAuth();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    if (isPopupBlocked(error)) {
      await signInWithRedirect(auth, provider);
      throw new AuthRedirectStartedError();
    }
    throw new Error(authErrorMessage(error));
  }
}

export async function signOutUser(): Promise<void> {
  await ensurePersistence();
  await signOut(getFirebaseAuth());
}

export function subscribeAuthState(listener: AuthListener): () => void {
  initFirebase();
  void ensurePersistence();
  return onAuthStateChanged(getFirebaseAuth(), listener);
}

export function getCurrentUser(): User | null {
  initFirebase();
  return getFirebaseAuth().currentUser;
}

export { authErrorMessage };
