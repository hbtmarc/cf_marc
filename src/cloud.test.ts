import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOUD_ENVELOPE_VERSION, coerceRemoteFinance, createFinanceEnvelope, parseFinanceEnvelope } from "./cloud-envelope";
import { hashAppData } from "./content-hash";
import { emptyAppData } from "./storage";

const mockEnsureAnonymous = vi.fn();
const mockFetchRemote = vi.fn();
const mockWriteRemote = vi.fn();
const mockSubscribeFinance = vi.fn();
const mockSubscribeConnectivity = vi.fn();

vi.mock("./auth-service", () => ({
  ensureAnonymousSession: () => mockEnsureAnonymous(),
}));

const mockReplaceRemote = vi.fn();
const mockClearRemote = vi.fn();
const mockSaveDeletionSnapshot = vi.fn();
const mockFetchDeletionSnapshot = vi.fn();
const mockClearDeletionSnapshot = vi.fn();

vi.mock("./cloud-sync", () => ({
  fetchRemoteFinance: () => mockFetchRemote(),
  writeRemoteFinance: (...args: unknown[]) => mockWriteRemote(...args),
  replaceRemoteFinance: (...args: unknown[]) => mockReplaceRemote(...args),
  clearRemoteFinance: () => mockClearRemote(),
  subscribeFinanceListener: (listener: (envelope: unknown) => void) => {
    mockSubscribeFinance(listener);
    return () => undefined;
  },
  subscribeConnectivity: (listener: (connected: boolean) => void) => {
    mockSubscribeConnectivity(listener);
    listener(true);
    return () => undefined;
  },
  isOfflineError: (error: unknown) =>
    error instanceof Error && error.message.toLowerCase().includes("offline"),
  RemoteFinanceInvalidError: class RemoteFinanceInvalidError extends Error {
    name = "RemoteFinanceInvalidError";
  },
  RemoteWriteConflictError: class RemoteWriteConflictError extends Error {
    name = "RemoteWriteConflictError";
  },
}));

vi.mock("./deletion-snapshot", () => ({
  createDeletionSnapshot: (localData: unknown, remoteEnvelope: unknown, createdBy: string, createdAt: number) => ({
    schemaVersion: "cfm.deletion_snapshot.v1",
    createdAt,
    createdBy,
    envelope: remoteEnvelope,
    localData,
  }),
  resolveSnapshotAppData: (snapshot: { envelope?: { data: unknown } | null; localData: unknown }) =>
    snapshot.envelope?.data ?? snapshot.localData,
  saveDeletionSnapshot: (...args: unknown[]) => mockSaveDeletionSnapshot(...args),
  fetchDeletionSnapshot: () => mockFetchDeletionSnapshot(),
  clearDeletionSnapshot: () => mockClearDeletionSnapshot(),
}));

describe("cloud envelope", () => {
  it("creates and parses a valid finance envelope", () => {
    const data = emptyAppData();
    const envelope = createFinanceEnvelope(data, "writer-1", 1);
    expect(envelope.schemaVersion).toBe(CLOUD_ENVELOPE_VERSION);
    expect(envelope.revision).toBe(1);
    expect(parseFinanceEnvelope(envelope)?.data.schemaVersion).toBe("cfm.local.v2");
  });

  it("rejects invalid envelopes", () => {
    expect(parseFinanceEnvelope(null)).toBeNull();
    expect(parseFinanceEnvelope({ schemaVersion: "x", revision: 1, updatedAt: 1, writerId: "w", data: {} })).toBeNull();
  });

  it("coerces legacy AppData stored directly in the RTDB node", () => {
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-08";
    const coerced = coerceRemoteFinance(data);
    expect(coerced?.schemaVersion).toBe(CLOUD_ENVELOPE_VERSION);
    expect(coerced?.revision).toBe(0);
    expect(coerced?.data.selectedCompetenceMonth).toBe("2026-08");
  });
});

describe("data store local-first", () => {
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
    mockEnsureAnonymous.mockResolvedValue({ uid: "anon-test" });
    mockFetchRemote.mockResolvedValue(null);
    mockWriteRemote.mockResolvedValue(
      createFinanceEnvelope(emptyAppData(), "writer-1", 1),
    );
    mockReplaceRemote.mockResolvedValue(
      createFinanceEnvelope(emptyAppData(), "writer-1", 1),
    );
    mockClearRemote.mockResolvedValue(undefined);
    mockSaveDeletionSnapshot.mockResolvedValue(undefined);
    mockFetchDeletionSnapshot.mockResolvedValue(null);
    mockClearDeletionSnapshot.mockResolvedValue(undefined);
    mockSubscribeFinance.mockReset();
    mockSubscribeConnectivity.mockReset();
    const { resetDataStoreForTests } = await import("./data-store");
    const { resetSyncMetaForTests } = await import("./sync-meta");
    resetDataStoreForTests();
    resetSyncMetaForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists locally immediately with offline status when auth pending", async () => {
    const { persistAppData, getSyncStatusState } = await import("./data-store");
    const data = emptyAppData();
    expect(persistAppData(data)).toBe(true);
    expect(getSyncStatusState().status).toBe("offline");
  });

  it("debounces cloud writes after auth is ready", async () => {
    vi.useFakeTimers();
    const { startBackgroundSync, persistAppData, getSyncStatusState } = await import("./data-store");
    await startBackgroundSync();
    const data = emptyAppData();
    persistAppData(data);
    persistAppData(data);
    expect(mockWriteRemote).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    await vi.runAllTimersAsync();
    expect(mockWriteRemote).toHaveBeenCalledTimes(1);
    expect(getSyncStatusState().status).toBe("synced");
    vi.useRealTimers();
  });

  it("flushes pending local changes when remote revision matches base", async () => {
    vi.useFakeTimers();
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-08";
    const envelope = createFinanceEnvelope(emptyAppData(), "writer-1", 1);
    mockFetchRemote.mockResolvedValue(envelope);
    mockWriteRemote.mockResolvedValue(createFinanceEnvelope(data, "writer-1", 2));

    const { startBackgroundSync, persistAppData } = await import("./data-store");
    const { patchSyncMeta, loadSyncMeta } = await import("./sync-meta");

    await startBackgroundSync();
    patchSyncMeta({
      pendingSync: true,
      pendingBaseRevision: 1,
      lastRemoteRevision: 1,
      lastAppliedContentHash: hashAppData(emptyAppData()),
    });
    mockSubscribeFinance.mock.calls[0]?.[0]?.(envelope);

    persistAppData(data);
    await vi.advanceTimersByTimeAsync(700);
    await vi.runAllTimersAsync();

    expect(mockWriteRemote).toHaveBeenCalled();
    expect(loadSyncMeta().pendingSync).toBe(false);
    vi.useRealTimers();
  });

  it("preserves local pending data when remote revision advances", async () => {
    const localData = emptyAppData();
    localData.selectedCompetenceMonth = "2026-08";
    const remoteData = emptyAppData();
    remoteData.selectedCompetenceMonth = "2026-09";
    const remoteEnvelope = createFinanceEnvelope(remoteData, "writer-2", 3);

    const { patchSyncMeta, loadSyncMeta } = await import("./sync-meta");
    const { startBackgroundSync, getSyncStatusState, hasConflictBackup } = await import("./data-store");
    const { saveAppData } = await import("./storage");

    patchSyncMeta({
      pendingSync: true,
      pendingBaseRevision: 2,
      lastRemoteRevision: 2,
    });
    saveAppData(localData);
    await startBackgroundSync();

    mockSubscribeFinance.mock.calls[0]?.[0]?.(remoteEnvelope);

    expect(hasConflictBackup()).toBe(true);
    expect(getSyncStatusState().status).toBe("remote_newer");
    expect(loadSyncMeta().pendingSync).toBe(false);
  });

  it("persists pending sync metadata across reload", async () => {
    const { patchSyncMeta, loadSyncMeta } = await import("./sync-meta");
    patchSyncMeta({ pendingSync: true, pendingBaseRevision: 2, pendingChangedAt: Date.now() });
    expect(loadSyncMeta().pendingSync).toBe(true);
    expect(loadSyncMeta().pendingBaseRevision).toBe(2);
  });

  it("forcePushToCloud replaces remote even when revision metadata is stale", async () => {
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-09";
    const envelope = createFinanceEnvelope(data, "writer-1", 4);
    mockReplaceRemote.mockResolvedValue(envelope);

    const { startBackgroundSync, forcePushToCloud, getSyncStatusState } = await import("./data-store");
    const { patchSyncMeta, loadSyncMeta } = await import("./sync-meta");

    await startBackgroundSync();
    patchSyncMeta({ lastRemoteRevision: 1, pendingBaseRevision: 1 });
    await forcePushToCloud(data);

    expect(mockReplaceRemote).toHaveBeenCalledWith(data, expect.any(String));
    expect(loadSyncMeta().lastRemoteRevision).toBe(4);
    expect(getSyncStatusState().status).toBe("synced");
  });

  it("eraseAllDataWithBackup stores snapshot in RTDB and clears remote", async () => {
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-07";
    const remoteEnvelope = createFinanceEnvelope(data, "writer-2", 2);
    mockFetchRemote.mockResolvedValue(remoteEnvelope);

    const { saveAppData } = await import("./storage");
    const { startBackgroundSync, eraseAllDataWithBackup } = await import("./data-store");
    const { loadDeletionBackup } = await import("./sync-meta");

    saveAppData(data);
    await startBackgroundSync();
    const ok = await eraseAllDataWithBackup();

    expect(ok).toBe(true);
    expect(mockSaveDeletionSnapshot).toHaveBeenCalled();
    expect(loadDeletionBackup()?.snapshotInRtdb).toBe(true);
    expect(mockClearRemote).toHaveBeenCalled();
  });

  it("restoreDeletionBackup restores from RTDB snapshot", async () => {
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-06";
    const envelope = createFinanceEnvelope(data, "writer-1", 3);
    mockReplaceRemote.mockResolvedValue(envelope);
    mockFetchDeletionSnapshot.mockResolvedValue({
      schemaVersion: "cfm.deletion_snapshot.v1",
      createdAt: Date.now(),
      createdBy: "writer-1",
      envelope,
      localData: data,
    });

    const { startBackgroundSync, restoreDeletionBackup } = await import("./data-store");
    const { saveDeletionBackupMarker } = await import("./sync-meta");

    saveDeletionBackupMarker(Date.now());
    await startBackgroundSync();
    const restored = await restoreDeletionBackup();

    expect(restored?.selectedCompetenceMonth).toBe("2026-06");
    expect(mockReplaceRemote).toHaveBeenCalled();
    expect(mockClearDeletionSnapshot).toHaveBeenCalled();
  });
});

describe("sync meta", () => {
  const memoryStore = new Map<string, string>();

  beforeEach(() => {
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
  });

  it("tracks pending sync in localStorage", async () => {
    const { getOrCreateInstallationId, loadSyncMeta, patchSyncMeta } = await import("./sync-meta");
    const id = getOrCreateInstallationId();
    patchSyncMeta({ pendingSync: true, pendingBaseRevision: 0, pendingChangedAt: Date.now() });
    const meta = loadSyncMeta();
    expect(meta.installationId).toBe(id);
    expect(meta.pendingSync).toBe(true);
  });
});
