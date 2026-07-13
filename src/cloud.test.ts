import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOUD_ENVELOPE_VERSION, createFinanceEnvelope, parseFinanceEnvelope } from "./cloud-envelope";
import { emptyAppData } from "./storage";

const mockIsFirebaseConfigured = vi.fn(() => false);
const mockFetchRemote = vi.fn();
const mockWriteRemote = vi.fn();

vi.mock("./firebase-config", () => ({
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
  useFirebaseEmulators: () => false,
  readFirebaseConfig: () => ({
    apiKey: "x",
    authDomain: "x",
    databaseURL: "https://x.firebaseio.com",
    projectId: "x",
    storageBucket: "x",
    messagingSenderId: "x",
    appId: "x",
  }),
}));

vi.mock("./cloud-sync", () => ({
  fetchRemoteFinance: (...args: unknown[]) => mockFetchRemote(...args),
  writeRemoteFinance: (...args: unknown[]) => mockWriteRemote(...args),
  isOfflineError: (error: unknown) =>
    error instanceof Error && error.message.toLowerCase().includes("offline"),
  RemoteFinanceInvalidError: class RemoteFinanceInvalidError extends Error {
    name = "RemoteFinanceInvalidError";
  },
}));

describe("cloud envelope", () => {
  it("creates and parses a valid finance envelope", () => {
    const data = emptyAppData();
    const envelope = createFinanceEnvelope(data);
    expect(envelope.schemaVersion).toBe(CLOUD_ENVELOPE_VERSION);
    expect(parseFinanceEnvelope(envelope)?.data.schemaVersion).toBe("cfm.local.v2");
  });

  it("rejects invalid envelopes", () => {
    expect(parseFinanceEnvelope(null)).toBeNull();
    expect(parseFinanceEnvelope({ schemaVersion: "x", updatedAt: 1, data: {} })).toBeNull();
    expect(
      parseFinanceEnvelope({
        schemaVersion: CLOUD_ENVELOPE_VERSION,
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: emptyAppData(),
      }),
    ).toBeNull();
  });

  it("uses numeric updatedAt", () => {
    const envelope = createFinanceEnvelope(emptyAppData());
    expect(typeof envelope.updatedAt).toBe("number");
  });
});

describe("data store", () => {
  const memoryStore = new Map<string, string>();

  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    memoryStore.clear();
    vi.stubGlobal("localStorage", {
      get length() {
        return memoryStore.size;
      },
      clear: () => memoryStore.clear(),
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
      key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    });
    mockIsFirebaseConfigured.mockReturnValue(false);
    mockFetchRemote.mockReset();
    mockWriteRemote.mockReset();
    mockWriteRemote.mockResolvedValue(undefined);
    const { resetDataStoreForTests } = await import("./data-store");
    resetDataStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists locally without cloud when firebase is not configured", async () => {
    const { persistAppData, getSyncStatusState } = await import("./data-store");
    const data = emptyAppData();
    expect(persistAppData(data)).toBe(true);
    expect(getSyncStatusState().status).toBe("offline");
  });

  it("loads remote data when cloud has a snapshot", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    const remote = emptyAppData();
    remote.transactions.push({
      id: "tx-remote",
      kind: "income",
      description: "Remoto",
      amountCents: 50_000,
      date: "2026-07-01",
      competenceMonth: "2026-07",
      category: "Trabalho",
      status: "settled",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    mockFetchRemote.mockResolvedValue(createFinanceEnvelope(remote));

    const { bootstrapUserData } = await import("./data-store");
    const boot = await bootstrapUserData("user-1");
    expect(boot.needsMigration).toBe(false);
    expect(boot.data.transactions).toHaveLength(1);
    expect(boot.data.transactions[0]?.id).toBe("tx-remote");
  });

  it("flags migration when remote is empty and local has data", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockFetchRemote.mockResolvedValue(null);
    const { saveAppData } = await import("./storage");
    const local = emptyAppData();
    local.cards.push({
      id: "card-1",
      name: "Principal",
      closingDay: 5,
      dueDay: 12,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    saveAppData(local);

    const { bootstrapUserData } = await import("./data-store");
    const boot = await bootstrapUserData("user-1");
    expect(boot.needsMigration).toBe(true);
    expect(boot.data.cards).toHaveLength(1);
  });

  it("migrates local data to cloud on confirmation", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    const data = emptyAppData();
    data.monthlyBalances = [
      {
        id: "monthly-balance:2026-07",
        competenceMonth: "2026-07",
        incomeCents: 1,
        expenseCents: 2,
        balanceCents: -1,
        projectedBalanceCents: 0,
        fixedBillsCents: 0,
        invoicesCents: 0,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ];

    const { migrateLocalDataToCloud, getSyncStatusState } = await import("./data-store");
    await migrateLocalDataToCloud("user-1", data);
    expect(mockWriteRemote).toHaveBeenCalledWith("user-1", data);
    expect(getSyncStatusState().status).toBe("cloud");
  });

  it("falls back to local cache when remote fetch fails offline", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockFetchRemote.mockRejectedValue({ code: "unavailable" });
    const { saveAppData } = await import("./storage");
    const local = emptyAppData();
    local.recurringRules = [
      {
        id: "rule-1",
        kind: "expense",
        description: "Internet",
        amountCents: 12_000,
        category: "Casa",
        dayOfMonth: 10,
        startMonth: "2026-01",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        renewalPolicy: "none",
        seriesId: "rule-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    saveAppData(local);

    const { bootstrapUserData, getSyncStatusState } = await import("./data-store");
    const boot = await bootstrapUserData("user-1");
    expect(boot.data.recurringRules).toHaveLength(1);
    expect(getSyncStatusState().status).toBe("offline");
  });

  it("keeps local cache when remote envelope is invalid", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    const { RemoteFinanceInvalidError } = await import("./cloud-sync");
    mockFetchRemote.mockRejectedValue(new RemoteFinanceInvalidError());
    const { saveAppData } = await import("./storage");
    const local = emptyAppData();
    local.transactions.push({
      id: "tx-local",
      kind: "income",
      description: "Local",
      amountCents: 1000,
      date: "2026-07-01",
      competenceMonth: "2026-07",
      category: "Outros",
      status: "pending",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    saveAppData(local);

    const { bootstrapUserData, getSyncStatusState } = await import("./data-store");
    const boot = await bootstrapUserData("user-1");
    expect(boot.data.transactions).toHaveLength(1);
    expect(getSyncStatusState().status).toBe("error");
    expect(getSyncStatusState().canRetry).toBe(true);
  });

  it("debounces cloud writes", async () => {
    vi.useFakeTimers();
    mockIsFirebaseConfigured.mockReturnValue(true);
    const { bindCloudUser, persistAppData, flushPendingCloudWrite } = await import("./data-store");
    bindCloudUser("user-1");
    const data = emptyAppData();
    persistAppData(data);
    persistAppData(data);
    expect(mockWriteRemote).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    await flushPendingCloudWrite();
    expect(mockWriteRemote).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("recovers from sync error with retry", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockWriteRemote.mockRejectedValueOnce(new Error("server error"));
    mockWriteRemote.mockResolvedValueOnce(undefined);

    const { bindCloudUser, retryCloudSync, getSyncStatusState } = await import("./data-store");
    bindCloudUser("user-1");
    await retryCloudSync(emptyAppData());
    expect(getSyncStatusState().status).toBe("error");

    await retryCloudSync(emptyAppData());
    expect(getSyncStatusState().status).toBe("cloud");
  });
});

describe("storage helpers", () => {
  it("detects empty app data", async () => {
    const { isAppDataEmpty } = await import("./storage");
    expect(isAppDataEmpty(emptyAppData())).toBe(true);
  });
});
