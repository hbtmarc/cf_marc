import { currentCompetenceMonth } from "./finance";
import { normalizeLegacyRecurringRule } from "./recurrence-class";
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
  const pausedFromMonthValid =
    value.pausedFromMonth === undefined || typeof value.pausedFromMonth === "string";
  const resumedFromMonthValid =
    value.resumedFromMonth === undefined || typeof value.resumedFromMonth === "string";
  const cardIdValid =
    value.cardId === undefined || typeof value.cardId === "string";
  const recurrenceClassValid =
    value.recurrenceClass === undefined ||
    value.recurrenceClass === "income" ||
    value.recurrenceClass === "fixed_bill" ||
    value.recurrenceClass === "card_subscription" ||
    value.recurrenceClass === "other";
  const renewalPolicyValid =
    value.renewalPolicy === undefined ||
    value.renewalPolicy === "none" ||
    value.renewalPolicy === "manual_annual";
  const renewedThroughMonthValid =
    value.renewedThroughMonth === undefined || typeof value.renewedThroughMonth === "string";
  const seriesIdValid =
    value.seriesId === undefined || typeof value.seriesId === "string";

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
    pausedFromMonthValid &&
    resumedFromMonthValid &&
    (value.status === "active" || value.status === "paused") &&
    (value.billingMode === "direct" || value.billingMode === "card") &&
    cardIdValid &&
    recurrenceClassValid &&
    renewalPolicyValid &&
    renewedThroughMonthValid &&
    seriesIdValid &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRecurringMatch(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.ruleId === "string" &&
    typeof value.competenceMonth === "string" &&
    typeof value.transactionId === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isIgnoredRecurringSuggestion(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.signature === "string" &&
    typeof value.evidenceFingerprint === "string" &&
    typeof value.ignoredAt === "string"
  );
}

function isTransactionDescriptionAlias(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.sourceDescriptionNormalized === "string" &&
    typeof value.sourceDescriptionSample === "string" &&
    typeof value.displayName === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isMonthlyBalance(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const noteValid = value.note === undefined || typeof value.note === "string";
  return (
    typeof value.id === "string" &&
    typeof value.competenceMonth === "string" &&
    typeof value.incomeCents === "number" &&
    Number.isInteger(value.incomeCents) &&
    typeof value.expenseCents === "number" &&
    Number.isInteger(value.expenseCents) &&
    typeof value.balanceCents === "number" &&
    Number.isInteger(value.balanceCents) &&
    typeof value.projectedBalanceCents === "number" &&
    Number.isInteger(value.projectedBalanceCents) &&
    typeof value.fixedBillsCents === "number" &&
    Number.isInteger(value.fixedBillsCents) &&
    typeof value.invoicesCents === "number" &&
    Number.isInteger(value.invoicesCents) &&
    noteValid &&
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
    recurringMatches: [],
    ignoredRecurringSuggestions: [],
    transactionDescriptionAliases: [],
    monthlyBalances: [],
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

  if (value.recurringMatches !== undefined) {
    if (
      !Array.isArray(value.recurringMatches) ||
      !value.recurringMatches.every(isRecurringMatch)
    ) {
      return false;
    }
  }

  if (value.ignoredRecurringSuggestions !== undefined) {
    if (
      !Array.isArray(value.ignoredRecurringSuggestions) ||
      !value.ignoredRecurringSuggestions.every(isIgnoredRecurringSuggestion)
    ) {
      return false;
    }
  }

  if (value.transactionDescriptionAliases !== undefined) {
    if (
      !Array.isArray(value.transactionDescriptionAliases) ||
      !value.transactionDescriptionAliases.every(isTransactionDescriptionAlias)
    ) {
      return false;
    }
  }

  if (value.monthlyBalances !== undefined) {
    if (
      !Array.isArray(value.monthlyBalances) ||
      !value.monthlyBalances.every(isMonthlyBalance)
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
  if (!data.recurringMatches) {
    data.recurringMatches = [];
  }
  if (!data.ignoredRecurringSuggestions) {
    data.ignoredRecurringSuggestions = [];
  }
  if (!data.transactionDescriptionAliases) {
    data.transactionDescriptionAliases = [];
  }
  if (!data.monthlyBalances) {
    data.monthlyBalances = [];
  }
  const balancesByMonth = new Map<string, (typeof data.monthlyBalances)[number]>();
  for (const balance of data.monthlyBalances) {
    const existing = balancesByMonth.get(balance.competenceMonth);
    if (!existing || balance.updatedAt > existing.updatedAt) {
      balancesByMonth.set(balance.competenceMonth, balance);
    }
  }
  data.monthlyBalances = [...balancesByMonth.values()].sort((left, right) =>
    right.competenceMonth.localeCompare(left.competenceMonth),
  );
  const seenIgnored = new Set<string>();
  data.ignoredRecurringSuggestions = data.ignoredRecurringSuggestions.filter((item) => {
    if (seenIgnored.has(item.signature)) {
      return false;
    }
    seenIgnored.add(item.signature);
    return true;
  });
  for (const rule of data.recurringRules) {
    normalizeLegacyRecurringRule(rule);
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
