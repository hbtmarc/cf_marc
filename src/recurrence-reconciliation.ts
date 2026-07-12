import { hasInvoiceForCardMonth } from "./installments";
import { recurringOccurrencesForMonth } from "./recurrences";
import type {
  AppData,
  ProjectedRecurringOccurrence,
  RecurringMatch,
  RecurringOccurrenceResolution,
  RecurringRule,
  Transaction,
} from "./types";

export function recurringMatchId(
  ruleId: string,
  competenceMonth: string,
): string {
  return `recurring-match:${ruleId}:${competenceMonth}`;
}

function findRule(data: AppData, ruleId: string): RecurringRule | undefined {
  return (data.recurringRules ?? []).find((rule) => rule.id === ruleId);
}

function findTransaction(
  data: AppData,
  transactionId: string,
): Transaction | undefined {
  return data.transactions.find((transaction) => transaction.id === transactionId);
}

function findOccurrence(
  data: AppData,
  ruleId: string,
  competenceMonth: string,
): ProjectedRecurringOccurrence | undefined {
  return recurringOccurrencesForMonth(data, competenceMonth).find(
    (occurrence) => occurrence.ruleId === ruleId,
  );
}

function linkedTransactionIds(data: AppData, excludeMatchId?: string): Set<string> {
  const ids = new Set<string>();
  for (const match of data.recurringMatches ?? []) {
    if (excludeMatchId !== undefined && match.id === excludeMatchId) {
      continue;
    }
    ids.add(match.transactionId);
  }
  return ids;
}

function compareCompetenceMonths(a: string, b: string): number {
  return a.localeCompare(b);
}

function isRecurringExpenseTransaction(transaction: Transaction): boolean {
  return transaction.expenseKind !== "fee" && transaction.expenseKind !== "refund";
}

export function isTransactionCompatibleWithOccurrence(
  transaction: Transaction,
  occurrence: ProjectedRecurringOccurrence,
  rule: RecurringRule,
): boolean {
  if (transaction.competenceMonth !== occurrence.competenceMonth) {
    return false;
  }

  if (transaction.kind !== rule.kind || transaction.kind !== occurrence.kind) {
    return false;
  }

  if (rule.kind === "income") {
    if (rule.billingMode !== "direct") {
      return false;
    }
    if (transaction.invoiceId !== undefined) {
      return false;
    }
    if (transaction.cardId !== undefined) {
      return false;
    }
    return true;
  }

  if (!isRecurringExpenseTransaction(transaction)) {
    return false;
  }

  if (rule.billingMode === "direct") {
    if (transaction.invoiceId !== undefined) {
      return false;
    }
    if (transaction.ledgerStatus === "in_invoice") {
      return false;
    }
    return true;
  }

  if (rule.billingMode === "card") {
    if (transaction.ledgerStatus !== "in_invoice") {
      return false;
    }
    if (!transaction.invoiceId) {
      return false;
    }
    if (transaction.cardId !== rule.cardId) {
      return false;
    }
    return true;
  }

  return false;
}

export function validateRecurringMatch(
  match: RecurringMatch,
  data: AppData,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (match.id !== recurringMatchId(match.ruleId, match.competenceMonth)) {
    errors.id = "ID do match deve seguir o formato determinístico.";
  }

  const rule = findRule(data, match.ruleId);
  if (!rule) {
    errors.ruleId = "Regra recorrente inexistente.";
    return errors;
  }

  if (rule.status === "paused") {
    if (
      !rule.pausedFromMonth ||
      compareCompetenceMonths(match.competenceMonth, rule.pausedFromMonth) >= 0
    ) {
      errors.ruleId = "Regra pausada não aceita match nesta competência.";
      return errors;
    }
  } else if (rule.status !== "active") {
    errors.ruleId = "Regra inativa não aceita match.";
    return errors;
  }

  if (compareCompetenceMonths(match.competenceMonth, rule.startMonth) < 0) {
    errors.competenceMonth = "Competência anterior ao início da regra.";
    return errors;
  }

  if (
    rule.endMonth !== undefined &&
    compareCompetenceMonths(match.competenceMonth, rule.endMonth) > 0
  ) {
    errors.competenceMonth = "Competência posterior ao fim da regra.";
    return errors;
  }

  const transaction = findTransaction(data, match.transactionId);
  if (!transaction) {
    errors.transactionId = "Transação inexistente.";
    return errors;
  }

  const occurrence = findOccurrence(data, match.ruleId, match.competenceMonth);
  if (!occurrence) {
    errors.competenceMonth = "Ocorrência prevista inexistente para a regra e competência.";
    return errors;
  }

  if (transaction.competenceMonth !== match.competenceMonth) {
    errors.competenceMonth = "Competência da transação difere da competência do match.";
  }

  if (!isTransactionCompatibleWithOccurrence(transaction, occurrence, rule)) {
    errors.transactionId = "Transação incompatível com a ocorrência recorrente.";
  }

  const existingForRuleMonth = (data.recurringMatches ?? []).find(
    (item) =>
      item.ruleId === match.ruleId &&
      item.competenceMonth === match.competenceMonth,
  );
  if (
    existingForRuleMonth !== undefined &&
    existingForRuleMonth.transactionId !== match.transactionId
  ) {
    errors.ruleId = "Já existe match para esta regra e competência.";
  }

  const duplicateTransaction = (data.recurringMatches ?? []).find(
    (item) =>
      item.transactionId === match.transactionId &&
      !(
        item.ruleId === match.ruleId &&
        item.competenceMonth === match.competenceMonth
      ),
  );
  if (duplicateTransaction) {
    errors.transactionId = "Transação já vinculada a outra ocorrência recorrente.";
  }

  return errors;
}

function findValidMatchForOccurrence(
  data: AppData,
  occurrence: ProjectedRecurringOccurrence,
): RecurringMatch | undefined {
  const match = (data.recurringMatches ?? []).find(
    (item) =>
      item.ruleId === occurrence.ruleId &&
      item.competenceMonth === occurrence.competenceMonth,
  );
  if (!match) {
    return undefined;
  }
  if (Object.keys(validateRecurringMatch(match, data)).length > 0) {
    return undefined;
  }
  return match;
}

function resolveOccurrence(
  data: AppData,
  occurrence: ProjectedRecurringOccurrence,
): RecurringOccurrenceResolution {
  const expectedAmountCents = occurrence.amountCents;
  const match = findValidMatchForOccurrence(data, occurrence);

  if (match) {
    const transaction = findTransaction(data, match.transactionId);
    const actualAmountCents = transaction?.amountCents ?? expectedAmountCents;
    const resolution: RecurringOccurrenceResolution = {
      occurrence,
      state: "matched",
      matchId: match.id,
      transactionId: match.transactionId,
      expectedAmountCents,
      actualAmountCents,
      differenceCents: actualAmountCents - expectedAmountCents,
    };
    return resolution;
  }

  if (
    occurrence.billingMode === "card" &&
    occurrence.cardId !== undefined &&
    hasInvoiceForCardMonth(data, occurrence.cardId, occurrence.competenceMonth)
  ) {
    return {
      occurrence,
      state: "covered_by_invoice",
      expectedAmountCents,
    };
  }

  return {
    occurrence,
    state: "projected",
    expectedAmountCents,
  };
}

export function recurringResolutionsForMonth(
  data: AppData,
  competenceMonth: string,
): RecurringOccurrenceResolution[] {
  return recurringOccurrencesForMonth(data, competenceMonth).map((occurrence) =>
    resolveOccurrence(data, occurrence),
  );
}

export function unmatchedRecurringOccurrencesForMonth(
  data: AppData,
  competenceMonth: string,
): ProjectedRecurringOccurrence[] {
  return recurringResolutionsForMonth(data, competenceMonth)
    .filter((resolution) => resolution.state === "projected")
    .map((resolution) => resolution.occurrence);
}

export function compatibleTransactionsForRecurringOccurrence(
  data: AppData,
  occurrence: ProjectedRecurringOccurrence,
): Transaction[] {
  const rule = findRule(data, occurrence.ruleId);
  if (!rule) {
    return [];
  }

  const linkedIds = linkedTransactionIds(data);

  return data.transactions.filter(
    (transaction) =>
      !linkedIds.has(transaction.id) &&
      isTransactionCompatibleWithOccurrence(transaction, occurrence, rule),
  );
}

export function findInvalidRecurringMatches(
  data: AppData,
): Array<{ match: RecurringMatch; errors: Record<string, string> }> {
  return (data.recurringMatches ?? [])
    .map((match) => ({ match, errors: validateRecurringMatch(match, data) }))
    .filter((item) => Object.keys(item.errors).length > 0);
}

export function invalidRecurringMatchReason(
  errors: Record<string, string>,
): string {
  return Object.values(errors)[0] ?? "Vínculo inválido.";
}
