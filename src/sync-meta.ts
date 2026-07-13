import type { FinanceEnvelope } from "./cloud-envelope";
import type { AppData } from "./types";

export const SYNC_META_KEY = "cfm:v2:syncMeta";
export const INSTALLATION_ID_KEY = "cfm:v2:installationId";
export const DELETION_BACKUP_KEY = "cfm:v2:deletionBackup";

export interface DeletionBackup {
  createdAt: number;
  localData?: AppData;
  remoteEnvelope?: FinanceEnvelope | null;
  snapshotInRtdb?: boolean;
}

export interface SyncMeta {
  installationId: string;
  lastRemoteRevision: number;
  lastRemoteUpdatedAt: number;
  pendingSync: boolean;
  pendingBaseRevision: number;
  pendingChangedAt: number;
  lastAppliedContentHash: string;
  conflictBackup: AppData | null;
}

function defaultSyncMeta(installationId: string): SyncMeta {
  return {
    installationId,
    lastRemoteRevision: 0,
    lastRemoteUpdatedAt: 0,
    pendingSync: false,
    pendingBaseRevision: 0,
    pendingChangedAt: 0,
    lastAppliedContentHash: "",
    conflictBackup: null,
  };
}

export function getOrCreateInstallationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_ID_KEY);
    if (existing && existing.length > 0) {
      return existing;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_ID_KEY, id);
    return id;
  } catch {
    return "local-installation";
  }
}

export function loadSyncMeta(): SyncMeta {
  const installationId = getOrCreateInstallationId();
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) {
      return defaultSyncMeta(installationId);
    }
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      installationId: parsed.installationId ?? installationId,
      lastRemoteRevision: parsed.lastRemoteRevision ?? 0,
      lastRemoteUpdatedAt: parsed.lastRemoteUpdatedAt ?? 0,
      pendingSync: parsed.pendingSync ?? false,
      pendingBaseRevision: parsed.pendingBaseRevision ?? 0,
      pendingChangedAt: parsed.pendingChangedAt ?? 0,
      lastAppliedContentHash: parsed.lastAppliedContentHash ?? "",
      conflictBackup: parsed.conflictBackup ?? null,
    };
  } catch {
    return defaultSyncMeta(installationId);
  }
}

export function saveSyncMeta(meta: SyncMeta): boolean {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function patchSyncMeta(patch: Partial<SyncMeta>): SyncMeta {
  const next = { ...loadSyncMeta(), ...patch };
  saveSyncMeta(next);
  return next;
}

export function clearPendingSync(): SyncMeta {
  return patchSyncMeta({
    pendingSync: false,
    pendingBaseRevision: loadSyncMeta().lastRemoteRevision,
    pendingChangedAt: 0,
  });
}

export function resetSyncMetaForTests(): void {
  try {
    localStorage.removeItem(SYNC_META_KEY);
    localStorage.removeItem(INSTALLATION_ID_KEY);
    localStorage.removeItem(DELETION_BACKUP_KEY);
  } catch {
    // ignore
  }
}

export function saveDeletionBackup(backup: DeletionBackup): boolean {
  try {
    localStorage.setItem(DELETION_BACKUP_KEY, JSON.stringify(backup));
    return true;
  } catch {
    return false;
  }
}

export function saveDeletionBackupMarker(createdAt: number): boolean {
  return saveDeletionBackup({ createdAt, snapshotInRtdb: true });
}

export function loadDeletionBackup(): DeletionBackup | null {
  try {
    const raw = localStorage.getItem(DELETION_BACKUP_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DeletionBackup>;
    if (typeof parsed.createdAt !== "number") {
      return null;
    }
    if (parsed.snapshotInRtdb) {
      return {
        createdAt: parsed.createdAt,
        snapshotInRtdb: true,
      };
    }
    if (!parsed.localData) {
      return null;
    }
    return {
      createdAt: parsed.createdAt,
      localData: parsed.localData,
      remoteEnvelope: parsed.remoteEnvelope ?? null,
    };
  } catch {
    return null;
  }
}

export function hasDeletionBackup(): boolean {
  return loadDeletionBackup() !== null;
}

export function clearDeletionBackup(): void {
  try {
    localStorage.removeItem(DELETION_BACKUP_KEY);
  } catch {
    // ignore
  }
}
