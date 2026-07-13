import { beforeEach, describe, expect, it, vi } from "vitest";

const signInAnonymously = vi.fn();
const setPersistence = vi.fn();
const onAuthStateChanged = vi.fn();

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: "local",
  signInAnonymously: (...args: unknown[]) => signInAnonymously(...args),
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
    signInAnonymously.mockReset();
    setPersistence.mockReset();
    onAuthStateChanged.mockReset();
    setPersistence.mockResolvedValue(undefined);
    signInAnonymously.mockResolvedValue({ user: { uid: "anon-test-uid" } });
  });

  it("creates anonymous session invisibly", async () => {
    const { ensureAnonymousSession } = await import("./auth-service");
    const user = await ensureAnonymousSession();
    expect(user.uid).toBe("anon-test-uid");
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("sets browser local persistence", async () => {
    const { ensureAnonymousSession } = await import("./auth-service");
    await ensureAnonymousSession();
    expect(setPersistence).toHaveBeenCalledWith(expect.anything(), "local");
  });
});
