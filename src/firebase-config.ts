/**
 * Configuração web pública do Firebase (cliente).
 * Não incluir credenciais administrativas neste arquivo.
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyAUayHhNhXgL4KlkQCG1ZXbY0wtKPnz5Go",
  authDomain: "cfmarc-marc35.firebaseapp.com",
  databaseURL: "https://cfmarc-marc35-default-rtdb.firebaseio.com",
  projectId: "cfmarc-marc35",
  storageBucket: "cfmarc-marc35.firebasestorage.app",
  messagingSenderId: "113370477136",
  appId: "1:113370477136:web:6747c0aaca59b45e32d755",
} as const;

export type FirebaseWebConfig = typeof FIREBASE_WEB_CONFIG;

export function readFirebaseConfig(): FirebaseWebConfig {
  return FIREBASE_WEB_CONFIG;
}

export function isFirebaseConfigured(): boolean {
  return true;
}

export function useFirebaseEmulators(): boolean {
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
}

export const GITHUB_PAGES_ORIGIN = "https://hbtmarc.github.io";
