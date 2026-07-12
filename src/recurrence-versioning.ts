import { createId, nowIso } from "./finance";
import { compareCompetenceMonths, shiftCompetenceMonth } from "./recurrence-renewal";
import { recurringMatchId } from "./recurrence-reconciliation";
import { validateRecurringRule } from "./recurrences";
import { inferRecurrenceClassFromRule, normalizeLegacyRecurringRule } from "./recurrence-class";
import type { AppData, RecurringRule } from "./types";

function findRule(data: AppData, ruleId: string): RecurringRule | undefined {
  return (data.recurringRules ?? []).find((item) => item.id === ruleId);
}

function seriesRules(data: AppData, seriesId: string): RecurringRule[] {
  return (data.recurringRules ?? []).filter((item) => (item.seriesId ?? item.id) === seriesId);
}

function hasSeriesOverlap(
  data: AppData,
  seriesId: string,
  startMonth: string,
  endMonth: string | undefined,
  excludeRuleId?: string,
): boolean {
  for (const rule of seriesRules(data, seriesId)) {
    if (excludeRuleId && rule.id === excludeRuleId) {
      continue;
    }
    const ruleEnd = rule.endMonth ?? "9999-12";
    const newEnd = endMonth ?? "9999-12";
    if (compareCompetenceMonths(startMonth, ruleEnd) <= 0 && compareCompetenceMonths(rule.startMonth, newEnd) <= 0) {
      return true;
    }
  }
  return false;
}

export function updateRecurringRuleAmountFromMonth(
  data: AppData,
  ruleId: string,
  effectiveMonth: string,
  newAmountCents: number,
): Record<string, string> {
  const rule = findRule(data, ruleId);
  if (!rule) {
    return { rule: "Regra não encontrada." };
  }
  normalizeLegacyRecurringRule(rule);

  if (!Number.isInteger(newAmountCents) || newAmountCents <= 0) {
    return { amountCents: "Valor deve ser maior que zero." };
  }
  if (compareCompetenceMonths(effectiveMonth, rule.startMonth) < 0) {
    return { effectiveMonth: "Competência anterior ao início da regra." };
  }

  const priorMatches = (data.recurringMatches ?? []).some(
    (item) =>
      item.ruleId === rule.id &&
      compareCompetenceMonths(item.competenceMonth, effectiveMonth) < 0,
  );

  if (
    effectiveMonth === rule.startMonth &&
    !priorMatches &&
    !seriesRules(data, rule.seriesId ?? rule.id).some(
      (item) => item.id !== rule.id && compareCompetenceMonths(item.startMonth, effectiveMonth) < 0,
    )
  ) {
    rule.amountCents = newAmountCents;
    rule.updatedAt = nowIso();
    return {};
  }

  const previousEnd = shiftCompetenceMonth(effectiveMonth, -1);
  if (compareCompetenceMonths(previousEnd, rule.startMonth) < 0) {
    rule.amountCents = newAmountCents;
    rule.updatedAt = nowIso();
    return {};
  }

  const seriesId = rule.seriesId ?? rule.id;
  if (hasSeriesOverlap(data, seriesId, effectiveMonth, undefined, rule.id)) {
    return { series: "Já existe versão da série para esta competência." };
  }

  const snapshot = {
    rules: structuredClone(data.recurringRules ?? []),
    matches: structuredClone(data.recurringMatches ?? []),
  };

  rule.endMonth = previousEnd;
  rule.updatedAt = nowIso();

  const timestamp = nowIso();
  const newRule: RecurringRule = {
    id: createId(),
    kind: rule.kind,
    description: rule.description,
    amountCents: newAmountCents,
    category: rule.category,
    dayOfMonth: rule.dayOfMonth,
    startMonth: effectiveMonth,
    status: rule.status,
    billingMode: rule.billingMode,
    seriesId,
    recurrenceClass: rule.recurrenceClass ?? inferRecurrenceClassFromRule(rule),
    renewalPolicy: rule.renewalPolicy ?? "none",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (rule.cardId !== undefined) {
    newRule.cardId = rule.cardId;
  }
  if (rule.pausedFromMonth !== undefined) {
    newRule.pausedFromMonth = rule.pausedFromMonth;
  }
  if (rule.resumedFromMonth !== undefined) {
    newRule.resumedFromMonth = rule.resumedFromMonth;
  }
  if (rule.renewedThroughMonth !== undefined) {
    newRule.renewedThroughMonth = rule.renewedThroughMonth;
  }

  const validation = validateRecurringRule(newRule, {
    cardIds: data.cards.map((card) => card.id),
  });
  if (Object.keys(validation).length > 0) {
    data.recurringRules = snapshot.rules;
    data.recurringMatches = snapshot.matches;
    return validation;
  }

  if (!data.recurringRules) {
    data.recurringRules = [];
  }
  data.recurringRules.push(newRule);

  if (!data.recurringMatches) {
    data.recurringMatches = [];
  }

  data.recurringMatches = data.recurringMatches.map((match) => {
    if (match.ruleId !== rule.id) {
      return match;
    }
    if (compareCompetenceMonths(match.competenceMonth, effectiveMonth) < 0) {
      return match;
    }
    return {
      ...match,
      id: recurringMatchId(newRule.id, match.competenceMonth),
      ruleId: newRule.id,
      updatedAt: timestamp,
    };
  });

  return {};
}
