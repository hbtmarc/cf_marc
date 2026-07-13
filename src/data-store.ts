import {
  clearDeletionSnapshot,
  createDeletionSnapshot,
  fetchDeletionSnapshot,
  resolveSnapshotAppData,
  saveDeletionSnapshot,
} from "./deletion-snapshot";
import { ensureAnonymousSession, getCurrentUser } from "./auth-service";
import { hashAppData } from "./content-hash";
import {
  clearRemoteFinance,
  fetchRemoteFinance,
  isOfflineError,
  isPermissionDeniedError,
  RemoteFinanceInvalidError,
  RemoteWriteConflictError,
  replaceRemoteFinance,
  subscribeConnectivity,
  subscribeFinanceListener,
  writeRemoteFinance,
} from "./cloud-sync";
import type { FinanceEnvelope } from "./cloud-envelope";
import {
  clearPendingSync,
  clearDeletionBackup,
  getOrCreateInstallationId,
  hasDeletionBackup,
  loadDeletionBackup,
  loadSyncMeta,
  patchSyncMeta,
  saveDeletionBackupMarker,
} from "./sync-meta";
import {
  clearAppData,
  emptyAppData,
  isAppDataEmpty,
  loadAppData,
  saveAppData,
  type StorageLoadResult,
} from "./storage";
import type { AppData } from "./types";

export type SyncStatus =
  | "connecting_cloud"
  | "synced"
  | "syncing"
  | "offline"
  | "error"
  | "remote_newer";

export interface SyncStatusState {
  status: SyncStatus;
  message: string;
  canRetry: boolean;
}

type SyncListener = (state: SyncStatusState) => void;
type DataListener = (data: AppData) => void;

const SYNC_LABELS: Record<SyncStatus, string> = {
  connecting_cloud: "Conectando à nuvem…",
  synced: "Salvo neste dispositivo e na nuvem",
  syncing: "Sincronizando…",
  offline: "Offline — alterações salvas neste dispositivo",
  error: "Erro ao sincronizar",
  remote_newer: "Dados mais recentes recebidos da nuvem",
};

const DEBOUNCE_MS = 600;
const CONNECTING_TIMEOUT_MS = 12_000;

let syncState: SyncStatusState = {
  status: "connecting_cloud",
  message: SYNC_LABELS.connecting_cloud,
  canRetry: false,
};
let listeners = new Set<SyncListener>();
let dataListener: DataListener | null = null;
let pendingData: AppData | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let writeInFlight: Promise<void> | null = null;
let connectingTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemote = false;
let authReady = false;
let listenersAttached = false;
let unsubFinance: (() => void) | null = null;
let unsubConnected: (() => void) | null = null;
let lastWriteRevision: number | null = null;

function emit(): void {
  for (const listener of listeners) {
    listener(syncState);
  }
}

function setSyncState(status: SyncStatus, canRetry = false): void {
  syncState = {
    status,
    message: SYNC_LABELS[status],
    canRetry,
  };
  emit();
}

export function getSyncStatusState(): SyncStatusState {
  return syncState;
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(syncState);
  return () => {
    listeners.delete(listener);
  };
}

export function setDataChangeListener(listener: DataListener | null): void {
  dataListener = listener;
}

export function hasConflictBackup(): boolean {
  return loadSyncMeta().conflictBackup !== null;
}

export function getConflictBackup(): AppData | null {
  return loadSyncMeta().conflictBackup;
}

export function dismissConflictBackup(): void {
  patchSyncMeta({ conflictBackup: null });
}

export { hasDeletionBackup, loadDeletionBackup };

export interface DeletionBackupStatus {
  available: boolean;
  createdAt: number | null;
  source: "rtdb" | "local" | null;
}

async function ensureAuthForCloudOps(): Promise<boolean> {
  if (authReady) {
    return true;
  }
  try {
    await ensureAnonymousSession();
    authReady = true;
    attachListeners();
    return true;
  } catch {
    return false;
  }
}

export async function getDeletionBackupStatus(): Promise<DeletionBackupStatus> {
  const local = loadDeletionBackup();
  if (local?.localData) {
    return { available: true, createdAt: local.createdAt, source: "local" };
  }

  if (await ensureAuthForCloudOps()) {
    try {
      const snapshot = await fetchDeletionSnapshot();
      if (snapshot) {
        return { available: true, createdAt: snapshot.createdAt, source: "rtdb" };
      }
    } catch {
      // fall through to marker check
    }
  }

  if (local?.snapshotInRtdb) {
    return { available: true, createdAt: local.createdAt, source: "rtdb" };
  }

  return { available: false, createdAt: null, source: null };
}

async function resolveDeletionRestoreData(): Promise<{
  data: AppData;
  createdAt: number;
  remoteRevision: number;
} | null> {
  if (await ensureAuthForCloudOps()) {
    try {
      const snapshot = await fetchDeletionSnapshot();
      if (snapshot) {
        return {
          data: resolveSnapshotAppData(snapshot),
          createdAt: snapshot.createdAt,
          remoteRevision: snapshot.envelope?.revision ?? 0,
        };
      }
    } catch {
      // try local fallback
    }
  }

  const local = loadDeletionBackup();
  if (!local?.localData) {
    return null;
  }
  return {
    data: local.remoteEnvelope?.data ?? local.localData,
    createdAt: local.createdAt,
    remoteRevision: local.remoteEnvelope?.revision ?? 0,
  };
}

function applyEnvelopeAfterLocalWrite(envelope: FinanceEnvelope): void {
  lastWriteRevision = envelope.revision;
  saveAppData(envelope.data);
  patchSyncMeta({
    lastRemoteRevision: envelope.revision,
    lastRemoteUpdatedAt: envelope.updatedAt,
    lastAppliedContentHash: hashAppData(envelope.data),
    pendingSync: false,
    pendingBaseRevision: envelope.revision,
    pendingChangedAt: 0,
  });
}

function logUnauthorizedSessionInDev(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const user = getCurrentUser();
  if (!user) {
    return;
  }
  const mask = (v: string) => (v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-6)}` : "****");
  console.warn(
    `[CFM] PERMISSION_DENIED — sessão não autorizada nas Rules (uid ${mask(user.uid)}). ` +
      "Copie o UID completo executando no console:\n" +
      '(await import("/src/auth-service.ts")).ensureAnonymousSession().then(u => console.log(u.uid))',
  );
}

function handleSyncError(error: unknown): void {
  if (isPermissionDeniedError(error)) {
    logUnauthorizedSessionInDev();
    setSyncState("error", true);
    return;
  }
  if (!isOfflineError(error)) {
    setSyncState("error", true);
  }
}

function clearConnectingTimer(): void {
  if (connectingTimer) {
    clearTimeout(connectingTimer);
    connectingTimer = null;
  }
}

function startConnectingTimeout(): void {
  clearConnectingTimer();
  connectingTimer = setTimeout(() => {
    if (syncState.status === "connecting_cloud") {
      setSyncState("error", true);
    }
  }, CONNECTING_TIMEOUT_MS);
}

function notifyDataChange(data: AppData): void {
  dataListener?.(data);
}

function applyRemoteEnvelope(envelope: FinanceEnvelope): void {
  isApplyingRemote = true;
  saveAppData(envelope.data);
  const hash = hashAppData(envelope.data);
  patchSyncMeta({
    lastRemoteRevision: envelope.revision,
    lastRemoteUpdatedAt: envelope.updatedAt,
    lastAppliedContentHash: hash,
  });
  notifyDataChange(envelope.data);
  isApplyingRemote = false;
}

function handleRemoteEnvelope(envelope: FinanceEnvelope | null): void {
  if (isApplyingRemote) {
    return;
  }

  const meta = loadSyncMeta();

  if (!envelope) {
    if (!authReady) {
      return;
    }
    const local = loadAppData();
    const localData = local.ok ? local.data : emptyAppData();
    if (!isAppDataEmpty(localData)) {
      pendingData = localData;
      void flushPendingCloudWrite();
    } else if (!meta.pendingSync) {
      setSyncState("synced");
    }
    return;
  }

  const hash = hashAppData(envelope.data);

  if (
    envelope.revision === meta.lastRemoteRevision &&
    hash === meta.lastAppliedContentHash
  ) {
    if (meta.pendingSync) {
      const local = loadAppData();
      if (local.ok) {
        const localHash = hashAppData(local.data);
        if (localHash !== hash) {
          pendingData = local.data;
          void flushPendingCloudWrite();
          return;
        }
        clearPendingSync();
      }
      setSyncState("synced");
      return;
    }
    setSyncState("synced");
    return;
  }

  if (
    !meta.pendingSync &&
    envelope.revision === meta.lastRemoteRevision &&
    hash !== meta.lastAppliedContentHash
  ) {
    applyRemoteEnvelope(envelope);
    setSyncState("synced");
    return;
  }

  if (lastWriteRevision !== null && envelope.revision === lastWriteRevision) {
    patchSyncMeta({
      lastRemoteRevision: envelope.revision,
      lastRemoteUpdatedAt: envelope.updatedAt,
      lastAppliedContentHash: hash,
    });
    clearPendingSync();
    lastWriteRevision = null;
    setSyncState("synced");
    return;
  }

  if (meta.pendingSync && envelope.revision > meta.pendingBaseRevision) {
    const local = loadAppData();
    if (local.ok) {
      patchSyncMeta({ conflictBackup: structuredClone(local.data) });
    }
    clearPendingSync();
    applyRemoteEnvelope(envelope);
    setSyncState("remote_newer");
    return;
  }

  if (!meta.pendingSync && envelope.revision > meta.lastRemoteRevision) {
    applyRemoteEnvelope(envelope);
    setSyncState("synced");
  }
}

function attachListeners(): void {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;
  unsubFinance = subscribeFinanceListener(handleRemoteEnvelope, (error) => {
    clearConnectingTimer();
    handleSyncError(error);
  });
  unsubConnected = subscribeConnectivity((connected) => {
    if (connected && loadSyncMeta().pendingSync) {
      void flushPendingCloudWrite();
    }
    if (!connected && loadSyncMeta().pendingSync) {
      setSyncState("offline");
    }
  });
}

export async function startBackgroundSync(): Promise<void> {
  getOrCreateInstallationId();
  setSyncState("connecting_cloud");
  startConnectingTimeout();

  try {
    await ensureAnonymousSession();
    authReady = true;
    attachListeners();

    try {
      const remote = await fetchRemoteFinance();
      handleRemoteEnvelope(remote);
    } catch (error) {
      if (error instanceof RemoteFinanceInvalidError) {
        setSyncState("error", true);
        return;
      }
      handleSyncError(error);
    }

    clearConnectingTimer();
    if (syncState.status === "connecting_cloud") {
      const meta = loadSyncMeta();
      setSyncState(meta.pendingSync ? "offline" : "synced");
    }
  } catch {
    clearConnectingTimer();
    setSyncState("error", true);
  }
}

export function persistAppData(data: AppData): boolean {
  if (isApplyingRemote) {
    return saveAppData(data);
  }

  const saved = saveAppData(data);
  if (!saved) {
    return false;
  }

  const meta = loadSyncMeta();
  if (!meta.pendingSync) {
    patchSyncMeta({
      pendingSync: true,
      pendingBaseRevision: meta.lastRemoteRevision,
      pendingChangedAt: Date.now(),
    });
  }

  pendingData = data;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  if (!authReady) {
    setSyncState("offline");
    return true;
  }

  setSyncState("syncing");
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPendingCloudWrite();
  }, DEBOUNCE_MS);

  return true;
}

export async function flushPendingCloudWrite(forcedData?: AppData): Promise<void> {
  const data = forcedData ?? pendingData;
  if (!data) {
    return;
  }

  if (!authReady) {
    try {
      await ensureAnonymousSession();
      authReady = true;
      attachListeners();
    } catch {
      setSyncState("offline");
      return;
    }
  }

  pendingData = data;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (writeInFlight) {
    await writeInFlight;
    if (pendingData && pendingData !== data) {
      await flushPendingCloudWrite();
    }
    return;
  }

  const snapshot = structuredClone(pendingData);
  pendingData = null;
  const meta = loadSyncMeta();
  const writerId = meta.installationId;

  setSyncState("syncing");
  const write = writeRemoteFinance(snapshot, writerId, meta.pendingBaseRevision)
    .then((envelope) => {
      applyEnvelopeAfterLocalWrite(envelope);
      if (!pendingData) {
        setSyncState("synced");
      }
    })
    .catch((error) => {
      pendingData = snapshot;
      if (error instanceof RemoteWriteConflictError) {
        setSyncState("remote_newer", true);
        return;
      }
      setSyncState(isOfflineError(error) ? "offline" : "error", !isOfflineError(error));
    });

  writeInFlight = write;
  await write;
  writeInFlight = null;

  if (pendingData) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flushPendingCloudWrite();
    }, DEBOUNCE_MS);
  }
}

export async function retryCloudSync(data: AppData): Promise<void> {
  pendingData = data;
  await flushPendingCloudWrite(data);
}

export async function forcePushToCloud(data: AppData): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (writeInFlight) {
    await writeInFlight;
  }
  pendingData = null;

  if (!authReady) {
    try {
      await ensureAnonymousSession();
      authReady = true;
      attachListeners();
    } catch {
      setSyncState("offline");
      throw new Error("OFFLINE");
    }
  }

  saveAppData(data);
  const meta = loadSyncMeta();
  const writerId = meta.installationId;
  setSyncState("syncing");

  try {
    const envelope = await replaceRemoteFinance(data, writerId);
    applyEnvelopeAfterLocalWrite(envelope);
    setSyncState("synced");
  } catch (error) {
    pendingData = data;
    patchSyncMeta({
      pendingSync: true,
      pendingBaseRevision: meta.lastRemoteRevision,
      pendingChangedAt: Date.now(),
    });
    handleSyncError(error);
    throw error;
  }
}

export async function eraseAllDataWithBackup(): Promise<boolean> {
  const local = loadAppData();
  const localData = local.ok ? local.data : emptyAppData();

  if (!(await ensureAuthForCloudOps())) {
    return false;
  }

  let remoteEnvelope: FinanceEnvelope | null = null;
  try {
    remoteEnvelope = await fetchRemoteFinance();
  } catch {
    remoteEnvelope = null;
  }

  const createdAt = Date.now();
  const meta = loadSyncMeta();
  const snapshot = createDeletionSnapshot(localData, remoteEnvelope, meta.installationId, createdAt);

  try {
    await saveDeletionSnapshot(snapshot);
  } catch {
    return false;
  }

  if (!saveDeletionBackupMarker(createdAt)) {
    try {
      await clearDeletionSnapshot();
    } catch {
      // ignore rollback failure
    }
    return false;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (writeInFlight) {
    await writeInFlight;
  }
  pendingData = null;
  isApplyingRemote = true;
  clearAppData();
  const fresh = emptyAppData();
  saveAppData(fresh);
  isApplyingRemote = false;

  patchSyncMeta({
    pendingSync: false,
    pendingBaseRevision: 0,
    pendingChangedAt: 0,
    lastRemoteRevision: 0,
    lastRemoteUpdatedAt: 0,
    lastAppliedContentHash: hashAppData(fresh),
    conflictBackup: null,
  });
  lastWriteRevision = null;
  notifyDataChange(fresh);

  try {
    await clearRemoteFinance();
    setSyncState("synced");
  } catch (error) {
    handleSyncError(error);
  }

  return true;
}

export async function restoreDeletionBackup(): Promise<AppData | null> {
  const resolved = await resolveDeletionRestoreData();
  if (!resolved) {
    return null;
  }

  const restored = structuredClone(resolved.data);
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (writeInFlight) {
    await writeInFlight;
  }
  pendingData = null;

  saveAppData(restored);
  notifyDataChange(restored);

  try {
    await forcePushToCloud(restored);
    clearDeletionBackup();
    try {
      await clearDeletionSnapshot();
    } catch {
      // local restore succeeded; snapshot cleanup can retry later
    }
    return restored;
  } catch {
    patchSyncMeta({
      pendingSync: true,
      pendingBaseRevision: resolved.remoteRevision,
      pendingChangedAt: Date.now(),
    });
    setSyncState("offline");
    return restored;
  }
}

export async function waitForPendingCloudWrite(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (writeInFlight) {
    await writeInFlight;
  }
  if (pendingData) {
    await flushPendingCloudWrite();
  }
}

export function loadLocalAppData(): StorageLoadResult {
  return loadAppData();
}

export function resetDataStoreForTests(): void {
  pendingData = null;
  authReady = false;
  listenersAttached = false;
  lastWriteRevision = null;
  isApplyingRemote = false;
  dataListener = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (connectingTimer) {
    clearTimeout(connectingTimer);
    connectingTimer = null;
  }
  writeInFlight = null;
  unsubFinance?.();
  unsubConnected?.();
  unsubFinance = null;
  unsubConnected = null;
  listeners = new Set();
  syncState = {
    status: "connecting_cloud",
    message: SYNC_LABELS.connecting_cloud,
    canRetry: false,
  };
}
