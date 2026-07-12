import { formatCentsToBRL, formatCompetenceLabel, formatDateLabel, transactionStatusLabel } from "./finance";
import { buildRecurringOccurrences } from "./recurrences";
import { recurringResolutionsForMonth } from "./recurrence-reconciliation";
import type { AppData, RecurringOccurrenceResolutionState, RecurringRule, Transaction } from "./types";

export type RuleDisplayStatus = "active" | "paused" | "ended";

export type RuleFilter = "all" | "active" | "paused" | "ended";

export interface PlanejamentoSummary {
  incomeProjectedCents: number;
  expenseProjectedCents: number;
  projectedCount: number;
  matchedCount: number;
  coveredCount: number;
}

export function ruleDisplayStatus(
  rule: RecurringRule,
  referenceMonth: string,
): RuleDisplayStatus {
  if (rule.status === "paused") {
    return "paused";
  }
  if (rule.endMonth !== undefined && rule.endMonth < referenceMonth) {
    return "ended";
  }
  return "active";
}

export function ruleDisplayStatusLabel(status: RuleDisplayStatus): string {
  if (status === "paused") {
    return "Pausada";
  }
  if (status === "ended") {
    return "Encerrada";
  }
  return "Ativa";
}

export function ruleMatchesFilter(
  rule: RecurringRule,
  filter: RuleFilter,
  referenceMonth: string,
): boolean {
  if (filter === "all") {
    return true;
  }
  return ruleDisplayStatus(rule, referenceMonth) === filter;
}

export function nextValidOccurrenceMonth(
  rule: RecurringRule,
  fromMonth: string,
): string | null {
  if (rule.status !== "active") {
    return null;
  }

  const endMonth = rule.endMonth ?? shiftMonths(fromMonth, 24);
  const occurrences = buildRecurringOccurrences([rule], fromMonth, endMonth);
  return occurrences[0]?.competenceMonth ?? null;
}

function shiftMonths(competenceMonth: string, delta: number): string {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1 + delta, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function buildPlanejamentoSummary(
  data: AppData,
  competenceMonth: string,
): PlanejamentoSummary {
  const resolutions = recurringResolutionsForMonth(data, competenceMonth);
  let incomeProjectedCents = 0;
  let expenseProjectedCents = 0;
  let projectedCount = 0;
  let matchedCount = 0;
  let coveredCount = 0;

  for (const resolution of resolutions) {
    if (resolution.state === "projected") {
      projectedCount += 1;
      if (resolution.occurrence.kind === "income") {
        incomeProjectedCents += resolution.expectedAmountCents;
      } else {
        expenseProjectedCents += resolution.expectedAmountCents;
      }
    } else if (resolution.state === "matched") {
      matchedCount += 1;
    } else if (resolution.state === "covered_by_invoice") {
      coveredCount += 1;
    }
  }

  return {
    incomeProjectedCents,
    expenseProjectedCents,
    projectedCount,
    matchedCount,
    coveredCount,
  };
}

export function resolutionStateLabel(
  state: RecurringOccurrenceResolutionState,
): string {
  if (state === "matched") {
    return "CONCILIADA";
  }
  if (state === "covered_by_invoice") {
    return "COBERTA PELA FATURA";
  }
  return "PREVISTA";
}

export function resolutionStateVariant(
  state: RecurringOccurrenceResolutionState,
): "success" | "neutral" | "warning" {
  if (state === "matched") {
    return "success";
  }
  if (state === "covered_by_invoice") {
    return "neutral";
  }
  return "warning";
}

export function formatRecurringDifferenceLabel(differenceCents: number): string {
  if (differenceCents === 0) {
    return "Conforme previsto";
  }
  const formatted = formatCentsToBRL(Math.abs(differenceCents));
  if (differenceCents > 0) {
    return `${formatted} acima do previsto`;
  }
  return `${formatted} abaixo do previsto`;
}

export function billingModeLabel(mode: RecurringRule["billingMode"]): string {
  return mode === "card" ? "Cartão" : "Direta";
}

export function transactionPlanningStatusLabel(transaction: Transaction): string {
  return transactionStatusLabel(
    transaction.kind,
    transaction.status,
    transaction.ledgerStatus,
  );
}

export function cardNameById(data: AppData, cardId: string | undefined): string {
  if (!cardId) {
    return "—";
  }
  return data.cards.find((card) => card.id === cardId)?.name ?? cardId;
}

export function formatRulePeriod(rule: RecurringRule): string {
  const start = formatCompetenceLabel(rule.startMonth);
  if (rule.status === "paused" && rule.pausedFromMonth) {
    const pauseFrom = formatCompetenceLabel(rule.pausedFromMonth);
    if (!rule.endMonth) {
      return `${start} · pausada desde ${pauseFrom}`;
    }
    return `${start} · ${formatCompetenceLabel(rule.endMonth)} · pausada desde ${pauseFrom}`;
  }
  if (!rule.endMonth) {
    return `${start} · em aberto`;
  }
  return `${start} · até ${formatCompetenceLabel(rule.endMonth)} (inclusivo)`;
}

export function formatOccurrenceType(kind: RecurringRule["kind"]): string {
  return kind === "income" ? "Receita" : "Despesa";
}

export function formatTransactionDate(transaction: Transaction): string {
  return formatDateLabel(transaction.date);
}
