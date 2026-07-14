import {
  filterInvoicesByCompetence,
  filterTransactionsByCompetence,
  formatCompetenceLabel,
  invoiceOpenCents,
  invoicePaidCents,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  isInvoiceLinkedExpense,
  isProjectedInvoice,
  ledgerExpenseCents,
  transactionStatusLabel,
  transactionsForInvoice,
} from "./finance";
import {
  projectedInstallmentsForMonth,
  type ProjectedInstallment,
} from "./installments";
import { projectedInstallmentsForProjectedInvoice } from "./projected-invoices";
import type { AppData, Invoice, Transaction } from "./types";
import {
  projectedInstallmentSearchHaystack,
  transactionDisplayDescription,
} from "./transaction-aliases";

export type LedgerKindFilter = "all" | "income" | "expense" | "fee" | "refund";
export type LedgerStatusFilter = "all" | "pending" | "settled" | "in_invoice" | "projected";

export interface LancamentosFilterState {
  search: string;
  kind: LedgerKindFilter;
  status: LedgerStatusFilter;
}

export type LedgerCardGroupMode = "real" | "projected";

export interface LedgerCardGroup {
  key: string;
  cardId: string;
  cardName: string;
  competenceMonth: string;
  mode: LedgerCardGroupMode;
  invoice?: Invoice;
  projections: ProjectedInstallment[];
  dueDate: string;
  lineCount: number;
}

export function isDirectLedgerExpense(transaction: Transaction): boolean {
  if (transaction.kind !== "expense") {
    return false;
  }
  if (isInvoiceLinkedExpense(transaction)) {
    return false;
  }
  if (transaction.invoiceId) {
    return false;
  }
  return true;
}

export function buildIncomeTransactions(data: AppData, competenceMonth: string): Transaction[] {
  return filterTransactionsByCompetence(data.transactions, competenceMonth).filter(
    (item) => item.kind === "income",
  );
}

export function buildDirectExpenseTransactions(
  data: AppData,
  competenceMonth: string,
): Transaction[] {
  return filterTransactionsByCompetence(data.transactions, competenceMonth).filter(
    isDirectLedgerExpense,
  );
}

function cardNameById(data: AppData, cardId: string): string {
  return data.cards.find((item) => item.id === cardId)?.name ?? "Cartão";
}

function projectedDueDate(data: AppData, cardId: string, competenceMonth: string): string {
  const card = data.cards.find((item) => item.id === cardId);
  const dueDay = card?.dueDay ?? 20;
  const [year, month] = competenceMonth.split("-");
  const day = String(Math.min(Math.max(dueDay, 1), 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildLedgerCardGroups(data: AppData, competenceMonth: string): LedgerCardGroup[] {
  const groups: LedgerCardGroup[] = [];
  const projectedCardIds = new Set<string>();

  for (const invoice of filterInvoicesByCompetence(data.invoices, competenceMonth)) {
    if (isProjectedInvoice(invoice)) {
      const projections = projectedInstallmentsForProjectedInvoice(data, invoice);
      projectedCardIds.add(invoice.cardId);
      groups.push({
        key: `projected-invoice:${invoice.id}`,
        cardId: invoice.cardId,
        cardName: cardNameById(data, invoice.cardId),
        competenceMonth,
        mode: "projected",
        projections,
        dueDate: invoice.dueDate,
        lineCount: projections.length,
      });
      continue;
    }

    const lines = transactionsForInvoice(data.transactions, invoice.id);
    groups.push({
      key: `real:${invoice.id}`,
      cardId: invoice.cardId,
      cardName: cardNameById(data, invoice.cardId),
      competenceMonth,
      mode: "real",
      invoice,
      projections: [],
      dueDate: invoice.dueDate,
      lineCount: lines.length,
    });
  }

  const projections = projectedInstallmentsForMonth(data, competenceMonth);
  const byCard = new Map<string, ProjectedInstallment[]>();
  for (const item of projections) {
    const list = byCard.get(item.cardId) ?? [];
    list.push(item);
    byCard.set(item.cardId, list);
  }

  for (const [cardId, items] of byCard) {
    if (projectedCardIds.has(cardId)) {
      continue;
    }
    groups.push({
      key: `projected:${cardId}:${competenceMonth}`,
      cardId,
      cardName: cardNameById(data, cardId),
      competenceMonth,
      mode: "projected",
      projections: items,
      dueDate: projectedDueDate(data, cardId, competenceMonth),
      lineCount: items.length,
    });
  }

  return groups;
}

export function incomeSectionSubtotalCents(items: Transaction[]): number {
  return items
    .filter((item) => item.status === "settled")
    .reduce((total, item) => total + item.amountCents, 0);
}

export function expenseSectionSubtotalCents(items: Transaction[]): number {
  return items.reduce((total, item) => total + ledgerExpenseCents(item), 0);
}

function normalizedSearch(query: string): string {
  return query.trim().toLowerCase();
}

function matchesIncomeKindFilter(_item: Transaction, kind: LedgerKindFilter): boolean {
  return kind === "all" || kind === "income";
}

function matchesDirectExpenseKindFilter(item: Transaction, kind: LedgerKindFilter): boolean {
  if (kind === "all") {
    return true;
  }
  if (kind === "income") {
    return false;
  }
  if (kind === "expense") {
    return item.expenseKind === "expense" || item.expenseKind === undefined;
  }
  if (kind === "fee") {
    return item.expenseKind === "fee";
  }
  return item.expenseKind === "refund";
}

function matchesCardGroupKindFilter(_group: LedgerCardGroup, kind: LedgerKindFilter): boolean {
  return kind === "all" || kind === "expense" || kind === "fee";
}

function incomeStatusLabel(item: Transaction): string {
  return item.status === "settled" ? "Recebido" : "Pendente";
}

function directExpenseStatusLabel(item: Transaction): string {
  return item.status === "settled" ? "Pago" : "Pendente";
}

function matchesIncomeStatusFilter(item: Transaction, status: LedgerStatusFilter): boolean {
  if (status === "all") {
    return true;
  }
  if (status === "in_invoice" || status === "projected") {
    return false;
  }
  if (status === "pending") {
    return item.status === "pending";
  }
  return item.status === "settled";
}

function matchesDirectExpenseStatusFilter(item: Transaction, status: LedgerStatusFilter): boolean {
  if (status === "all") {
    return true;
  }
  if (status === "in_invoice" || status === "projected") {
    return false;
  }
  if (status === "pending") {
    return item.status === "pending";
  }
  return item.status === "settled";
}

function matchesCardGroupStatusFilter(group: LedgerCardGroup, status: LedgerStatusFilter): boolean {
  if (status === "all") {
    return true;
  }
  if (status === "projected") {
    return group.mode === "projected";
  }
  if (status === "in_invoice") {
    return group.mode === "real";
  }
  if (status === "pending" || status === "settled") {
    return false;
  }
  return true;
}

function transactionSearchHaystack(
  item: Transaction,
  data: AppData,
  group?: LedgerCardGroup,
): string {
  const displayDescription = transactionDisplayDescription(data, item);
  const cardName = item.cardId ? cardNameById(data, item.cardId) : "";
  const invoiceStatus =
    group?.invoice !== undefined ? invoiceStatusLabel(group.invoice) : "";
  return [
    item.description,
    displayDescription,
    item.category,
    cardName,
    invoiceStatus,
    transactionTypeSearchLabel(item),
    transactionStatusLabel(item.kind, item.status, item.ledgerStatus),
  ]
    .join(" ")
    .toLowerCase();
}

function transactionTypeSearchLabel(item: Transaction): string {
  if (item.kind === "income") {
    return "receita";
  }
  switch (item.expenseKind) {
    case "fee":
      return "tarifa";
    case "refund":
      return "estorno";
    default:
      return "despesa";
  }
}

function groupSearchHaystack(group: LedgerCardGroup, data: AppData): string {
  const status =
    group.mode === "real" && group.invoice
      ? invoiceStatusLabel(group.invoice)
      : "projetada projeção de fatura";
  const label =
    group.mode === "real"
      ? `fatura ${formatCompetenceLabel(group.competenceMonth)}`
      : "projeção de fatura";
  const lineHaystack = groupDetailLines(group, data)
    .map((item) => transactionSearchHaystack(item, data, group))
    .join(" ");
  const projectionHaystack = groupDetailProjections(group)
    .map((item) => projectedInstallmentSearchHaystack(data, item))
    .join(" ");
  return [group.cardName, label, status, lineHaystack, projectionHaystack].join(" ").toLowerCase();
}

export function groupDetailLines(group: LedgerCardGroup, data: AppData): Transaction[] {
  if (group.mode === "real" && group.invoice) {
    return transactionsForInvoice(data.transactions, group.invoice.id);
  }
  return [];
}

export function groupDetailProjections(group: LedgerCardGroup): ProjectedInstallment[] {
  return group.mode === "projected" ? group.projections : [];
}

function matchesSearchIncome(item: Transaction, query: string, data: AppData): boolean {
  if (query.length === 0) {
    return true;
  }
  return transactionSearchHaystack(item, data).includes(query);
}

function matchesSearchExpense(item: Transaction, query: string, data: AppData): boolean {
  if (query.length === 0) {
    return true;
  }
  return transactionSearchHaystack(item, data).includes(query);
}

function matchesSearchGroup(group: LedgerCardGroup, query: string, data: AppData): boolean {
  if (query.length === 0) {
    return true;
  }
  return groupSearchHaystack(group, data).includes(query);
}

export function filterIncomeTransactions(
  items: Transaction[],
  state: LancamentosFilterState,
  data: AppData,
): Transaction[] {
  const query = normalizedSearch(state.search);
  return items.filter(
    (item) =>
      matchesIncomeKindFilter(item, state.kind) &&
      matchesIncomeStatusFilter(item, state.status) &&
      matchesSearchIncome(item, query, data),
  );
}

export function filterDirectExpenseTransactions(
  items: Transaction[],
  state: LancamentosFilterState,
  data: AppData,
): Transaction[] {
  const query = normalizedSearch(state.search);
  return items.filter(
    (item) =>
      matchesDirectExpenseKindFilter(item, state.kind) &&
      matchesDirectExpenseStatusFilter(item, state.status) &&
      matchesSearchExpense(item, query, data),
  );
}

export function filterLedgerCardGroups(
  groups: LedgerCardGroup[],
  state: LancamentosFilterState,
  data: AppData,
): LedgerCardGroup[] {
  const query = normalizedSearch(state.search);
  return groups.filter(
    (group) =>
      matchesCardGroupKindFilter(group, state.kind) &&
      matchesCardGroupStatusFilter(group, state.status) &&
      matchesSearchGroup(group, query, data),
  );
}

export function ledgerGroupTotalCents(group: LedgerCardGroup): number {
  if (group.mode === "real" && group.invoice) {
    return invoiceTotalCentsValue(group.invoice);
  }
  return group.projections.reduce((total, item) => total + item.amountCents, 0);
}

export function ledgerGroupPaidCents(group: LedgerCardGroup): number {
  if (group.mode === "real" && group.invoice) {
    return invoicePaidCents(group.invoice);
  }
  return 0;
}

export function ledgerGroupOpenCents(group: LedgerCardGroup): number {
  if (group.mode === "real" && group.invoice) {
    return invoiceOpenCents(group.invoice);
  }
  return ledgerGroupTotalCents(group);
}

export function ledgerGroupStatusLabel(group: LedgerCardGroup): string {
  if (group.mode === "real" && group.invoice) {
    return invoiceStatusLabel(group.invoice);
  }
  return "Projetada";
}

export function incomeRowStatusLabel(item: Transaction): string {
  return incomeStatusLabel(item);
}

export function directExpenseRowStatusLabel(item: Transaction): string {
  return directExpenseStatusLabel(item);
}
