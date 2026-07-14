import { normalizeInstallmentDescription } from "./installments";
import type { AppData, Transaction, TransactionInstallment } from "./types";

export const IMPORT_AMOUNT_TOLERANCE_CENTS = 5;

export function amountsApproximatelyEqual(
  left: number,
  right: number,
  toleranceCents = IMPORT_AMOUNT_TOLERANCE_CENTS,
): boolean {
  return Math.abs(left - right) <= toleranceCents;
}

export function descriptionsHarmonize(left: string, right: string): boolean {
  return (
    normalizeInstallmentDescription(left) === normalizeInstallmentDescription(right)
  );
}

export function categoriesHarmonize(left: string, right: string): boolean {
  return (
    normalizeInstallmentDescription(left) === normalizeInstallmentDescription(right)
  );
}

export function installmentSeriesHarmonize(
  left?: TransactionInstallment,
  right?: TransactionInstallment,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.total === right.total;
}

function installmentCurrentHarmonize(
  left?: TransactionInstallment,
  right?: TransactionInstallment,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.current === right.current || left.current < right.current;
}

function cardsHarmonize(
  leftCardId?: string,
  rightCardId?: string,
): boolean {
  return (leftCardId ?? "") === (rightCardId ?? "");
}

function sourceRecordHarmonize(
  left?: string,
  right?: string,
): boolean {
  if (!left || !right) {
    return true;
  }
  return left === right;
}

function isManualRecord<T extends { sourceImportId?: string }>(item: T): boolean {
  return !item.sourceImportId;
}

function expenseHarmonyScore(
  existing: Transaction,
  mapped: Omit<Transaction, "id">,
): number {
  if (existing.kind !== "expense" || mapped.kind !== "expense") {
    return -1;
  }
  if (isManualRecord(existing)) {
    return -1;
  }
  if (existing.competenceMonth !== mapped.competenceMonth) {
    return -1;
  }
  if (!descriptionsHarmonize(existing.description, mapped.description)) {
    return -1;
  }
  if (!amountsApproximatelyEqual(existing.amountCents, mapped.amountCents)) {
    return -1;
  }
  if (!categoriesHarmonize(existing.category, mapped.category)) {
    return -1;
  }
  if (!cardsHarmonize(existing.cardId, mapped.cardId)) {
    return -1;
  }
  if ((existing.expenseKind ?? "expense") !== (mapped.expenseKind ?? "expense")) {
    return -1;
  }
  if (!installmentSeriesHarmonize(existing.installment, mapped.installment)) {
    return -1;
  }
  if (!installmentCurrentHarmonize(existing.installment, mapped.installment)) {
    return -1;
  }
  if (!sourceRecordHarmonize(existing.sourceRecordId, mapped.sourceRecordId)) {
    return -1;
  }

  let score = 100;
  if (existing.sourceRecordId && mapped.sourceRecordId && existing.sourceRecordId === mapped.sourceRecordId) {
    score += 50;
  }
  if (existing.amountCents === mapped.amountCents) {
    score += 10;
  }
  if (
    existing.installment &&
    mapped.installment &&
    existing.installment.current === mapped.installment.current
  ) {
    score += 20;
  }
  return score;
}

function incomeHarmonyScore(
  existing: Transaction,
  mapped: Omit<Transaction, "id">,
): number {
  if (existing.kind !== "income" || mapped.kind !== "income") {
    return -1;
  }
  if (isManualRecord(existing)) {
    return -1;
  }
  if (existing.competenceMonth !== mapped.competenceMonth) {
    return -1;
  }
  if (!descriptionsHarmonize(existing.description, mapped.description)) {
    return -1;
  }
  if (!amountsApproximatelyEqual(existing.amountCents, mapped.amountCents)) {
    return -1;
  }
  if (!sourceRecordHarmonize(existing.sourceRecordId, mapped.sourceRecordId)) {
    return -1;
  }

  let score = 100;
  if (existing.sourceRecordId && mapped.sourceRecordId && existing.sourceRecordId === mapped.sourceRecordId) {
    score += 50;
  }
  if (existing.date === mapped.date) {
    score += 10;
  }
  if (existing.amountCents === mapped.amountCents) {
    score += 10;
  }
  return score;
}

function findBestHarmonyMatch(
  data: AppData,
  mapped: Omit<Transaction, "id">,
  scoreFor: (existing: Transaction, mapped: Omit<Transaction, "id">) => number,
): Transaction | undefined {
  let best: Transaction | undefined;
  let bestScore = -1;

  for (const existing of data.transactions) {
    const score = scoreFor(existing, mapped);
    if (score > bestScore) {
      bestScore = score;
      best = existing;
    }
  }

  return bestScore >= 0 ? best : undefined;
}

export function findHarmonizedExpenseMatch(
  data: AppData,
  mapped: Omit<Transaction, "id">,
): Transaction | undefined {
  return findBestHarmonyMatch(data, mapped, expenseHarmonyScore);
}

export function findHarmonizedIncomeMatch(
  data: AppData,
  mapped: Omit<Transaction, "id">,
): Transaction | undefined {
  return findBestHarmonyMatch(data, mapped, incomeHarmonyScore);
}
