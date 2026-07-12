import { currentCompetenceMonth } from "./finance";
import type { AppData } from "./types";

export const STORAGE_KEY = "cfm:v2:appData";

export interface LoadResult {
  ok: true;
  data: AppData;
}

export interface LoadError {
  ok: false;
  message: string;
  raw: string | null;
}

export type StorageLoadResult = LoadResult | LoadError;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransaction(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    (value.kind === "income" || value.kind === "expense") &&
    typeof value.description === "string" &&
    typeof value.amountCents === "number" &&
    Number.isInteger(value.amountCents) &&
    typeof value.date === "string" &&
    typeof value.competenceMonth === "string" &&
    typeof value.category === "string" &&
    (value.status === "pending" || value.status === "settled") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isCard(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const closingValid =
    value.closingDay === null ||
    (typeof value.closingDay === "number" &&
      Number.isInteger(value.closingDay));
  const dueValid =
    value.dueDay === null ||
    (typeof value.dueDay === "number" && Number.isInteger(value.dueDay));

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    closingValid &&
    dueValid &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isInvoice(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.cardId === "string" &&
    typeof value.competenceMonth === "string" &&
    typeof value.amountCents === "number" &&
    Number.isInteger(value.amountCents) &&
    typeof value.dueDate === "string" &&
    (value.status === "open" || value.status === "paid" || value.status === "partial") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRecurringRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const endMonthValid =
    value.endMonth === undefined || typeof value.endMonth === "string";
  const cardIdValid =
    value.cardId === undefined || typeof value.cardId === "string";

  return (
    typeof value.id === "string" &&
    (value.kind === "income" || value.kind === "expense") &&
    typeof value.description === "string" &&
    typeof value.amountCents === "number" &&
    Number.isInteger(value.amountCents) &&
    typeof value.category === "string" &&
    typeof value.dayOfMonth === "number" &&
    Number.isInteger(value.dayOfMonth) &&
    typeof value.startMonth === "string" &&
    endMonthValid &&
    (value.status === "active" || value.status === "paused") &&
    (value.billingMode === "direct" || value.billingMode === "card") &&
    cardIdValid &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function emptyAppData(): AppData {
  return {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: currentCompetenceMonth(),
    transactions: [],
    cards: [],
    invoices: [],
    recurringRules: [],
  };
}

export function validateAppData(value: unknown): value is AppData {
  if (!isRecord(value)) {
    return false;
  }

  if (value.schemaVersion !== "cfm.local.v2") {
    return false;
  }

  if (typeof value.selectedCompetenceMonth !== "string") {
    return false;
  }

  if (!Array.isArray(value.transactions) || !value.transactions.every(isTransaction)) {
    return false;
  }

  if (!Array.isArray(value.cards) || !value.cards.every(isCard)) {
    return false;
  }

  if (!Array.isArray(value.invoices) || !value.invoices.every(isInvoice)) {
    return false;
  }

  if (value.importMeta !== undefined) {
    if (!isRecord(value.importMeta) || !Array.isArray(value.importMeta.fingerprints)) {
      return false;
    }
    if (!value.importMeta.fingerprints.every((item) => typeof item === "string")) {
      return false;
    }
  }

  if (value.recurringRules !== undefined) {
    if (
      !Array.isArray(value.recurringRules) ||
      !value.recurringRules.every(isRecurringRule)
    ) {
      return false;
    }
  }

  return true;
}

function normalizeAppData(data: AppData): AppData {
  if (!data.importMeta) {
    data.importMeta = { fingerprints: [] };
  }
  if (!data.recurringRules) {
    data.recurringRules = [];
  }
  return data;
}

export function loadAppData(): StorageLoadResult {
  let raw: string | null = null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      ok: false,
      message: "Não foi possível ler os dados locais.",
      raw: null,
    };
  }

  if (raw === null) {
    return { ok: true, data: emptyAppData() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      ok: false,
      message: "Os dados locais estão corrompidos (JSON inválido).",
      raw,
    };
  }

  if (!validateAppData(parsed)) {
    return {
      ok: false,
      message: "Os dados locais não correspondem ao formato esperado.",
      raw,
    };
  }

  return { ok: true, data: normalizeAppData(parsed as AppData) };
}

export function saveAppData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearAppData(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function serializeAppData(data: AppData): string {
  return JSON.stringify(data);
}

export function parseAppDataJson(raw: string): StorageLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      ok: false,
      message: "JSON inválido.",
      raw,
    };
  }

  if (!validateAppData(parsed)) {
    return {
      ok: false,
      message: "Estrutura inválida.",
      raw,
    };
  }

  return { ok: true, data: normalizeAppData(parsed as AppData) };
}
