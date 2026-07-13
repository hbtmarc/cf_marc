import {
  get,
  onValue,
  ref,
  runTransaction,
  set,
  type DatabaseReference,
  type Unsubscribe,
} from "firebase/database";
import {
  coerceRemoteFinance,
  createFinanceEnvelope,
  FINANCE_RTD_PATH,
  parseFinanceEnvelope,
  type FinanceEnvelope,
} from "./cloud-envelope";
import { getFirebaseDatabase } from "./firebase";
import type { AppData } from "./types";

export class RemoteFinanceInvalidError extends Error {
  constructor() {
    super("Envelope remoto inválido.");
    this.name = "RemoteFinanceInvalidError";
  }
}

export class RemoteWriteConflictError extends Error {
  constructor() {
    super("Conflito de revisão remota.");
    this.name = "RemoteWriteConflictError";
  }
}

function financeRef(): DatabaseReference {
  return ref(getFirebaseDatabase(), FINANCE_RTD_PATH);
}

export async function fetchRemoteFinance(): Promise<FinanceEnvelope | null> {
  const snapshot = await get(financeRef());
  if (!snapshot.exists()) {
    return null;
  }
  const parsed = coerceRemoteFinance(snapshot.val());
  if (!parsed) {
    throw new RemoteFinanceInvalidError();
  }
  return parsed;
}

export function subscribeFinanceListener(
  listener: (envelope: FinanceEnvelope | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onValue(
    financeRef(),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener(null);
        return;
      }
      const parsed = coerceRemoteFinance(snapshot.val());
      if (!parsed) {
        listener(null);
        return;
      }
      listener(parsed);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeConnectivity(listener: (connected: boolean) => void): Unsubscribe {
  return onValue(ref(getFirebaseDatabase(), ".info/connected"), (snapshot) => {
    listener(snapshot.val() === true);
  });
}

export async function writeRemoteFinance(
  data: AppData,
  writerId: string,
  pendingBaseRevision: number,
): Promise<FinanceEnvelope> {
  const result = await runTransaction(financeRef(), (current) => {
    const hasData =
      current !== null &&
      typeof current.exists === "function" &&
      current.exists();

    if (!hasData) {
      if (pendingBaseRevision > 0) {
        return;
      }
      return createFinanceEnvelope(data, writerId, 1);
    }

    const parsed = coerceRemoteFinance(current.val());
    if (!parsed) {
      return createFinanceEnvelope(data, writerId, 1);
    }

    if (parsed.revision > pendingBaseRevision) {
      return;
    }

    return createFinanceEnvelope(data, writerId, parsed.revision + 1);
  });

  if (!result.committed || !result.snapshot.exists()) {
    throw new RemoteWriteConflictError();
  }

  const envelope = coerceRemoteFinance(result.snapshot.val());
  if (!envelope) {
    throw new RemoteFinanceInvalidError();
  }
  return envelope;
}

export function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code ?? "";
  const message = (error as { message?: string }).message ?? "";
  return code === "PERMISSION_DENIED" || /permission.denied/i.test(message);
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

export async function replaceRemoteFinance(
  data: AppData,
  writerId: string,
): Promise<FinanceEnvelope> {
  let nextRevision = 1;
  try {
    const snapshot = await get(financeRef());
    if (snapshot.exists()) {
      const parsed = coerceRemoteFinance(snapshot.val());
      nextRevision = parsed ? parsed.revision + 1 : 1;
    }
  } catch {
    nextRevision = 1;
  }
  const envelope = createFinanceEnvelope(data, writerId, nextRevision);
  await set(financeRef(), envelope);
  return envelope;
}

export async function clearRemoteFinance(): Promise<void> {
  await set(financeRef(), null);
}

export function sanitizeSyncError(error: unknown): string {
  if (isPermissionDeniedError(error)) {
    return "PERMISSION_DENIED";
  }
  if (isOfflineError(error)) {
    return "OFFLINE";
  }
  if (error instanceof Error) {
    return error.name || "Error";
  }
  return "UNKNOWN";
}
