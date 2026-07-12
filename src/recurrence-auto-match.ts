import { normalizeRecurringSuggestionDescription } from "./recurring-suggestions";
import {
  isTransactionCompatibleWithOccurrence,
  recurringMatchId,
  validateRecurringMatch,
} from "./recurrence-reconciliation";
import { recurringOccurrencesForMonth } from "./recurrences";
import type { AppData, ProjectedRecurringOccurrence, Transaction } from "./types";

function hasValidInstallment(transaction: Transaction): boolean {
  const installment = transaction.installment;
  if (!installment) {
    return false;
  }
  return (
    Number.isInteger(installment.current) &&
    Number.isInteger(installment.total) &&
    installment.current >= 1 &&
    installment.total >= 1
  );
}

function isAutoMatchTransaction(transaction: Transaction): boolean {
  if (transaction.id.startsWith("projected:")) {
    return false;
  }
  if (transaction.expenseKind === "fee" || transaction.expenseKind === "refund") {
    return false;
  }
  if (hasValidInstallment(transaction)) {
    return false;
  }
  return true;
}

function linkedTransactionIds(data: AppData): Set<string> {
  return new Set((data.recurringMatches ?? []).map((item) => item.transactionId));
}

export function findExactAutoMatchCandidates(
  data: AppData,
  occurrence: ProjectedRecurringOccurrence,
): Transaction[] {
  const rule = (data.recurringRules ?? []).find((item) => item.id === occurrence.ruleId);
  if (!rule) {
    return [];
  }

  const linkedIds = linkedTransactionIds(data);
  const normalizedOccurrenceDescription = normalizeRecurringSuggestionDescription(
    occurrence.description,
  );

  return data.transactions.filter((transaction) => {
    if (!isAutoMatchTransaction(transaction)) {
      return false;
    }
    if (linkedIds.has(transaction.id)) {
      return false;
    }
    if (transaction.competenceMonth !== occurrence.competenceMonth) {
      return false;
    }
    if (transaction.kind !== occurrence.kind) {
      return false;
    }
    if (transaction.amountCents !== occurrence.amountCents) {
      return false;
    }
    if (
      normalizeRecurringSuggestionDescription(transaction.description) !==
      normalizedOccurrenceDescription
    ) {
      return false;
    }
    return isTransactionCompatibleWithOccurrence(transaction, occurrence, rule);
  });
}

export interface AmountMismatchReview {
  occurrence: ProjectedRecurringOccurrence;
  transaction: Transaction;
  expectedAmountCents: number;
  actualAmountCents: number;
  differenceCents: number;
}

export function findAmountMismatchReviews(
  data: AppData,
  competenceMonth: string,
): AmountMismatchReview[] {
  const reviews: AmountMismatchReview[] = [];
  const linkedIds = linkedTransactionIds(data);
  const occurrences = recurringOccurrencesForMonth(data, competenceMonth).filter((occurrence) => {
    const match = (data.recurringMatches ?? []).find(
      (item) =>
        item.ruleId === occurrence.ruleId &&
        item.competenceMonth === occurrence.competenceMonth,
    );
    return !match;
  });

  for (const occurrence of occurrences) {
    const rule = (data.recurringRules ?? []).find((item) => item.id === occurrence.ruleId);
    if (!rule) {
      continue;
    }
    const normalizedOccurrenceDescription = normalizeRecurringSuggestionDescription(
      occurrence.description,
    );

    const candidates = data.transactions.filter((transaction) => {
      if (!isAutoMatchTransaction(transaction)) {
        return false;
      }
      if (linkedIds.has(transaction.id)) {
        return false;
      }
      if (transaction.competenceMonth !== occurrence.competenceMonth) {
        return false;
      }
      if (transaction.kind !== occurrence.kind) {
        return false;
      }
      if (transaction.amountCents === occurrence.amountCents) {
        return false;
      }
      if (
        normalizeRecurringSuggestionDescription(transaction.description) !==
        normalizedOccurrenceDescription
      ) {
        return false;
      }
      return isTransactionCompatibleWithOccurrence(transaction, occurrence, rule);
    });

    for (const transaction of candidates) {
      reviews.push({
        occurrence,
        transaction,
        expectedAmountCents: occurrence.amountCents,
        actualAmountCents: transaction.amountCents,
        differenceCents: transaction.amountCents - occurrence.amountCents,
      });
    }
  }

  return reviews;
}

export interface AutoReconcileResult {
  created: number;
  skippedAmbiguous: number;
  skippedNone: number;
}

export function runAutoReconciliation(
  data: AppData,
  competenceMonth?: string,
): AutoReconcileResult {
  const result: AutoReconcileResult = {
    created: 0,
    skippedAmbiguous: 0,
    skippedNone: 0,
  };

  const months = competenceMonth
    ? [competenceMonth]
    : [data.selectedCompetenceMonth];

  for (const month of months) {
    const occurrences = recurringOccurrencesForMonth(data, month);
    for (const occurrence of occurrences) {
      const existing = (data.recurringMatches ?? []).find(
        (item) =>
          item.ruleId === occurrence.ruleId &&
          item.competenceMonth === occurrence.competenceMonth,
      );
      if (existing) {
        continue;
      }

      const candidates = findExactAutoMatchCandidates(data, occurrence);
      if (candidates.length === 1) {
        const candidate = candidates[0]!;
        const timestamp = new Date().toISOString();
        const match = {
          id: recurringMatchId(occurrence.ruleId, occurrence.competenceMonth),
          ruleId: occurrence.ruleId,
          competenceMonth: occurrence.competenceMonth,
          transactionId: candidate.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        if (Object.keys(validateRecurringMatch(match, data)).length > 0) {
          continue;
        }
        if (!data.recurringMatches) {
          data.recurringMatches = [];
        }
        const duplicate = data.recurringMatches.find((item) => item.id === match.id);
        if (!duplicate) {
          data.recurringMatches.push(match);
          result.created += 1;
        }
      } else if (candidates.length === 0) {
        result.skippedNone += 1;
      } else {
        result.skippedAmbiguous += 1;
      }
    }
  }

  return result;
}

export function transactionHasValidRecurringMatch(
  data: AppData,
  transactionId: string,
): boolean {
  const match = (data.recurringMatches ?? []).find(
    (item) => item.transactionId === transactionId,
  );
  if (!match) {
    return false;
  }
  return Object.keys(validateRecurringMatch(match, data)).length === 0;
}
