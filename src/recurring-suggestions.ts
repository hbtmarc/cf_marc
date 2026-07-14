import { normalizeInstallmentDescription } from "./installments";
import {
  defaultRecurrenceClassForSuggestion,
} from "./recurrence-class";
import {
  createEvidenceMatchIfAbsent,
  createRecurringRule,
  type RecurringRuleDraft,
} from "./recurring-operations";
import { nowIso } from "./finance";
import { centsToInputValue } from "./ui";
import { transactionDisplayDescriptionForSource } from "./transaction-aliases";
import type {
  AppData,
  IgnoredRecurringSuggestion,
  RecurrenceClass,
  RecurringBillingMode,
  RecurringRule,
  RecurringRuleKind,
  Transaction,
} from "./types";

export interface RecurringSuggestionEvidence {
  transactionId: string;
  competenceMonth: string;
  date: string;
}

export interface RecurringSuggestion {
  id: string;
  signature: string;
  evidenceFingerprint: string;
  kind: RecurringRuleKind;
  description: string;
  normalizedDescription: string;
  amountCents: number;
  category: string;
  billingMode: RecurringBillingMode;
  cardId?: string;
  dayOfMonth: number;
  startMonth: string;
  competenceMonths: string[];
  evidences: RecurringSuggestionEvidence[];
  proposedRecurrenceClass: RecurrenceClass;
}

export function normalizeRecurringSuggestionDescription(description: string): string {
  return normalizeInstallmentDescription(description);
}

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

export function deriveSuggestionBillingMode(transaction: Transaction): RecurringBillingMode | null {
  if (transaction.kind === "income") {
    if (transaction.invoiceId !== undefined || transaction.cardId !== undefined) {
      return null;
    }
    return "direct";
  }

  if (transaction.ledgerStatus === "in_invoice") {
    if (!transaction.cardId) {
      return null;
    }
    return "card";
  }

  if (transaction.invoiceId !== undefined) {
    return null;
  }

  if (transaction.cardId !== undefined) {
    return null;
  }

  return "direct";
}

export function isRecurringSuggestionCandidate(transaction: Transaction): boolean {
  if (transaction.id.startsWith("projected:")) {
    return false;
  }
  if (transaction.expenseKind === "fee" || transaction.expenseKind === "refund") {
    return false;
  }
  if (hasValidInstallment(transaction)) {
    return false;
  }
  return deriveSuggestionBillingMode(transaction) !== null;
}

export function recurringSuggestionSignature(input: {
  normalizedDescription: string;
  kind: RecurringRuleKind;
  billingMode: RecurringBillingMode;
  cardId?: string;
  amountCents: number;
}): string {
  const cardPart = input.billingMode === "card" ? (input.cardId ?? "") : "";
  return [
    "recurring-suggestion",
    input.kind,
    input.billingMode,
    cardPart,
    String(input.amountCents),
    input.normalizedDescription,
  ].join(":");
}

export function recurringSuggestionEvidenceFingerprint(
  evidences: readonly RecurringSuggestionEvidence[],
  competenceMonths: readonly string[],
): string {
  const txIds = [...evidences].map((item) => item.transactionId).sort().join(",");
  const months = [...competenceMonths].sort().join(",");
  return `${months}|${txIds}`;
}

function dayOfMonthFromDate(date: string): number {
  const day = Number(date.split("-")[2]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
}

function compareCompetenceMonths(left: string, right: string): number {
  return left.localeCompare(right);
}

function signatureInput(input: {
  normalizedDescription: string;
  kind: RecurringRuleKind;
  billingMode: RecurringBillingMode;
  cardId?: string;
  amountCents: number;
}): string {
  const base = {
    normalizedDescription: input.normalizedDescription,
    kind: input.kind,
    billingMode: input.billingMode,
    amountCents: input.amountCents,
  };
  return input.cardId !== undefined
    ? recurringSuggestionSignature({ ...base, cardId: input.cardId })
    : recurringSuggestionSignature(base);
}

function ruleEquivalentSignature(rule: RecurringRule): string {
  return signatureInput({
    normalizedDescription: normalizeRecurringSuggestionDescription(rule.description),
    kind: rule.kind,
    billingMode: rule.billingMode,
    amountCents: rule.amountCents,
    ...(rule.cardId !== undefined ? { cardId: rule.cardId } : {}),
  });
}

function isIgnoredSuggestion(
  suggestion: RecurringSuggestion,
  ignored: readonly IgnoredRecurringSuggestion[],
): boolean {
  return ignored.some(
    (item) =>
      item.signature === suggestion.signature &&
      item.evidenceFingerprint === suggestion.evidenceFingerprint,
  );
}

function buildSuggestionFromGroup(
  transactions: Transaction[],
): RecurringSuggestion | null {
  const sorted = [...transactions].sort((left, right) => {
    const monthDelta = compareCompetenceMonths(left.competenceMonth, right.competenceMonth);
    if (monthDelta !== 0) {
      return monthDelta;
    }
    return right.date.localeCompare(left.date);
  });

  const competenceMonths = [...new Set(sorted.map((item) => item.competenceMonth))].sort();
  if (competenceMonths.length < 2) {
    return null;
  }

  const latest = [...sorted].sort((left, right) => right.date.localeCompare(left.date))[0]!;
  const billingMode = deriveSuggestionBillingMode(latest);
  if (!billingMode) {
    return null;
  }

  const normalizedDescription = normalizeRecurringSuggestionDescription(latest.description);
  const signature = signatureInput({
    normalizedDescription,
    kind: latest.kind,
    billingMode,
    amountCents: latest.amountCents,
    ...(latest.cardId !== undefined ? { cardId: latest.cardId } : {}),
  });

  const evidences: RecurringSuggestionEvidence[] = sorted.map((item) => ({
    transactionId: item.id,
    competenceMonth: item.competenceMonth,
    date: item.date,
  }));

  const suggestion: RecurringSuggestion = {
    id: signature,
    signature,
    evidenceFingerprint: recurringSuggestionEvidenceFingerprint(evidences, competenceMonths),
    kind: latest.kind,
    description: latest.description.trim(),
    normalizedDescription,
    amountCents: latest.amountCents,
    category: latest.category.trim(),
    billingMode,
    dayOfMonth: dayOfMonthFromDate(latest.date),
    startMonth: competenceMonths[0]!,
    competenceMonths,
    evidences,
    proposedRecurrenceClass: "other",
  };
  if (billingMode === "card" && latest.cardId !== undefined) {
    suggestion.cardId = latest.cardId;
  }
  suggestion.proposedRecurrenceClass = defaultRecurrenceClassForSuggestion(suggestion);
  return suggestion;
}

export function buildRecurringSuggestions(data: AppData): RecurringSuggestion[] {
  const ignored = data.ignoredRecurringSuggestions ?? [];
  const existingSignatures = new Set(
    (data.recurringRules ?? []).map((rule) => ruleEquivalentSignature(rule)),
  );

  const groups = new Map<string, Transaction[]>();
  for (const transaction of data.transactions) {
    if (!isRecurringSuggestionCandidate(transaction)) {
      continue;
    }
    const billingMode = deriveSuggestionBillingMode(transaction);
    if (!billingMode) {
      continue;
    }

    const signature = signatureInput({
      normalizedDescription: normalizeRecurringSuggestionDescription(transaction.description),
      kind: transaction.kind,
      billingMode,
      amountCents: transaction.amountCents,
      ...(transaction.cardId !== undefined ? { cardId: transaction.cardId } : {}),
    });

    const bucket = groups.get(signature) ?? [];
    const alreadyInMonth = bucket.some(
      (item) => item.competenceMonth === transaction.competenceMonth,
    );
    if (alreadyInMonth) {
      continue;
    }
    bucket.push(transaction);
    groups.set(signature, bucket);
  }

  const suggestions: RecurringSuggestion[] = [];
  for (const [, transactions] of groups) {
    const suggestion = buildSuggestionFromGroup(transactions);
    if (!suggestion) {
      continue;
    }
    if (existingSignatures.has(suggestion.signature)) {
      continue;
    }
    if (isIgnoredSuggestion(suggestion, ignored)) {
      continue;
    }
    suggestions.push(suggestion);
  }

  return suggestions.sort((left, right) =>
    left.description.localeCompare(right.description, "pt-BR"),
  );
}

export function suggestionToRuleDraft(
  data: AppData,
  suggestion: RecurringSuggestion,
): RecurringRuleDraft {
  const displayDescription = transactionDisplayDescriptionForSource(
    data,
    suggestion.description,
  );
  return {
    kind: suggestion.kind,
    description: displayDescription,
    amountInput: centsToInputValue(suggestion.amountCents),
    category: suggestion.category,
    dayOfMonth: String(suggestion.dayOfMonth),
    startMonth: suggestion.startMonth,
    endMonth: "",
    billingMode: suggestion.billingMode,
    cardId: suggestion.cardId ?? "",
  };
}

export interface ConfirmSuggestionResult {
  errors: Record<string, string>;
  ruleId?: string;
  matchesCreated: number;
  reviewItems: Array<{ transactionId: string; reason: string }>;
}

function findEquivalentRule(data: AppData, suggestion: RecurringSuggestion): RecurringRule | undefined {
  const signature = suggestion.signature;
  return (data.recurringRules ?? []).find((rule) => {
    const ruleSignature = signatureInput({
      normalizedDescription: normalizeRecurringSuggestionDescription(rule.description),
      kind: rule.kind,
      billingMode: rule.billingMode,
      amountCents: rule.amountCents,
      ...(rule.cardId !== undefined ? { cardId: rule.cardId } : {}),
    });
    return ruleSignature === signature;
  });
}

function findRuleBySuggestionSignature(data: AppData, signature: string): RecurringRule | undefined {
  return (data.recurringRules ?? []).find(
    (rule) => ruleEquivalentSignature(rule) === signature,
  );
}

export function confirmRecurringSuggestion(
  data: AppData,
  suggestionId: string,
  options: {
    recurrenceClass: RecurrenceClass;
    selectedCompetenceMonth: string;
  },
): ConfirmSuggestionResult {
  const suggestion = buildRecurringSuggestions(data).find((item) => item.id === suggestionId);
  const existingRule = suggestion
    ? findEquivalentRule(data, suggestion)
    : findRuleBySuggestionSignature(data, suggestionId);

  if (!suggestion) {
    if (existingRule) {
      return {
        errors: {},
        ruleId: existingRule.id,
        matchesCreated: 0,
        reviewItems: [],
      };
    }
    return { errors: { suggestion: "Sugestão indisponível." }, matchesCreated: 0, reviewItems: [] };
  }

  if (existingRule) {
    return {
      errors: {},
      ruleId: existingRule.id,
      matchesCreated: 0,
      reviewItems: [],
    };
  }

  const draft: RecurringRuleDraft = {
    ...suggestionToRuleDraft(data, suggestion),
    recurrenceClass: options.recurrenceClass,
  };

  const errors = createRecurringRule(data, draft, {
    recurrenceClass: options.recurrenceClass,
    selectedCompetenceMonth: options.selectedCompetenceMonth,
  });
  if (Object.keys(errors).length > 0) {
    return { errors, matchesCreated: 0, reviewItems: [] };
  }

  const createdRule = findEquivalentRule(data, suggestion);
  if (!createdRule) {
    return { errors: { suggestion: "Não foi possível criar a regra." }, matchesCreated: 0, reviewItems: [] };
  }

  let matchesCreated = 0;
  const reviewItems: Array<{ transactionId: string; reason: string }> = [];
  for (const evidence of suggestion.evidences) {
    const result = createEvidenceMatchIfAbsent(
      data,
      createdRule.id,
      evidence.competenceMonth,
      evidence.transactionId,
    );
    if (result.created) {
      matchesCreated += 1;
    } else if (result.reviewReason) {
      reviewItems.push({ transactionId: evidence.transactionId, reason: result.reviewReason });
    }
  }

  return {
    errors: {},
    ruleId: createdRule.id,
    matchesCreated,
    reviewItems,
  };
}

export function restoreIgnoredRecurringSuggestion(
  data: AppData,
  snapshot: IgnoredRecurringSuggestion,
): boolean {
  data.ignoredRecurringSuggestions = (data.ignoredRecurringSuggestions ?? []).filter(
    (item) => item.signature !== snapshot.signature,
  );
  return true;
}

export function ignoreRecurringSuggestion(data: AppData, suggestionId: string): boolean {
  const suggestion = buildRecurringSuggestions(data).find((item) => item.id === suggestionId);
  if (!suggestion) {
    return false;
  }
  if (!data.ignoredRecurringSuggestions) {
    data.ignoredRecurringSuggestions = [];
  }
  data.ignoredRecurringSuggestions = data.ignoredRecurringSuggestions.filter(
    (item) => item.signature !== suggestion.signature,
  );
  data.ignoredRecurringSuggestions.push({
    signature: suggestion.signature,
    evidenceFingerprint: suggestion.evidenceFingerprint,
    ignoredAt: nowIso(),
  });
  return true;
}
