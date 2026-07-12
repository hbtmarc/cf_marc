import { isValidCompetenceMonth } from "./finance";
import type {
  AppData,
  ProjectedRecurringOccurrence,
  RecurringRule,
} from "./types";

export function recurringOccurrenceId(
  ruleId: string,
  competenceMonth: string,
): string {
  return `recurring:${ruleId}:${competenceMonth}`;
}

function compareCompetenceMonths(a: string, b: string): number {
  return a.localeCompare(b);
}

function lastDayOfCompetenceMonth(competenceMonth: string): number {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return new Date(year, month, 0).getDate();
}

export function recurringOccurrenceDate(
  competenceMonth: string,
  dayOfMonth: number,
): string {
  const lastDay = lastDayOfCompetenceMonth(competenceMonth);
  const effectiveDay = Math.min(dayOfMonth, lastDay);
  const day = String(effectiveDay).padStart(2, "0");
  return `${competenceMonth}-${day}`;
}

function* iterateCompetenceMonths(
  startMonth: string,
  endMonth: string,
): Generator<string> {
  let current = startMonth;
  while (compareCompetenceMonths(current, endMonth) <= 0) {
    yield current;
    const [yearStr, monthStr] = current.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const next = new Date(year, month - 1 + 1, 1);
    const nextYear = next.getFullYear();
    const nextMonth = String(next.getMonth() + 1).padStart(2, "0");
    current = `${nextYear}-${nextMonth}`;
  }
}

function occurrenceFromRule(
  rule: RecurringRule,
  competenceMonth: string,
): ProjectedRecurringOccurrence {
  const occurrence: ProjectedRecurringOccurrence = {
    id: recurringOccurrenceId(rule.id, competenceMonth),
    ruleId: rule.id,
    kind: rule.kind,
    competenceMonth,
    expectedDate: recurringOccurrenceDate(competenceMonth, rule.dayOfMonth),
    description: rule.description,
    amountCents: rule.amountCents,
    category: rule.category,
    billingMode: rule.billingMode,
    projected: true,
  };

  if (rule.billingMode === "card" && rule.cardId !== undefined) {
    occurrence.cardId = rule.cardId;
  }

  return occurrence;
}

export function buildRecurringOccurrences(
  rules: readonly RecurringRule[],
  startMonth: string,
  endMonth: string,
): ProjectedRecurringOccurrence[] {
  const occurrences: ProjectedRecurringOccurrence[] = [];

  for (const rule of rules) {
    if (rule.status !== "active") {
      continue;
    }

    const rangeStart =
      compareCompetenceMonths(rule.startMonth, startMonth) > 0
        ? rule.startMonth
        : startMonth;
    const ruleEnd = rule.endMonth ?? endMonth;
    const rangeEnd =
      compareCompetenceMonths(ruleEnd, endMonth) < 0 ? ruleEnd : endMonth;

    if (compareCompetenceMonths(rangeStart, rangeEnd) > 0) {
      continue;
    }

    for (const competenceMonth of iterateCompetenceMonths(rangeStart, rangeEnd)) {
      if (compareCompetenceMonths(competenceMonth, rule.startMonth) < 0) {
        continue;
      }
      if (rule.endMonth && compareCompetenceMonths(competenceMonth, rule.endMonth) > 0) {
        continue;
      }

      occurrences.push(occurrenceFromRule(rule, competenceMonth));
    }
  }

  return occurrences;
}

export function recurringOccurrencesForMonth(
  data: AppData,
  competenceMonth: string,
): ProjectedRecurringOccurrence[] {
  const rules = data.recurringRules ?? [];
  return buildRecurringOccurrences(rules, competenceMonth, competenceMonth);
}

export interface RecurringRuleValidationContext {
  cardIds?: readonly string[];
}

export function validateRecurringRule(
  rule: RecurringRule,
  context?: RecurringRuleValidationContext,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (rule.description.trim().length === 0) {
    errors.description = "Descrição é obrigatória.";
  }

  if (!Number.isInteger(rule.amountCents) || rule.amountCents <= 0) {
    errors.amountCents = "Valor deve ser um inteiro maior que zero.";
  }

  if (
    !Number.isInteger(rule.dayOfMonth) ||
    rule.dayOfMonth < 1 ||
    rule.dayOfMonth > 31
  ) {
    errors.dayOfMonth = "Dia do mês deve estar entre 1 e 31.";
  }

  if (!isValidCompetenceMonth(rule.startMonth)) {
    errors.startMonth = "Competência inicial inválida.";
  }

  if (rule.endMonth !== undefined && !isValidCompetenceMonth(rule.endMonth)) {
    errors.endMonth = "Competência final inválida.";
  }

  if (
    rule.endMonth !== undefined &&
    isValidCompetenceMonth(rule.startMonth) &&
    isValidCompetenceMonth(rule.endMonth) &&
    compareCompetenceMonths(rule.endMonth, rule.startMonth) < 0
  ) {
    errors.endMonth = "Competência final não pode ser anterior à inicial.";
  }

  if (rule.kind === "income" && rule.billingMode !== "direct") {
    errors.billingMode = "Receitas devem usar modo de cobrança direto.";
  }

  if (
    rule.kind === "expense" &&
    rule.billingMode !== "direct" &&
    rule.billingMode !== "card"
  ) {
    errors.billingMode = "Modo de cobrança inválido.";
  }

  if (rule.billingMode === "card") {
    if (!rule.cardId || rule.cardId.trim().length === 0) {
      errors.cardId = "Cartão é obrigatório para cobrança no cartão.";
    } else if (context?.cardIds && !context.cardIds.includes(rule.cardId)) {
      errors.cardId = "Cartão inexistente.";
    }
  }

  if (rule.billingMode === "direct" && rule.cardId !== undefined) {
    errors.cardId = "Cartão não deve ser informado para cobrança direta.";
  }

  return errors;
}

export function isValidRecurringRule(
  rule: RecurringRule,
  context?: RecurringRuleValidationContext,
): boolean {
  return Object.keys(validateRecurringRule(rule, context)).length === 0;
}
