import { isFirebaseConfigured } from "./firebase-config";
import { fetchRemoteFinance, isOfflineError, RemoteFinanceInvalidError, writeRemoteFinance } from "./cloud-sync";
import {
  emptyAppData,
  isAppDataEmpty,
  loadAppData,
  saveAppData,
  type StorageLoadResult,
} from "./storage";
import type { AppData } from "./types";

export type SyncStatus =
  | "connecting"
  | "syncing"
  | "cloud"
  | "offline"
  | "error";

export interface SyncStatusState {
  status: SyncStatus;
  message: string;
  canRetry: boolean;
}

type SyncListener = (state: SyncStatusState) => void;

const SYNC_LABELS: Record<SyncStatus, string> = {
  connecting: "Conectando…",
  syncing: "Sincronizando…",
  cloud: "Salvo na nuvem",
  offline: "Offline — salvo neste dispositivo",
  error: "Erro ao sincronizar",
};

let currentUid: string | null = null;
let syncState: SyncStatusState = {
  status: isFirebaseConfigured() ? "connecting" : "offline",
  message: isFirebaseConfigured() ? SYNC_LABELS.connecting : SYNC_LABELS.offline,
  canRetry: false,
};
let listeners = new Set<SyncListener>();
let pendingData: AppData | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let writeInFlight: Promise<void> | null = null;
const DEBOUNCE_MS = 600;

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

export function bindCloudUser(uid: string | null): void {
  currentUid = uid;
  if (!uid) {
    setSyncState(isFirebaseConfigured() ? "connecting" : "offline");
  }
}

export async function bootstrapUserData(uid: string): Promise<{
  data: AppData;
  needsMigration: boolean;
  localOnly: boolean;
}> {
  if (!isFirebaseConfigured()) {
    const local = loadAppData();
    return {
      data: local.ok ? local.data : emptyAppData(),
      needsMigration: false,
      localOnly: true,
    };
  }

  setSyncState("syncing");
  const local = loadAppData();
  const localData = local.ok ? local.data : emptyAppData();
  const localHasData = !isAppDataEmpty(localData);

  try {
    const remote = await fetchRemoteFinance(uid);
    if (remote) {
      saveAppData(remote.data);
      setSyncState("cloud");
      return { data: remote.data, needsMigration: false, localOnly: false };
    }

    if (localHasData) {
      setSyncState("offline");
      return { data: localData, needsMigration: true, localOnly: false };
    }

    const empty = emptyAppData();
    saveAppData(empty);
    setSyncState("cloud");
    return { data: empty, needsMigration: false, localOnly: false };
  } catch (error) {
    if (error instanceof RemoteFinanceInvalidError) {
      setSyncState("error", true);
      if (localHasData) {
        return { data: localData, needsMigration: false, localOnly: false };
      }
      throw error;
    }
    if (localHasData) {
      setSyncState("offline");
      return { data: localData, needsMigration: false, localOnly: false };
    }
    setSyncState("error", !isOfflineError(error));
    throw error;
  }
}

export async function migrateLocalDataToCloud(uid: string, data: AppData): Promise<void> {
  setSyncState("syncing");
  await writeRemoteFinance(uid, data);
  saveAppData(data);
  setSyncState("cloud");
}

export function persistAppData(data: AppData): boolean {
  const saved = saveAppData(data);
  if (!saved) {
    return false;
  }

  if (!isFirebaseConfigured() || !currentUid) {
    setSyncState("offline");
    return true;
  }

  pendingData = data;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  setSyncState("syncing");
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPendingCloudWrite();
  }, DEBOUNCE_MS);
  return true;
}

export async function flushPendingCloudWrite(): Promise<void> {
  if (!isFirebaseConfigured() || !currentUid || !pendingData) {
    return;
  }

  const data = pendingData;
  pendingData = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  setSyncState("syncing");
  const write = writeRemoteFinance(currentUid, data)
    .then(() => {
      if (!pendingData) {
        setSyncState("cloud");
      }
    })
    .catch((error) => {
      pendingData = data;
      setSyncState(isOfflineError(error) ? "offline" : "error", !isOfflineError(error));
    });

  writeInFlight = write;
  await write;
  writeInFlight = null;
}

export async function retryCloudSync(data: AppData): Promise<void> {
  pendingData = data;
  await flushPendingCloudWrite();
}

export function hasPendingCloudWrite(): boolean {
  return pendingData !== null || debounceTimer !== null || writeInFlight !== null;
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

export function resetDataStoreForTests(): void {
  currentUid = null;
  pendingData = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  writeInFlight = null;
  listeners = new Set();
  syncState = {
    status: isFirebaseConfigured() ? "connecting" : "offline",
    message: isFirebaseConfigured() ? SYNC_LABELS.connecting : SYNC_LABELS.offline,
    canRetry: false,
  };
}

export function loadLocalAppData(): StorageLoadResult {
  return loadAppData();
}
