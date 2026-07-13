import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPopup = vi.fn();
const signInWithRedirect = vi.fn();
const signOut = vi.fn();
const getRedirectResult = vi.fn();
const setPersistence = vi.fn();
const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: "local",
  signInWithPopup: (...args: unknown[]) => signInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => signInWithRedirect(...args),
  signOut: (...args: unknown[]) => signOut(...args),
  getRedirectResult: (...args: unknown[]) => getRedirectResult(...args),
  setPersistence: (...args: unknown[]) => setPersistence(...args),
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChanged(...args),
}));

vi.mock("./firebase", () => ({
  initFirebase: vi.fn(),
  getFirebaseAuth: () => ({ currentUser: null }),
}));

describe("auth service", () => {
  beforeEach(() => {
    vi.resetModules();
    signInWithPopup.mockReset();
    signInWithRedirect.mockReset();
    signOut.mockReset();
    getRedirectResult.mockReset();
    setPersistence.mockReset();
    onAuthStateChanged.mockReset();
    setPersistence.mockResolvedValue(undefined);
    getRedirectResult.mockResolvedValue(null);
    signInWithPopup.mockResolvedValue({ user: { uid: "user-1" } });
    signOut.mockResolvedValue(undefined);
  });

  it("uses popup sign-in by default", async () => {
    const { signInWithGoogle } = await import("./auth-service");
    const user = await signInWithGoogle();
    expect(user.uid).toBe("user-1");
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("falls back to redirect when popup is blocked", async () => {
    signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    signInWithRedirect.mockResolvedValue(undefined);
    const { signInWithGoogle, AuthRedirectStartedError } = await import("./auth-service");
    await expect(signInWithGoogle()).rejects.toBeInstanceOf(AuthRedirectStartedError);
    expect(signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it("sets browser local persistence", async () => {
    const { ensureFirebaseAuthReady } = await import("./auth-service");
    await ensureFirebaseAuthReady();
    expect(setPersistence).toHaveBeenCalledWith(expect.anything(), "local");
  });

  it("completes redirect sign-in when result exists", async () => {
    getRedirectResult.mockResolvedValue({ user: { uid: "redirect-user" } });
    const { completeRedirectSignIn } = await import("./auth-service");
    const user = await completeRedirectSignIn();
    expect(user?.uid).toBe("redirect-user");
  });

  it("signs out", async () => {
    const { signOutUser } = await import("./auth-service");
    await signOutUser();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("maps popup closed to friendly message", async () => {
    signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    const { signInWithGoogle } = await import("./auth-service");
    await expect(signInWithGoogle()).rejects.toThrow("Entrada cancelada.");
  });
});
