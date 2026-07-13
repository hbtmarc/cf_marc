import { normalizeAppData, validateAppData } from "./storage";
import type { AppData } from "./types";

export const CLOUD_ENVELOPE_VERSION = "cfm.cloud.v1";
export const FINANCE_RTD_PATH = "personal/finance";

export interface FinanceEnvelope {
  schemaVersion: typeof CLOUD_ENVELOPE_VERSION;
  revision: number;
  updatedAt: number;
  writerId: string;
  data: AppData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createFinanceEnvelope(
  data: AppData,
  writerId: string,
  revision: number,
): FinanceEnvelope {
  return {
    schemaVersion: CLOUD_ENVELOPE_VERSION,
    revision,
    updatedAt: Date.now(),
    writerId,
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
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0) {
    return null;
  }
  if (typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)) {
    return null;
  }
  if (typeof value.writerId !== "string" || value.writerId.length === 0 || value.writerId.length > 100) {
    return null;
  }
  if (!validateAppData(value.data)) {
    return null;
  }
  return {
    schemaVersion: CLOUD_ENVELOPE_VERSION,
    revision: value.revision,
    updatedAt: value.updatedAt,
    writerId: value.writerId,
    data: normalizeAppData(value.data as AppData),
  };
}
