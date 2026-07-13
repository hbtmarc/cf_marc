import { get, ref, set } from "firebase/database";
import {
  coerceRemoteFinance,
  parseFinanceEnvelope,
  type FinanceEnvelope,
} from "./cloud-envelope";
import { getFirebaseDatabase } from "./firebase";
import { normalizeAppData, validateAppData } from "./storage";
import type { AppData } from "./types";

export const DELETION_SNAPSHOT_VERSION = "cfm.deletion_snapshot.v1";
export const FINANCE_SNAPSHOT_RTD_PATH = "personal/finance_snapshot";

export interface DeletionSnapshot {
  schemaVersion: typeof DELETION_SNAPSHOT_VERSION;
  createdAt: number;
  createdBy: string;
  envelope: FinanceEnvelope | null;
  localData: AppData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotRef() {
  return ref(getFirebaseDatabase(), FINANCE_SNAPSHOT_RTD_PATH);
}

export function createDeletionSnapshot(
  localData: AppData,
  remoteEnvelope: FinanceEnvelope | null,
  createdBy: string,
  createdAt = Date.now(),
): DeletionSnapshot {
  return {
    schemaVersion: DELETION_SNAPSHOT_VERSION,
    createdAt,
    createdBy,
    envelope: remoteEnvelope ? structuredClone(remoteEnvelope) : null,
    localData: normalizeAppData(structuredClone(localData)),
  };
}

export function parseDeletionSnapshot(value: unknown): DeletionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.schemaVersion !== DELETION_SNAPSHOT_VERSION) {
    return null;
  }
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) {
    return null;
  }
  if (typeof value.createdBy !== "string" || value.createdBy.length === 0 || value.createdBy.length > 100) {
    return null;
  }
  if (!validateAppData(value.localData)) {
    return null;
  }
  let envelope: FinanceEnvelope | null = null;
  if (value.envelope !== null && value.envelope !== undefined) {
    envelope = parseFinanceEnvelope(value.envelope) ?? coerceRemoteFinance(value.envelope);
  }
  return {
    schemaVersion: DELETION_SNAPSHOT_VERSION,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    envelope,
    localData: normalizeAppData(value.localData as AppData),
  };
}

export function resolveSnapshotAppData(snapshot: DeletionSnapshot): AppData {
  return snapshot.envelope?.data ?? snapshot.localData;
}

export async function saveDeletionSnapshot(snapshot: DeletionSnapshot): Promise<void> {
  await set(snapshotRef(), snapshot);
}

export async function fetchDeletionSnapshot(): Promise<DeletionSnapshot | null> {
  const result = await get(snapshotRef());
  if (!result.exists()) {
    return null;
  }
  return parseDeletionSnapshot(result.val());
}

export async function clearDeletionSnapshot(): Promise<void> {
  await set(snapshotRef(), null);
}
