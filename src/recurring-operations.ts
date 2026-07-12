import { createId, nowIso, parseMoneyToCents } from "./finance";
import {
  applyRecurrenceClassToRule,
  normalizeLegacyRecurringRule,
} from "./recurrence-class";
import { renewRuleForTwelveMonths } from "./recurrence-renewal";
import {
  recurringMatchId,
  validateRecurringMatch,
} from "./recurrence-reconciliation";
import { validateRecurringRule } from "./recurrences";
import type {
  AppData,
  RecurrenceClass,
  RecurringBillingMode,
  RecurringRule,
  RecurringRuleKind,
} from "./types";

export interface RecurringRuleDraft {
  kind: RecurringRuleKind;
  description: string;
  amountInput: string;
  category: string;
  dayOfMonth: string;
  startMonth: string;
  endMonth: string;
  billingMode: RecurringBillingMode;
  cardId: string;
  recurrenceClass?: RecurrenceClass;
}

function draftToRule(
  draft: RecurringRuleDraft,
  id: string,
  timestamps: { createdAt: string; updatedAt: string },
  status: RecurringRule["status"] = "active",
  seriesId?: string,
): RecurringRule | null {
  const amountCents = parseMoneyToCents(draft.amountInput);
  const day = Number(draft.dayOfMonth);
  if (amountCents === null) {
    return null;
  }

  const rule: RecurringRule = {
    id,
    kind: draft.kind,
    description: draft.description.trim(),
    amountCents,
    category: draft.category.trim(),
    dayOfMonth: day,
    startMonth: draft.startMonth.trim(),
    status,
    billingMode: draft.kind === "income" ? "direct" : draft.billingMode,
    seriesId: seriesId ?? id,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };

  const endMonth = draft.endMonth.trim();
  if (endMonth.length > 0) {
    rule.endMonth = endMonth;
  }

  if (rule.billingMode === "card" && draft.cardId.trim().length > 0) {
    rule.cardId = draft.cardId.trim();
  }

  if (draft.recurrenceClass) {
    rule.recurrenceClass = draft.recurrenceClass;
  }

  return normalizeLegacyRecurringRule(rule);
}

export function validateRecurringRuleDraft(
  draft: RecurringRuleDraft,
  cardIds: readonly string[],
  existingRule?: RecurringRule,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const amountCents = parseMoneyToCents(draft.amountInput);
  if (amountCents === null) {
    errors.amount = "Informe um valor maior que zero.";
  }

  const day = Number(draft.dayOfMonth);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    errors.dayOfMonth = "Informe um dia entre 1 e 31.";
  }

  if (draft.description.trim().length === 0) {
    errors.description = "Descrição é obrigatória.";
  }

  if (draft.category.trim().length === 0) {
    errors.category = "Categoria é obrigatória.";
  }

  if (draft.startMonth.trim().length === 0) {
    errors.startMonth = "Competência inicial é obrigatória.";
  }

  if (amountCents === null || !Number.isInteger(day)) {
    return errors;
  }

  const probe = draftToRule(
    draft,
    existingRule?.id ?? "draft",
    {
      createdAt: existingRule?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    },
    existingRule?.status ?? "active",
  );

  if (!probe) {
    return errors;
  }

  const ruleErrors = validateRecurringRule(probe, { cardIds });
  return { ...errors, ...ruleErrors };
}

export function createRecurringRule(
  data: AppData,
  draft: RecurringRuleDraft,
  options?: {
    recurrenceClass?: RecurrenceClass;
    selectedCompetenceMonth?: string;
    seriesId?: string;
    ruleId?: string;
  },
): Record<string, string> {
  const cardIds = data.cards.map((card) => card.id);
  const errors = validateRecurringRuleDraft(draft, cardIds);
  if (Object.keys(errors).length > 0) {
    return errors;
  }

  const timestamp = nowIso();
  const ruleId = options?.ruleId ?? createId();
  const rule = draftToRule(
    draft,
    ruleId,
    {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    "active",
    options?.seriesId,
  );
  if (!rule) {
    return { amount: "Informe um valor maior que zero." };
  }

  if (options?.recurrenceClass && options.selectedCompetenceMonth) {
    applyRecurrenceClassToRule(rule, options.recurrenceClass, options.selectedCompetenceMonth);
  } else if (draft.recurrenceClass && options?.selectedCompetenceMonth) {
    applyRecurrenceClassToRule(rule, draft.recurrenceClass, options.selectedCompetenceMonth);
  } else {
    normalizeLegacyRecurringRule(rule);
  }

  const ruleErrors = validateRecurringRule(rule, { cardIds });
  if (Object.keys(ruleErrors).length > 0) {
    return ruleErrors;
  }

  if (!data.recurringRules) {
    data.recurringRules = [];
  }
  const duplicate = data.recurringRules.find((item) => item.id === rule.id);
  if (duplicate) {
    return {};
  }
  data.recurringRules.push(rule);
  return {};
}

export function updateRecurringRule(
  data: AppData,
  ruleId: string,
  draft: RecurringRuleDraft,
): Record<string, string> {
  const existing = (data.recurringRules ?? []).find((rule) => rule.id === ruleId);
  if (!existing) {
    return { rule: "Regra não encontrada." };
  }

  const cardIds = data.cards.map((card) => card.id);
  const errors = validateRecurringRuleDraft(draft, cardIds, existing);
  if (Object.keys(errors).length > 0) {
    return errors;
  }

  const updated = draftToRule(draft, ruleId, {
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  }, existing.status);

  if (!updated) {
    return { amount: "Informe um valor maior que zero." };
  }

  Object.assign(existing, updated, {
    seriesId: existing.seriesId ?? existing.id,
    recurrenceClass: existing.recurrenceClass ?? updated.recurrenceClass,
    renewalPolicy: existing.renewalPolicy ?? updated.renewalPolicy,
    renewedThroughMonth: existing.renewedThroughMonth ?? updated.renewedThroughMonth,
  });
  return {};
}

export function pauseRecurringRule(
  data: AppData,
  ruleId: string,
  fromMonth: string,
): void {
  const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
  if (!rule) {
    return;
  }
  rule.status = "paused";
  rule.pausedFromMonth = fromMonth;
  delete rule.resumedFromMonth;
  rule.updatedAt = nowIso();
}

export function resumeRecurringRule(
  data: AppData,
  ruleId: string,
  fromMonth: string,
): void {
  const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
  if (!rule) {
    return;
  }
  rule.status = "active";
  rule.resumedFromMonth = fromMonth;
  rule.updatedAt = nowIso();
}

export function endRecurringRule(
  data: AppData,
  ruleId: string,
  endMonth: string,
): void {
  const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
  if (!rule) {
    return;
  }
  rule.endMonth = endMonth;
  rule.updatedAt = nowIso();
}

export function createRecurringMatch(
  data: AppData,
  ruleId: string,
  competenceMonth: string,
  transactionId: string,
): Record<string, string> {
  const timestamp = nowIso();
  const match = {
    id: recurringMatchId(ruleId, competenceMonth),
    ruleId,
    competenceMonth,
    transactionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const errors = validateRecurringMatch(match, data);
  if (Object.keys(errors).length > 0) {
    return errors;
  }

  if (!data.recurringMatches) {
    data.recurringMatches = [];
  }

  const existingIndex = data.recurringMatches.findIndex(
    (item) => item.id === match.id,
  );
  if (existingIndex >= 0) {
    data.recurringMatches[existingIndex] = match;
  } else {
    data.recurringMatches.push(match);
  }

  return {};
}

export function removeRecurringMatch(
  data: AppData,
  ruleId: string,
  competenceMonth: string,
): void {
  if (!data.recurringMatches) {
    return;
  }
  const matchId = recurringMatchId(ruleId, competenceMonth);
  data.recurringMatches = data.recurringMatches.filter((item) => item.id !== matchId);
}

export function removeRecurringMatchById(data: AppData, matchId: string): void {
  if (!data.recurringMatches) {
    return;
  }
  data.recurringMatches = data.recurringMatches.filter((item) => item.id !== matchId);
}

export function renewRecurringRule(
  data: AppData,
  ruleId: string,
  referenceMonth: string,
): Record<string, string> {
  const rule = (data.recurringRules ?? []).find((item) => item.id === ruleId);
  if (!rule) {
    return { rule: "Regra não encontrada." };
  }
  normalizeLegacyRecurringRule(rule);
  if (rule.renewalPolicy !== "manual_annual") {
    return { renewal: "Esta regra não possui renovação anual." };
  }
  renewRuleForTwelveMonths(rule, referenceMonth);
  rule.updatedAt = nowIso();
  return {};
}

export function createEvidenceMatchIfAbsent(
  data: AppData,
  ruleId: string,
  competenceMonth: string,
  transactionId: string,
): { created: boolean; reviewReason?: string } {
  const existingForTransaction = (data.recurringMatches ?? []).find(
    (item) => item.transactionId === transactionId,
  );
  if (
    existingForTransaction &&
    !(
      existingForTransaction.ruleId === ruleId &&
      existingForTransaction.competenceMonth === competenceMonth
    )
  ) {
    return { created: false, reviewReason: "Transação já vinculada a outra regra." };
  }

  const matchId = recurringMatchId(ruleId, competenceMonth);
  const existing = (data.recurringMatches ?? []).find((item) => item.id === matchId);
  if (existing) {
    return { created: false };
  }

  const errors = createRecurringMatch(data, ruleId, competenceMonth, transactionId);
  if (Object.keys(errors).length > 0) {
    const reason = Object.values(errors)[0];
    return reason ? { created: false, reviewReason: reason } : { created: false };
  }
  return { created: true };
}
