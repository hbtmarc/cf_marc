import { createId, nowIso, parseMoneyToCents } from "./finance";
import {
  recurringMatchId,
  validateRecurringMatch,
} from "./recurrence-reconciliation";
import { validateRecurringRule } from "./recurrences";
import type {
  AppData,
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
}

function draftToRule(
  draft: RecurringRuleDraft,
  id: string,
  timestamps: { createdAt: string; updatedAt: string },
  status: RecurringRule["status"] = "active",
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

  return rule;
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
): Record<string, string> {
  const cardIds = data.cards.map((card) => card.id);
  const errors = validateRecurringRuleDraft(draft, cardIds);
  if (Object.keys(errors).length > 0) {
    return errors;
  }

  const timestamp = nowIso();
  const rule = draftToRule(draft, createId(), {
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!rule) {
    return { amount: "Informe um valor maior que zero." };
  }

  if (!data.recurringRules) {
    data.recurringRules = [];
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

  Object.assign(existing, updated);
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
