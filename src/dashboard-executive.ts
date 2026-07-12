import {
  filterInvoicesByCompetence,
  filterTransactionsByCompetence,
  formatDateLabel,
  invoiceNeedsFinancialAction,
  invoiceOpenCents,
  invoicePaidCents,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  isInvoiceLinkedExpense,
  sumCents,
} from "./finance";
import { hasInvoiceForCardMonth, projectedInstallmentsForMonth } from "./installments";
import {
  buildPlanejamentoSummary,
  cardNameById,
  resolutionStateLabel,
} from "./planejamento-presentation";
import { recurringResolutionsForMonth } from "./recurrence-reconciliation";
import type {
  AppData,
  RecurringOccurrenceResolution,
  RecurringOccurrenceResolutionState,
} from "./types";

export interface DashboardRecurringLine {
  id: string;
  description: string;
  expectedDate: string;
  amountCents: number;
  kind: "income" | "expense";
  state: RecurringOccurrenceResolutionState;
  stateLabel: string;
  cardName?: string;
}

export interface DashboardRecurringSummary {
  incomeProjectedCents: number;
  expenseProjectedCents: number;
  projectedCount: number;
  matchedCount: number;
  coveredCount: number;
  lines: DashboardRecurringLine[];
}

export interface DashboardCardLine {
  cardId: string;
  cardName: string;
  mode: "real" | "projected";
  statusLabel: string;
  totalCents: number;
  paidCents: number;
  openCents: number;
  dueDate: string;
  needsAttention: boolean;
}

export interface DashboardCardSummary {
  cards: DashboardCardLine[];
  footerTotalCents: number;
  footerOpenCents: number;
  attentionCount: number;
}

function recurringLinePriority(state: RecurringOccurrenceResolutionState): number {
  if (state === "projected") {
    return 0;
  }
  if (state === "matched") {
    return 1;
  }
  return 2;
}

function sortRecurringResolutions(
  resolutions: RecurringOccurrenceResolution[],
): RecurringOccurrenceResolution[] {
  return [...resolutions].sort((left, right) => {
    const priorityDelta =
      recurringLinePriority(left.state) - recurringLinePriority(right.state);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    if (left.state === "projected" && right.state === "projected") {
      const dateDelta = left.occurrence.expectedDate.localeCompare(
        right.occurrence.expectedDate,
      );
      if (dateDelta !== 0) {
        return dateDelta;
      }
    }
    return right.occurrence.amountCents - left.occurrence.amountCents;
  });
}

export function buildDashboardRecurringSummary(
  data: AppData,
  competenceMonth: string,
): DashboardRecurringSummary | null {
  const resolutions = recurringResolutionsForMonth(data, competenceMonth);
  if (resolutions.length === 0) {
    return null;
  }

  const summary = buildPlanejamentoSummary(data, competenceMonth);
  const lines = sortRecurringResolutions(resolutions).slice(0, 5).map((resolution) => {
    const occurrence = resolution.occurrence;
    const line: DashboardRecurringLine = {
      id: occurrence.id,
      description: occurrence.description,
      expectedDate: occurrence.expectedDate,
      amountCents: occurrence.amountCents,
      kind: occurrence.kind,
      state: resolution.state,
      stateLabel: resolutionStateLabel(resolution.state),
    };
    if (occurrence.billingMode === "card" && occurrence.cardId) {
      line.cardName = cardNameById(data, occurrence.cardId);
    }
    return line;
  });

  return {
    incomeProjectedCents: summary.incomeProjectedCents,
    expenseProjectedCents: summary.expenseProjectedCents,
    projectedCount: summary.projectedCount,
    matchedCount: summary.matchedCount,
    coveredCount: summary.coveredCount,
    lines,
  };
}

function projectedDueDate(cardDueDay: number | null, competenceMonth: string): string {
  if (cardDueDay === null) {
    return "—";
  }
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  const day = String(Math.min(cardDueDay, lastDay)).padStart(2, "0");
  return formatDateLabel(`${competenceMonth}-${day}`);
}

function cardHasMovement(
  data: AppData,
  cardId: string,
  competenceMonth: string,
): boolean {
  const transactions = filterTransactionsByCompetence(data.transactions, competenceMonth);
  const hasInvoice = hasInvoiceForCardMonth(data, cardId, competenceMonth);
  const hasCardTransactions = transactions.some(
    (item) => item.cardId === cardId && isInvoiceLinkedExpense(item),
  );
  const hasProjectedInstallments = projectedInstallmentsForMonth(data, competenceMonth).some(
    (item) => item.cardId === cardId,
  );
  const hasRecurring = recurringResolutionsForMonth(data, competenceMonth).some(
    (item) =>
      item.occurrence.billingMode === "card" && item.occurrence.cardId === cardId,
  );

  return hasInvoice || hasCardTransactions || hasProjectedInstallments || hasRecurring;
}

export function buildDashboardCardSummary(
  data: AppData,
  competenceMonth: string,
): DashboardCardSummary | null {
  const invoices = filterInvoicesByCompetence(data.invoices, competenceMonth);
  const projectedInstallments = projectedInstallmentsForMonth(data, competenceMonth);
  const recurringResolutions = recurringResolutionsForMonth(data, competenceMonth);
  const today = new Date().toISOString().slice(0, 10);
  const cards: DashboardCardLine[] = [];

  for (const card of data.cards) {
    if (!cardHasMovement(data, card.id, competenceMonth)) {
      continue;
    }

    const invoice = invoices.find((item) => item.cardId === card.id);
    if (invoice) {
      const open = invoiceOpenCents(invoice);
      cards.push({
        cardId: card.id,
        cardName: card.name,
        mode: "real",
        statusLabel: invoiceStatusLabel(invoice),
        totalCents: invoiceTotalCentsValue(invoice),
        paidCents: invoicePaidCents(invoice),
        openCents: open,
        dueDate: formatDateLabel(invoice.dueDate),
        needsAttention: invoiceNeedsFinancialAction(invoice, today),
      });
      continue;
    }

    const installmentTotal = sumCents(
      projectedInstallments
        .filter((item) => item.cardId === card.id)
        .map((item) => item.amountCents),
    );
    const recurringTotal = sumCents(
      recurringResolutions
        .filter(
          (item) =>
            item.state === "projected" &&
            item.occurrence.billingMode === "card" &&
            item.occurrence.cardId === card.id,
        )
        .map((item) => item.occurrence.amountCents),
    );
    const projectedTotal = installmentTotal + recurringTotal;
    if (projectedTotal <= 0) {
      continue;
    }

    cards.push({
      cardId: card.id,
      cardName: card.name,
      mode: "projected",
      statusLabel: "Fatura projetada",
      totalCents: projectedTotal,
      paidCents: 0,
      openCents: projectedTotal,
      dueDate: projectedDueDate(card.dueDay, competenceMonth),
      needsAttention: true,
    });
  }

  if (cards.length === 0) {
    return null;
  }

  return {
    cards: cards.sort((left, right) => right.openCents - left.openCents),
    footerTotalCents: sumCents(cards.map((item) => item.totalCents)),
    footerOpenCents: sumCents(cards.map((item) => item.openCents)),
    attentionCount: cards.filter((item) => item.needsAttention).length,
  };
}
