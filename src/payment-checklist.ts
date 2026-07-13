import {
  calculateCompetenceSummary,
  formatCentsToBRL,
  formatDateLabel,
  invoiceOpenCents,
  invoicePaidCents,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  isInvoiceLinkedExpense,
  ledgerExpenseCents,
  sumCents,
} from "./finance";
import { buildDashboardCardSummary } from "./dashboard-executive";
import { inferRecurrenceClassFromRule } from "./recurrence-class";
import { recurringResolutionsForMonth } from "./recurrence-reconciliation";
import {
  recurringRuleDisplayDescription,
  transactionDisplayDescription,
} from "./transaction-aliases";
import type { AppData, Invoice, Transaction } from "./types";

export type PaymentChecklistItemKind = "fixed_bill" | "invoice" | "other";
export type PaymentChecklistItemState = "paid" | "pending" | "projected";

export interface PaymentChecklistItem {
  id: string;
  kind: PaymentChecklistItemKind;
  title: string;
  detail: string;
  amountCents: number;
  dueDateIso: string;
  sourceState: PaymentChecklistItemState;
  sourceLabel: string;
  sourceChecked: boolean;
  manuallyChecked: boolean;
  checked: boolean;
  checkable: boolean;
}

export interface PaymentChecklistProjection {
  id: string;
  title: string;
  detail: string;
  amountCents: number;
  dueDateIso: string;
}

export interface PaymentChecklistSummary {
  competenceMonth: string;
  items: PaymentChecklistItem[];
  projections: PaymentChecklistProjection[];
  totalCount: number;
  checkedCount: number;
  checklistTargetCents: number;
  checklistCheckedCents: number;
  checklistRemainingCents: number;
  sourcePaidCents: number;
  sourceOutstandingCents: number;
  commitmentTotalCents: number;
  projectedCents: number;
  currentBalanceCents: number;
  estimatedBalanceAfterCommitmentsCents: number;
  allChecked: boolean;
}

function compareByDueDateAndTitle(
  left: Pick<PaymentChecklistItem, "dueDateIso" | "title">,
  right: Pick<PaymentChecklistItem, "dueDateIso" | "title">,
): number {
  if (!left.dueDateIso && right.dueDateIso) {
    return 1;
  }
  if (left.dueDateIso && !right.dueDateIso) {
    return -1;
  }
  const dateDelta = left.dueDateIso.localeCompare(right.dueDateIso);
  return dateDelta !== 0 ? dateDelta : left.title.localeCompare(right.title, "pt-BR");
}

function checkedItemIds(data: AppData, competenceMonth: string): Set<string> {
  const balance = (data.monthlyBalances ?? []).find(
    (item) => item.competenceMonth === competenceMonth,
  );
  return new Set(balance?.checkedItemIds ?? []);
}

function fixedBillItems(
  data: AppData,
  competenceMonth: string,
  manualChecks: Set<string>,
): { items: PaymentChecklistItem[]; matchedTransactionIds: Set<string> } {
  const items: PaymentChecklistItem[] = [];
  const matchedTransactionIds = new Set<string>();

  for (const resolution of recurringResolutionsForMonth(data, competenceMonth)) {
    const rule = (data.recurringRules ?? []).find(
      (item) => item.id === resolution.occurrence.ruleId,
    );
    if (
      !rule ||
      rule.kind !== "expense" ||
      inferRecurrenceClassFromRule(rule) !== "fixed_bill" ||
      resolution.state === "covered_by_invoice"
    ) {
      continue;
    }

    const transaction = resolution.transactionId
      ? data.transactions.find((item) => item.id === resolution.transactionId)
      : undefined;
    if (transaction) {
      matchedTransactionIds.add(transaction.id);
    }

    const sourceChecked = transaction?.status === "settled";
    const id = `fixed:${resolution.occurrence.id}`;
    const manuallyChecked = manualChecks.has(id);
    const projected = resolution.state === "projected";
    const sourceState: PaymentChecklistItemState = sourceChecked
      ? "paid"
      : projected
        ? "projected"
        : "pending";

    items.push({
      id,
      kind: "fixed_bill",
      title: recurringRuleDisplayDescription(data, rule, transaction),
      detail: `Vencimento ${formatDateLabel(resolution.occurrence.expectedDate)}`,
      amountCents:
        resolution.state === "matched"
          ? (resolution.actualAmountCents ?? resolution.expectedAmountCents)
          : resolution.expectedAmountCents,
      dueDateIso: resolution.occurrence.expectedDate,
      sourceState,
      sourceLabel: sourceChecked ? "Paga no sistema" : projected ? "Prevista" : "Pendente",
      sourceChecked,
      manuallyChecked,
      checked: manuallyChecked,
      checkable: true,
    });
  }

  return { items, matchedTransactionIds };
}

function invoiceItem(
  data: AppData,
  invoice: Invoice,
  manualChecks: Set<string>,
): PaymentChecklistItem {
  const card = data.cards.find((item) => item.id === invoice.cardId);
  const openCents = invoiceOpenCents(invoice);
  const sourceChecked = openCents <= 0;
  const id = `invoice:${invoice.id}`;
  const manuallyChecked = manualChecks.has(id);
  const paidCents = invoicePaidCents(invoice);
  const totalCents = invoiceTotalCentsValue(invoice);
  const status = invoiceStatusLabel(invoice);
  const paymentDetail = paidCents > 0 && openCents > 0
    ? `Total ${formatCentsToBRL(totalCents)} · pago ${formatCentsToBRL(paidCents)}`
    : `Vencimento ${formatDateLabel(invoice.dueDate)}`;

  return {
    id,
    kind: "invoice",
    title: card?.name ?? "Cartão sem nome",
    detail: paymentDetail,
    amountCents: sourceChecked ? totalCents : openCents,
    dueDateIso: invoice.dueDate,
    sourceState: sourceChecked ? "paid" : "pending",
    sourceLabel: sourceChecked ? "Paga no sistema" : status,
    sourceChecked,
    manuallyChecked,
    checked: manuallyChecked,
    checkable: true,
  };
}

function invoiceItems(
  data: AppData,
  competenceMonth: string,
  manualChecks: Set<string>,
): { items: PaymentChecklistItem[]; projections: PaymentChecklistProjection[] } {
  const items = data.invoices
    .filter((invoice) => invoice.competenceMonth === competenceMonth)
    .map((invoice) => invoiceItem(data, invoice, manualChecks));

  const dashboardSummary = buildDashboardCardSummary(data, competenceMonth);
  const projections = (dashboardSummary?.lines ?? [])
    .filter((line) => line.mode === "projected")
    .map((line) => ({
      id: `projected-invoice:${line.cardId}:${competenceMonth}`,
      title: line.cardName,
      detail: line.dueDateIso
        ? `Previsão para ${line.dueDate}`
        : "Fatura ainda não fechada",
      amountCents: line.totalCents,
      dueDateIso: line.dueDateIso,
    }))
    .sort(compareByDueDateAndTitle);

  return {
    items: items.sort(compareByDueDateAndTitle),
    projections,
  };
}

function isOtherPendingExpense(
  transaction: Transaction,
  competenceMonth: string,
  matchedTransactionIds: Set<string>,
): boolean {
  return (
    transaction.kind === "expense" &&
    transaction.competenceMonth === competenceMonth &&
    transaction.status === "pending" &&
    transaction.expenseKind !== "refund" &&
    !isInvoiceLinkedExpense(transaction) &&
    !matchedTransactionIds.has(transaction.id)
  );
}

function otherItems(
  data: AppData,
  competenceMonth: string,
  matchedTransactionIds: Set<string>,
  manualChecks: Set<string>,
): PaymentChecklistItem[] {
  return data.transactions
    .filter((transaction) =>
      isOtherPendingExpense(transaction, competenceMonth, matchedTransactionIds),
    )
    .map((transaction) => {
      const id = `expense:${transaction.id}`;
      const manuallyChecked = manualChecks.has(id);
      return {
        id,
        kind: "other" as const,
        title: transactionDisplayDescription(data, transaction),
        detail: `${transaction.category} · ${formatDateLabel(transaction.date)}`,
        amountCents: ledgerExpenseCents(transaction),
        dueDateIso: transaction.date,
        sourceState: "pending" as const,
        sourceLabel: "Pendente",
        sourceChecked: false,
        manuallyChecked,
        checked: manuallyChecked,
        checkable: true,
      };
    })
    .sort(compareByDueDateAndTitle);
}

export function buildPaymentChecklist(
  data: AppData,
  competenceMonth: string,
): PaymentChecklistSummary {
  const manualChecks = checkedItemIds(data, competenceMonth);
  const fixed = fixedBillItems(data, competenceMonth, manualChecks);
  const invoices = invoiceItems(data, competenceMonth, manualChecks);
  const others = otherItems(
    data,
    competenceMonth,
    fixed.matchedTransactionIds,
    manualChecks,
  );
  const items = [...fixed.items.sort(compareByDueDateAndTitle), ...invoices.items, ...others];
  const summary = calculateCompetenceSummary(data, competenceMonth);

  const checklistTargetCents = sumCents(items.map((item) => item.amountCents));
  const checklistCheckedCents = sumCents(
    items.filter((item) => item.checked).map((item) => item.amountCents),
  );
  const sourceOutstandingCents = sumCents(
    items
      .filter((item) => !item.sourceChecked)
      .map((item) => item.amountCents),
  );
  const sourcePaidCents = sumCents([
    ...fixed.items
      .filter((item) => item.sourceChecked)
      .map((item) => item.amountCents),
    ...data.invoices
      .filter((invoice) => invoice.competenceMonth === competenceMonth)
      .map((invoice) => {
        const open = invoiceOpenCents(invoice);
        const paid = invoicePaidCents(invoice);
        return open <= 0 ? Math.max(paid, invoiceTotalCentsValue(invoice)) : paid;
      }),
  ]);
  const checkedCount = items.filter((item) => item.checked).length;
  const projectedCents = sumCents(invoices.projections.map((item) => item.amountCents));

  return {
    competenceMonth,
    items,
    projections: invoices.projections,
    totalCount: items.length,
    checkedCount,
    checklistTargetCents,
    checklistCheckedCents,
    checklistRemainingCents: checklistTargetCents - checklistCheckedCents,
    sourcePaidCents,
    sourceOutstandingCents,
    commitmentTotalCents: sourcePaidCents + sourceOutstandingCents,
    projectedCents,
    currentBalanceCents: summary.balanceRealizedCents,
    estimatedBalanceAfterCommitmentsCents:
      summary.balanceRealizedCents - sourceOutstandingCents,
    allChecked: items.length > 0 && checkedCount === items.length,
  };
}
