import { normalizeAppData, validateAppData } from "./storage";
import type { AppData } from "./types";

export const CLOUD_ENVELOPE_VERSION = "cfm.cloud.v1";

export interface FinanceEnvelope {
  schemaVersion: typeof CLOUD_ENVELOPE_VERSION;
  updatedAt: number;
  data: AppData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createFinanceEnvelope(data: AppData): FinanceEnvelope {
  return {
    schemaVersion: CLOUD_ENVELOPE_VERSION,
    updatedAt: Date.now(),
    data: normalizeAppData(structuredClone(data)),
  };
}

export function parseFinanceEnvelope(value: unknown): FinanceEnvelope | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.schemaVersion !== CLOUD_ENVELOPE_VERSION) {
    return null;
  }
  if (typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)) {
    return null;
  }
  if (!validateAppData(value.data)) {
    return null;
  }
  return {
    schemaVersion: CLOUD_ENVELOPE_VERSION,
    updatedAt: value.updatedAt,
    data: normalizeAppData(value.data as AppData),
  };
}

export function financePathForUser(uid: string): string {
  return `users/${uid}/finance`;
}
