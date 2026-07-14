import {
  filterInvoicesByCompetence,
  filterTransactionsByCompetence,
  formatCompetenceLabel,
  formatDateLabel,
  invoiceOpenCents,
  invoicePaidCents,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  isInvoiceLinkedExpense,
  isProjectedInvoice,
  sumCents,
} from "./finance";
import { hasInvoiceForCardMonth, projectedInstallmentsForMonth } from "./installments";
import { inferRecurrenceClassFromRule } from "./recurrence-class";
import { recurringResolutionsForMonth } from "./recurrence-reconciliation";
import { recurringRuleDisplayDescription } from "./transaction-aliases";
import type { AppData, RecurringOccurrenceResolution } from "./types";

export type DashboardFixedBillStatus = "PAGA" | "PENDENTE" | "PREVISTA";

export interface DashboardFixedBillLine {
  id: string;
  name: string;
  dateLabel: string;
  amountCents: number;
  statusLabel: DashboardFixedBillStatus;
}

export interface DashboardFixedBillsSummary {
  lines: DashboardFixedBillLine[];
  subtotalCents: number;
}

export interface DashboardInvoiceLine {
  cardId: string;
  cardName: string;
  invoiceId?: string;
  invoiceLabel: string;
  competenceMonth: string;
  mode: "real" | "projected";
  statusLabel: string;
  totalCents: number;
  paidCents: number;
  openCents: number;
  dueDate: string;
  dueDateIso: string;
  sortGroup: number;
}

export interface DashboardInvoicesSummary {
  lines: DashboardInvoiceLine[];
}

function projectedDueDateIso(cardDueDay: number | null, competenceMonth: string): string {
  if (cardDueDay === null) {
    return "";
  }
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  const day = String(Math.min(cardDueDay, lastDay)).padStart(2, "0");
  return `${competenceMonth}-${day}`;
}

function fixedBillStatusForResolution(
  data: AppData,
  resolution: RecurringOccurrenceResolution,
): DashboardFixedBillStatus | null {
  if (resolution.state === "projected") {
    return "PREVISTA";
  }
  if (resolution.state !== "matched") {
    return null;
  }
  const transaction = data.transactions.find((item) => item.id === resolution.transactionId);
  return transaction?.status === "settled" ? "PAGA" : "PENDENTE";
}

function fixedBillAmountForResolution(
  resolution: RecurringOccurrenceResolution,
): number {
  if (resolution.state === "matched") {
    return resolution.actualAmountCents ?? resolution.expectedAmountCents;
  }
  return resolution.expectedAmountCents;
}

export function buildDashboardFixedBills(
  data: AppData,
  competenceMonth: string,
): DashboardFixedBillsSummary {
  const lines: DashboardFixedBillLine[] = [];

  for (const resolution of recurringResolutionsForMonth(data, competenceMonth)) {
    const rule = (data.recurringRules ?? []).find(
      (item) => item.id === resolution.occurrence.ruleId,
    );
    if (!rule || inferRecurrenceClassFromRule(rule) !== "fixed_bill") {
      continue;
    }

    const statusLabel = fixedBillStatusForResolution(data, resolution);
    if (!statusLabel) {
      continue;
    }

    lines.push({
      id: resolution.occurrence.id,
      name: recurringRuleDisplayDescription(
        data,
        rule,
        resolution.transactionId
          ? data.transactions.find((item) => item.id === resolution.transactionId)
          : undefined,
      ),
      dateLabel: formatDateLabel(resolution.occurrence.expectedDate),
      amountCents: fixedBillAmountForResolution(resolution),
      statusLabel,
    });
  }

  lines.sort((left, right) => left.dateLabel.localeCompare(right.dateLabel));

  return {
    lines,
    subtotalCents: sumCents(lines.map((item) => item.amountCents)),
  };
}

function cardHasMovement(
  data: AppData,
  cardId: string,
  competenceMonth: string,
): boolean {
  const transactions = filterTransactionsByCompetence(data.transactions, competenceMonth);
  const invoices = filterInvoicesByCompetence(data.invoices, competenceMonth);
  const hasInvoice = hasInvoiceForCardMonth(data, cardId, competenceMonth);
  const hasProjectedInvoiceRecord = invoices.some(
    (item) => item.cardId === cardId && isProjectedInvoice(item),
  );
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

  return hasInvoice || hasProjectedInvoiceRecord || hasCardTransactions || hasProjectedInstallments || hasRecurring;
}

export function invoiceDashboardSortGroup(
  line: Pick<DashboardInvoiceLine, "mode" | "statusLabel" | "openCents" | "dueDateIso">,
  today: string,
): number {
  if (line.mode === "projected") {
    return 2;
  }
  if (line.statusLabel === "Credora" || (line.openCents <= 0 && line.statusLabel === "Paga")) {
    return 4;
  }
  if (line.dueDateIso && line.dueDateIso < today && line.openCents > 0) {
    return 0;
  }
  if (line.statusLabel === "Aberta" || line.statusLabel === "Parcial") {
    return 1;
  }
  if (line.statusLabel === "Paga") {
    return 3;
  }
  return 1;
}

function compareInvoiceLines(left: DashboardInvoiceLine, right: DashboardInvoiceLine): number {
  if (left.sortGroup !== right.sortGroup) {
    return left.sortGroup - right.sortGroup;
  }
  if (!left.dueDateIso && right.dueDateIso) {
    return 1;
  }
  if (left.dueDateIso && !right.dueDateIso) {
    return -1;
  }
  if (left.dueDateIso && right.dueDateIso) {
    const dateDelta = left.dueDateIso.localeCompare(right.dueDateIso);
    if (dateDelta !== 0) {
      return dateDelta;
    }
  }
  return left.cardName.localeCompare(right.cardName);
}

export function sortDashboardInvoiceLines(
  lines: DashboardInvoiceLine[],
  today = new Date().toISOString().slice(0, 10),
): DashboardInvoiceLine[] {
  return [...lines]
    .map((line) => ({
      ...line,
      sortGroup: invoiceDashboardSortGroup(line, today),
    }))
    .sort(compareInvoiceLines);
}

export function buildDashboardCardSummary(
  data: AppData,
  competenceMonth: string,
): DashboardInvoicesSummary | null {
  const invoices = filterInvoicesByCompetence(data.invoices, competenceMonth);
  const projectedInstallments = projectedInstallmentsForMonth(data, competenceMonth);
  const recurringResolutions = recurringResolutionsForMonth(data, competenceMonth);
  const today = new Date().toISOString().slice(0, 10);
  const lines: DashboardInvoiceLine[] = [];

  for (const card of data.cards) {
    if (!cardHasMovement(data, card.id, competenceMonth)) {
      continue;
    }

    const invoice = invoices.find(
      (item) => item.cardId === card.id && !isProjectedInvoice(item),
    );
    const projectedInvoice = invoices.find(
      (item) => item.cardId === card.id && isProjectedInvoice(item),
    );
    if (invoice) {
      const statusLabel = invoiceStatusLabel(invoice);
      const open = invoiceOpenCents(invoice);
      const line: DashboardInvoiceLine = {
        cardId: card.id,
        cardName: card.name,
        invoiceId: invoice.id,
        invoiceLabel: `Fatura ${formatCompetenceLabel(invoice.competenceMonth)}`,
        competenceMonth: invoice.competenceMonth,
        mode: "real",
        statusLabel,
        totalCents: invoiceTotalCentsValue(invoice),
        paidCents: invoicePaidCents(invoice),
        openCents: open,
        dueDate: formatDateLabel(invoice.dueDate),
        dueDateIso: invoice.dueDate,
        sortGroup: 0,
      };
      line.sortGroup = invoiceDashboardSortGroup(line, today);
      lines.push(line);
      continue;
    }

    if (projectedInvoice) {
      const open = invoiceOpenCents(projectedInvoice);
      const dueDateIso = projectedInvoice.dueDate;
      const projectedLine: DashboardInvoiceLine = {
        cardId: card.id,
        cardName: card.name,
        invoiceId: projectedInvoice.id,
        invoiceLabel: "Fatura projetada",
        competenceMonth,
        mode: "projected",
        statusLabel: "PROJETADA",
        totalCents: invoiceTotalCentsValue(projectedInvoice),
        paidCents: 0,
        openCents: open,
        dueDate: dueDateIso ? formatDateLabel(dueDateIso) : "—",
        dueDateIso,
        sortGroup: 2,
      };
      lines.push(projectedLine);
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

    const dueDateIso = projectedDueDateIso(card.dueDay, competenceMonth);
    const projectedLine: DashboardInvoiceLine = {
      cardId: card.id,
      cardName: card.name,
      invoiceLabel: "Fatura projetada",
      competenceMonth,
      mode: "projected",
      statusLabel: "PROJETADA",
      totalCents: projectedTotal,
      paidCents: 0,
      openCents: projectedTotal,
      dueDate: dueDateIso ? formatDateLabel(dueDateIso) : "—",
      dueDateIso,
      sortGroup: 2,
    };
    lines.push(projectedLine);
  }

  if (lines.length === 0) {
    return null;
  }

  return {
    lines: sortDashboardInvoiceLines(lines, today),
  };
}

export function buildDashboardInvoicesSubtotalCents(
  data: AppData,
  competenceMonth: string,
): number {
  const summary = buildDashboardCardSummary(data, competenceMonth);
  if (!summary) {
    return 0;
  }
  return sumCents(summary.lines.map((item) => item.totalCents));
}
