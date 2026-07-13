import { get, ref, set } from "firebase/database";
import {
  createFinanceEnvelope,
  financePathForUser,
  parseFinanceEnvelope,
  type FinanceEnvelope,
} from "./cloud-envelope";
import { getFirebaseDatabase } from "./firebase";
import type { AppData } from "./types";

export async function fetchRemoteFinance(uid: string): Promise<FinanceEnvelope | null> {
  const snapshot = await get(ref(getFirebaseDatabase(), financePathForUser(uid)));
  if (!snapshot.exists()) {
    return null;
  }
  return parseFinanceEnvelope(snapshot.val());
}

export async function writeRemoteFinance(uid: string, data: AppData): Promise<void> {
  const envelope = createFinanceEnvelope(data);
  await set(ref(getFirebaseDatabase(), financePathForUser(uid)), envelope);
}

export function isOfflineError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code ?? "";
  return (
    code === "unavailable" ||
    code === "network-request-failed" ||
    code === "failed-precondition"
  );
}
