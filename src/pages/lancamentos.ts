
import {
  transactionDisplayedAmountCents,
  transactionStatusLabel,
} from "../finance";
import {
  lancamentoRowStatusLabel,
  LANCAMENTOS_STATUS_SORT_ORDER,
  type LancamentoRow,
} from "../installments";
import {
  buildDirectExpenseTransactions,
  buildIncomeTransactions,
  buildLedgerCardGroups,
  directExpenseRowStatusLabel,
  expenseSectionSubtotalCents,
  filterDirectExpenseTransactions,
  filterIncomeTransactions,
  filterLedgerCardGroups,
  groupDetailLines,
  groupDetailProjections,
  incomeRowStatusLabel,
  incomeSectionSubtotalCents,
  ledgerGroupOpenCents,
  ledgerGroupPaidCents,
  ledgerGroupStatusLabel,
  ledgerGroupTotalCents,
  type LancamentosFilterState,
  type LedgerCardGroup,
} from "../lancamentos-sections";
import type { AppData, Transaction } from "../types";
import { transactionHasValidRecurringMatch } from "../recurrence-auto-match";
import { recurrenceClassForTransaction } from "../recurrence-class";
import {
  deleteTransaction,
  openTransactionChoiceModal,
  openTransactionForm,
  toggleTransactionStatus,
  type AppMutations,
} from "../forms";
import {
  INVOICE_DETAIL_SORT_COLUMNS,
  invoiceDetailSortAccessors,
  type InvoiceDetailSortColumn,
} from "./faturas";
import { installmentSortValue } from "../installment-label";
import {
  renderEmptyState,
  renderFilterChip,
  renderIncomeTransactionTableRow,
  renderInvoiceTransactionRow,
  renderLancamentosTableHead,
  renderLedgerCardBlock,
  renderLedgerProjectedDetailRow,
  renderSectionHeader,
  renderTransactionTableRow,
  transactionTypeLabel,
} from "../presentation";
import {
  sortTableItems,
  toggleTableSort,
  type SortColumnAccessor,
  type TableSortState,
} from "../table-sort";
import { bindTableSortControls, renderMobileSortControl, TABLE_IDS, type SortableColumnOption } from "../table-ui";
import { announce, createRowMenu, el, escapeHtml, openConfirmModal } from "../ui";
import {
  projectedInstallmentDisplayDescription,
  projectedInstallmentSearchHaystack,
  transactionDescriptionTextAccessor,
  transactionDisplayDescription,
} from "../transaction-aliases";
import { openTransactionDisplayAliasModal } from "../transaction-alias-modal";

type KindFilter = LancamentosFilterState["kind"];
type StatusFilter = LancamentosFilterState["status"];

export type LancamentosSortColumn =
  | "date"
  | "description"
  | "category"
  | "type"
  | "status"
  | "amount";

export type IncomeSortColumn = "date" | "description" | "category" | "status" | "amount";

export type CardGroupSortColumn = "dueDate" | "card" | "total" | "open";

const SEARCH_DEBOUNCE_MS = 175;
const INCOME_MOBILE_SORT_ID = "lancamentos-income-mobile-sort";
const EXPENSE_MOBILE_SORT_ID = "lancamentos-expense-mobile-sort";
const CARD_DETAIL_MOBILE_SORT_ID = "lancamentos-card-detail-mobile-sort";

function ledgerDetailPanelId(groupKey: string): string {
  return `ledger-detail-${groupKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function ledgerDetailMobileSortId(groupKey: string): string {
  return `${CARD_DETAIL_MOBILE_SORT_ID}-${groupKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export const INCOME_SORT_COLUMNS: SortableColumnOption<IncomeSortColumn>[] = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "category", label: "Categoria" },
  { id: "status", label: "Status" },
  { id: "amount", label: "Valor" },
];

export const LANCAMENTOS_SORT_COLUMNS: SortableColumnOption<LancamentosSortColumn>[] = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "category", label: "Categoria" },
  { id: "type", label: "Tipo" },
  { id: "status", label: "Status" },
  { id: "amount", label: "Valor" },
];

export function getIncomeSortAccessors(
  data: AppData,
): Record<IncomeSortColumn, SortColumnAccessor<Transaction>> {
  return {
    ...incomeSortAccessors,
    description: transactionDescriptionTextAccessor(data),
  };
}

export function getExpenseSortAccessors(
  data: AppData,
): Record<LancamentosSortColumn, SortColumnAccessor<Transaction>> {
  return {
    ...expenseSortAccessors,
    description: transactionDescriptionTextAccessor(data),
  };
}

export function getInvoiceDetailSortAccessors(
  data: AppData,
): Record<InvoiceDetailSortColumn, SortColumnAccessor<Transaction>> {
  return {
    ...invoiceDetailSortAccessors,
    description: transactionDescriptionTextAccessor(data),
  };
}

export const incomeSortAccessors: Record<IncomeSortColumn, SortColumnAccessor<Transaction>> = {
  date: { kind: "date", getValue: (item) => item.date },
  description: { kind: "text", getValue: (item) => item.description },
  category: { kind: "text", getValue: (item) => item.category },
  status: {
    kind: "status",
    getValue: (item) => incomeRowStatusLabel(item),
    statusOrder: ["Recebido", "Pendente"],
  },
  amount: { kind: "number", getValue: (item) => transactionDisplayedAmountCents(item) },
};

export function getLancamentosRowSortAccessors(
  data: AppData,
): Record<LancamentosSortColumn, SortColumnAccessor<LancamentoRow>> {
  return {
    ...lancamentosRowSortAccessors,
    description: {
      kind: "text",
      getValue: (row) =>
        row.rowKind === "projected"
          ? projectedInstallmentDisplayDescription(data, row.data)
          : transactionDisplayDescription(data, row.data),
    },
  };
}

export const lancamentosRowSortAccessors: Record<
  LancamentosSortColumn,
  SortColumnAccessor<LancamentoRow>
> = {
  date: {
    kind: "date",
    getValue: (row) =>
      row.rowKind === "projected" ? `${row.data.competenceMonth}-01` : row.data.date,
  },
  description: { kind: "text", getValue: (row) => row.data.description },
  category: { kind: "text", getValue: (row) => row.data.category },
  type: {
    kind: "text",
    getValue: (row) =>
      row.rowKind === "projected" ? "Despesa" : transactionTypeLabel(row.data),
  },
  status: {
    kind: "status",
    getValue: (row) => lancamentoRowStatusLabel(row),
    statusOrder: LANCAMENTOS_STATUS_SORT_ORDER,
  },
  amount: {
    kind: "number",
    getValue: (row) =>
      row.rowKind === "projected"
        ? -row.data.amountCents
        : transactionDisplayedAmountCents(row.data),
  },
};

export const expenseSortAccessors: Record<LancamentosSortColumn, SortColumnAccessor<Transaction>> = {
  date: { kind: "date", getValue: (item) => item.date },
  description: { kind: "text", getValue: (item) => item.description },
  category: { kind: "text", getValue: (item) => item.category },
  type: { kind: "text", getValue: (item) => transactionTypeLabel(item) },
  status: {
    kind: "status",
    getValue: (item) => directExpenseRowStatusLabel(item),
    statusOrder: ["Pago", "Pendente"],
  },
  amount: { kind: "number", getValue: (item) => transactionDisplayedAmountCents(item) },
};

export const cardGroupSortAccessors: Record<CardGroupSortColumn, SortColumnAccessor<LedgerCardGroup>> = {
  dueDate: { kind: "date", getValue: (item) => item.dueDate },
  card: { kind: "text", getValue: (item) => item.cardName },
  total: { kind: "number", getValue: (item) => ledgerGroupTotalCents(item) },
  open: { kind: "number", getValue: (item) => ledgerGroupOpenCents(item) },
};

/** @deprecated Use lancamentosRowSortAccessors in new code paths. */
export const lancamentosSortAccessors: Record<
  LancamentosSortColumn,
  SortColumnAccessor<Transaction>
> = {
  date: { kind: "date", getValue: (item) => item.date },
  description: { kind: "text", getValue: (item) => item.description },
  category: { kind: "text", getValue: (item) => item.category },
  type: { kind: "text", getValue: (item) => transactionTypeLabel(item) },
  status: {
    kind: "status",
    getValue: (item) => transactionStatusLabel(item.kind, item.status, item.ledgerStatus),
    statusOrder: LANCAMENTOS_STATUS_SORT_ORDER,
  },
  amount: { kind: "number", getValue: (item) => transactionDisplayedAmountCents(item) },
};

const filters: LancamentosFilterState = {
  search: "",
  kind: "all",
  status: "all",
};

let incomeSort: TableSortState<IncomeSortColumn> = { column: "date", direction: "desc" };
let expenseSort: TableSortState<LancamentosSortColumn> = { column: "date", direction: "desc" };
let cardGroupSort: TableSortState<CardGroupSortColumn> = { column: "dueDate", direction: "asc" };
let cardDetailSort: TableSortState<InvoiceDetailSortColumn> = { column: "date", direction: "desc" };

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let expandedLedgerKey: string | null = null;
let lastCompetenceMonth: string | null = null;

export function getLancamentosTableSort(): TableSortState<LancamentosSortColumn> {
  return expenseSort;
}

export function getIncomeTableSort(): TableSortState<IncomeSortColumn> {
  return incomeSort;
}

export function getCardGroupSort(): TableSortState<CardGroupSortColumn> {
  return cardGroupSort;
}

export function getCardDetailSort(): TableSortState<InvoiceDetailSortColumn> {
  return cardDetailSort;
}

export function getExpandedLedgerKey(): string | null {
  return expandedLedgerKey;
}

export function resetLancamentosUiStateForTests(): void {
  filters.search = "";
  filters.kind = "all";
  filters.status = "all";
  incomeSort = { column: "date", direction: "desc" };
  expenseSort = { column: "date", direction: "desc" };
  cardGroupSort = { column: "dueDate", direction: "asc" };
  cardDetailSort = { column: "date", direction: "desc" };
  expandedLedgerKey = null;
  lastCompetenceMonth = null;
}

function filtersActive(): boolean {
  return filters.search.trim().length > 0 || filters.kind !== "all" || filters.status !== "all";
}

function renderToolbarControlsMarkup(): string {
  return `
      <label class="field field--inline field--search">
        <span class="field__label">Buscar</span>
        <input class="field__control" type="search" id="tx-search" placeholder="Descrição, categoria ou cartão" value="${escapeHtml(filters.search)}" autocomplete="off" />
      </label>
      <div class="toolbar-panel__filters">
        <label class="field field--inline">
          <span class="field__label">Tipo</span>
          <select class="field__control" id="tx-kind-filter">
            <option value="all" ${filters.kind === "all" ? "selected" : ""}>Todos</option>
            <option value="income" ${filters.kind === "income" ? "selected" : ""}>Receita</option>
            <option value="expense" ${filters.kind === "expense" ? "selected" : ""}>Despesa</option>
            <option value="fee" ${filters.kind === "fee" ? "selected" : ""}>Tarifa</option>
            <option value="refund" ${filters.kind === "refund" ? "selected" : ""}>Estorno</option>
          </select>
        </label>
        <label class="field field--inline">
          <span class="field__label">Status</span>
          <select class="field__control" id="tx-status-filter">
            <option value="all" ${filters.status === "all" ? "selected" : ""}>Todos</option>
            <option value="pending" ${filters.status === "pending" ? "selected" : ""}>Pendentes</option>
            <option value="settled" ${filters.status === "settled" ? "selected" : ""}>Quitados</option>
            <option value="in_invoice" ${filters.status === "in_invoice" ? "selected" : ""}>Na fatura</option>
            <option value="projected" ${filters.status === "projected" ? "selected" : ""}>Projetado</option>
          </select>
        </label>
      </div>
      <div class="toolbar-panel__actions">
        <button type="button" class="btn btn--primary" id="tx-new-transaction">Novo lançamento</button>
      </div>
  `;
}

function renderFilterChipsMarkup(): string {
  if (!filtersActive()) {
    return "";
  }
  const chips = [
    filters.search ? renderFilterChip(`Busca: ${filters.search}`, "search") : "",
    filters.kind !== "all" ? renderFilterChip(kindFilterLabel(filters.kind), "kind") : "",
    filters.status !== "all" ? renderFilterChip(statusFilterLabel(filters.status), "status") : "",
  ]
    .filter(Boolean)
    .join("");
  return chips.length > 0 ? `<div class="filter-chips">${chips}</div>` : "";
}

function kindFilterLabel(kind: Exclude<KindFilter, "all">): string {
  switch (kind) {
    case "income":
      return "Receita";
    case "fee":
      return "Tarifa";
    case "refund":
      return "Estorno";
    case "expense":
    default:
      return "Despesa";
  }
}

function statusFilterLabel(status: Exclude<StatusFilter, "all">): string {
  switch (status) {
    case "in_invoice":
      return "Na fatura";
    case "projected":
      return "Projetado";
    case "settled":
      return "Quitados";
    case "pending":
    default:
      return "Pendentes";
  }
}

function renderSectionTable<C extends string>(
  columns: SortableColumnOption<C>[],
  sortState: TableSortState<C>,
  tableId: string,
  mobileSortId: string,
  bodyHtml: string,
): string {
  return `
    ${renderMobileSortControl(columns, sortState, mobileSortId)}
    <table class="cfm-table cfm-table--lancamentos" aria-label="Lançamentos" data-sort-table="${mobileSortId}">
      ${renderLancamentosTableHead(columns, sortState, tableId)}
      <tbody>${bodyHtml}</tbody>
    </table>`;
}

function buildProjectedDetailSortAccessors(): Record<
  InvoiceDetailSortColumn,
  SortColumnAccessor<import("../installments").ProjectedInstallment>
> {
  return {
    date: { kind: "date", getValue: (item) => `${item.competenceMonth}-01` },
    description: { kind: "text", getValue: (item) => item.description },
    installment: {
      kind: "installment",
      getValue: (item) => installmentSortValue({
        id: item.id,
        kind: "expense",
        description: item.description,
        amountCents: item.amountCents,
        date: `${item.competenceMonth}-01`,
        competenceMonth: item.competenceMonth,
        category: item.category,
        status: "pending",
        installment: item.installment,
        createdAt: "",
        updatedAt: "",
      }),
    },
    category: { kind: "text", getValue: (item) => item.category },
    type: { kind: "text", getValue: () => "Despesa" },
    amount: { kind: "number", getValue: (item) => -item.amountCents },
  };
}

const projectedDetailSortAccessors = buildProjectedDetailSortAccessors();

function renderCardDetailPanelFixed(group: LedgerCardGroup, data: AppData): string {
  const detailAccessors = getInvoiceDetailSortAccessors(data);
  if (group.mode === "real") {
    const lines = sortTableItems(
      groupDetailLines(group, data),
      cardDetailSort,
      detailAccessors,
    );
    return renderSectionTable(
      INVOICE_DETAIL_SORT_COLUMNS,
      cardDetailSort,
      TABLE_IDS.lancamentosCardsDetail,
      `${ledgerDetailMobileSortId(group.key)}`,
      lines
        .map((item) => renderInvoiceTransactionRow(data, item, TABLE_IDS.lancamentosCardsDetail))
        .join(""),
    );
  }

  const projections = sortTableItems(
    groupDetailProjections(group),
    cardDetailSort,
    projectedDetailSortAccessors,
  );
  return renderSectionTable(
    INVOICE_DETAIL_SORT_COLUMNS,
    cardDetailSort,
    TABLE_IDS.lancamentosCardsDetail,
    `${ledgerDetailMobileSortId(group.key)}`,
    projections
      .map((item) => renderLedgerProjectedDetailRow(data, item, TABLE_IDS.lancamentosCardsDetail))
      .join(""),
  );
}

function sectionVisibility(poolCount: number, filteredCount: number): "show" | "hide" | "empty" {
  if (filteredCount > 0) {
    return "show";
  }
  if (filtersActive() && poolCount > 0) {
    return "hide";
  }
  if (poolCount === 0) {
    return "empty";
  }
  return "hide";
}

export function renderLancamentos(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  host.innerHTML = "";

  const toolbar = el("section", "toolbar-panel");
  const toolbarRow = el("div", "toolbar-panel__row");
  toolbarRow.innerHTML = renderToolbarControlsMarkup();
  toolbar.appendChild(toolbarRow);

  const chipsSlot = el("div", "filter-chips-slot");
  toolbar.appendChild(chipsSlot);
  host.appendChild(toolbar);

  const sectionsHost = el("div", "lancamentos-sections");
  host.appendChild(sectionsHost);

  bindToolbar(host, data, mutations, rerender);
  refreshLancamentosSections(host, data, mutations, rerender);
}

function refreshLancamentosSections(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  if (lastCompetenceMonth !== month) {
    expandedLedgerKey = null;
    lastCompetenceMonth = month;
  }

  const incomePool = buildIncomeTransactions(data, month);
  const expensePool = buildDirectExpenseTransactions(data, month);
  const cardPool = buildLedgerCardGroups(data, month);

  const filteredIncomes = sortTableItems(
    filterIncomeTransactions(incomePool, filters, data),
    incomeSort,
    getIncomeSortAccessors(data),
  );
  const filteredExpenses = sortTableItems(
    filterDirectExpenseTransactions(expensePool, filters, data),
    expenseSort,
    getExpenseSortAccessors(data),
  );
  const filteredCards = sortTableItems(
    filterLedgerCardGroups(cardPool, filters, data),
    cardGroupSort,
    cardGroupSortAccessors,
  );

  const chipsSlot = host.querySelector<HTMLElement>(".filter-chips-slot");
  if (chipsSlot) {
    chipsSlot.innerHTML = renderFilterChipsMarkup();
    bindFilterChips(host, rerender);
  }

  const sectionsHost = host.querySelector<HTMLElement>(".lancamentos-sections");
  if (!sectionsHost) {
    return;
  }

  const incomeVisibility = sectionVisibility(incomePool.length, filteredIncomes.length);
  const expenseVisibility = sectionVisibility(expensePool.length, filteredExpenses.length);
  const cardsVisibility = sectionVisibility(cardPool.length, filteredCards.length);

  const sections: string[] = [];

  if (incomeVisibility === "show") {
    sections.push(`
      <section class="lancamentos-section lancamentos-section--income">
        ${renderSectionHeader("Receitas", {
          count: filteredIncomes.length,
          totalCents: incomeSectionSubtotalCents(filteredIncomes),
          kind: "income",
          countLabel: (count) => `${count} receita${count === 1 ? "" : "s"}`,
        })}
        <div class="data-table-panel" data-section-table="income">
          ${renderSectionTable(
            INCOME_SORT_COLUMNS,
            incomeSort,
            TABLE_IDS.lancamentosIncome,
            INCOME_MOBILE_SORT_ID,
            filteredIncomes.map((item) =>
              renderIncomeTransactionTableRow(data, item, TABLE_IDS.lancamentosIncome, {
                showRecurringIcon: transactionHasValidRecurringMatch(data, item.id),
                recurringClass: recurrenceClassForTransaction(data, item.id),
              }),
            ).join(""),
          )}
        </div>
      </section>`);
  } else if (incomeVisibility === "empty") {
    sections.push(`
      <section class="lancamentos-section lancamentos-section--income">
        ${renderSectionHeader("Receitas")}
        <p class="lancamentos-section__empty">Nenhuma receita nesta competência.</p>
      </section>`);
  }

  if (expenseVisibility === "show") {
    sections.push(`
      <section class="lancamentos-section lancamentos-section--expense">
        ${renderSectionHeader("Despesas", {
          count: filteredExpenses.length,
          totalCents: expenseSectionSubtotalCents(filteredExpenses),
          kind: "expense",
          countLabel: (count) => `${count} despesa${count === 1 ? "" : "s"}`,
        })}
        <div class="data-table-panel" data-section-table="expense">
          ${renderSectionTable(
            LANCAMENTOS_SORT_COLUMNS,
            expenseSort,
            TABLE_IDS.lancamentosExpense,
            EXPENSE_MOBILE_SORT_ID,
            filteredExpenses
              .map((item) =>
                renderTransactionTableRow(data, item, TABLE_IDS.lancamentosExpense, {
                  showRecurringIcon: transactionHasValidRecurringMatch(data, item.id),
                  recurringClass: recurrenceClassForTransaction(data, item.id),
                }),
              )
              .join(""),
          )}
        </div>
      </section>`);
  } else if (expenseVisibility === "empty") {
    sections.push(`
      <section class="lancamentos-section lancamentos-section--expense">
        ${renderSectionHeader("Despesas")}
        <p class="lancamentos-section__empty">Nenhuma despesa direta nesta competência.</p>
      </section>`);
  }

  if (cardsVisibility === "show") {
    sections.push(`
      <section class="lancamentos-section lancamentos-section--cards">
        ${renderSectionHeader("Faturas e cartões", {
          count: filteredCards.length,
          countLabel: (count) => `${count} bloco${count === 1 ? "" : "s"}`,
        })}
        <div class="ledger-card-groups">
          ${filteredCards
            .map((group) => {
              const detailPanelId = ledgerDetailPanelId(group.key);
              const expanded = expandedLedgerKey === group.key;
              return `${renderLedgerCardBlock({
                groupKey: group.key,
                cardName: group.cardName,
                competenceMonth: group.competenceMonth,
                mode: group.mode,
                statusLabel: ledgerGroupStatusLabel(group),
                totalCents: ledgerGroupTotalCents(group),
                paidCents: ledgerGroupPaidCents(group),
                openCents: ledgerGroupOpenCents(group),
                lineCount: group.lineCount,
                expanded,
                detailPanelId,
              })}`;
            })
            .join("")}
        </div>
      </section>`);
  } else if (cardsVisibility === "empty") {
    sections.push(`
      <section class="lancamentos-section lancamentos-section--cards">
        ${renderSectionHeader("Faturas e cartões")}
        <p class="lancamentos-section__empty">Nenhuma fatura ou projeção nesta competência.</p>
      </section>`);
  }

  if (
    incomeVisibility !== "show" &&
    expenseVisibility !== "show" &&
    cardsVisibility !== "show" &&
    filtersActive()
  ) {
    sectionsHost.innerHTML = renderEmptyState({
      title: "Nenhum resultado para os filtros",
      description: "Ajuste a busca ou remova filtros para ampliar os resultados.",
    });
  } else {
    sectionsHost.innerHTML = sections.join("");
  }

  for (const group of filteredCards) {
    if (expandedLedgerKey !== group.key) {
      continue;
    }
    const detailPanelId = ledgerDetailPanelId(group.key);
    const detailHost = sectionsHost.querySelector<HTMLElement>(`#${detailPanelId}`);
    if (detailHost) {
      detailHost.innerHTML = renderCardDetailPanelFixed(group, data);
      detailHost.hidden = false;
      detailHost.classList.remove("ledger-card-block__detail--hidden");
      bindTableSortControls<InvoiceDetailSortColumn>(detailHost, {
        mobileControlId: ledgerDetailMobileSortId(group.key),
        onColumnActivate: (column) => {
          cardDetailSort = toggleTableSort(cardDetailSort, column, "asc");
          refreshLancamentosSections(host, data, mutations, rerender);
        },
        onMobileSort: (column, direction) => {
          cardDetailSort = { column, direction };
          refreshLancamentosSections(host, data, mutations, rerender);
        },
      });
    }
  }

  bindIncomeSort(host, data, mutations, rerender);
  bindExpenseSort(host, data, mutations, rerender);
  bindLedgerToggles(host, data, mutations, rerender);
  bindRowActions(host, filteredIncomes, filteredExpenses, data, mutations, rerender);

  const totalVisible = filteredIncomes.length + filteredExpenses.length + filteredCards.length;
  const totalPool = incomePool.length + expensePool.length + cardPool.length;
  if (filtersActive()) {
    announce(`${totalVisible} de ${totalPool} resultados exibidos.`);
  }
}

function bindIncomeSort(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const panel = host.querySelector<HTMLElement>('[data-section-table="income"]');
  if (!panel) {
    return;
  }
  bindTableSortControls<IncomeSortColumn>(panel, {
    mobileControlId: INCOME_MOBILE_SORT_ID,
    onColumnActivate: (column) => {
      incomeSort = toggleTableSort(incomeSort, column, "asc");
      refreshLancamentosSections(host, data, mutations, rerender);
    },
    onMobileSort: (column, direction) => {
      incomeSort = { column, direction };
      refreshLancamentosSections(host, data, mutations, rerender);
    },
  });
}

function bindExpenseSort(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const panel = host.querySelector<HTMLElement>('[data-section-table="expense"]');
  if (!panel) {
    return;
  }
  bindTableSortControls<LancamentosSortColumn>(panel, {
    mobileControlId: EXPENSE_MOBILE_SORT_ID,
    onColumnActivate: (column) => {
      expenseSort = toggleTableSort(expenseSort, column, "asc");
      refreshLancamentosSections(host, data, mutations, rerender);
    },
    onMobileSort: (column, direction) => {
      expenseSort = { column, direction };
      refreshLancamentosSections(host, data, mutations, rerender);
    },
  });
}

function bindLedgerToggles(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  host.querySelectorAll<HTMLButtonElement>("[data-ledger-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.ledgerToggle;
      if (!key) {
        return;
      }
      expandedLedgerKey = expandedLedgerKey === key ? null : key;
      refreshLancamentosSections(host, data, mutations, rerender);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      button.click();
    });
  });
}

function bindToolbar(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const refresh = (): void => {
    refreshLancamentosSections(host, data, mutations, rerender);
  };

  host.querySelector<HTMLInputElement>("#tx-search")?.addEventListener("input", (event) => {
    filters.search = (event.target as HTMLInputElement).value;
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      refresh();
    }, SEARCH_DEBOUNCE_MS);
  });

  host.querySelector<HTMLSelectElement>("#tx-kind-filter")?.addEventListener("change", (event) => {
    filters.kind = (event.target as HTMLSelectElement).value as KindFilter;
    rerender();
  });
  host.querySelector<HTMLSelectElement>("#tx-status-filter")?.addEventListener("change", (event) => {
    filters.status = (event.target as HTMLSelectElement).value as StatusFilter;
    rerender();
  });

  host.querySelector<HTMLButtonElement>("#tx-new-transaction")?.addEventListener("click", () => {
    openTransactionChoiceModal({
      mutations,
      competenceMonth: data.selectedCompetenceMonth,
      onSaved: rerender,
    });
  });
  bindFilterChips(host, rerender);
}

function bindFilterChips(host: HTMLElement, rerender: () => void): void {
  host.querySelectorAll<HTMLButtonElement>("[data-filter-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.filterChip;
      if (key === "search") {
        filters.search = "";
        const searchInput = host.querySelector<HTMLInputElement>("#tx-search");
        if (searchInput) {
          searchInput.value = "";
        }
      }
      if (key === "kind") {
        filters.kind = "all";
      }
      if (key === "status") {
        filters.status = "all";
      }
      rerender();
    });
  });
}

function bindRowActions(
  host: HTMLElement,
  incomes: Transaction[],
  expenses: Transaction[],
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  for (const item of [...incomes, ...expenses]) {
    const slot = host.querySelector<HTMLElement>(`[data-row-actions="${item.id}"]`);
    if (!slot) {
      continue;
    }
    slot.replaceChildren();
    const toggleLabel =
      item.kind === "income"
        ? item.status === "settled"
          ? "Marcar como pendente"
          : "Marcar como recebida"
        : item.status === "settled"
          ? "Marcar como pendente"
          : "Marcar como paga";

    slot.appendChild(
      createRowMenu([
        {
          label: "Editar",
          onClick: () => {
            openTransactionForm({
              mutations,
              competenceMonth: data.selectedCompetenceMonth,
              kind: item.kind,
              transaction: item,
              onSaved: rerender,
            });
          },
        },
        {
          label: "Renomear exibição",
          onClick: () => {
            openTransactionDisplayAliasModal({
              data,
              transaction: item,
              mutations,
              onSaved: rerender,
            });
          },
        },
        {
          label: toggleLabel,
          onClick: () => {
            toggleTransactionStatus(mutations, item, rerender);
          },
        },
        {
          label: "Excluir",
          variant: "danger",
          onClick: () => {
            openConfirmModal({
              title: "Excluir lançamento",
              message: `Excluir "${item.description}"? Esta ação não pode ser desfeita.`,
              confirmLabel: "Excluir",
              danger: true,
              onConfirm: () => {
                deleteTransaction(mutations, item.id, rerender);
              },
            });
          },
        },
      ]),
    );
  }
}

/** @deprecated Legacy unified list filter for tests. */
export function applyFilters(items: Transaction[], state: LancamentosFilterState, data?: AppData): Transaction[] {
  let result = [...items];
  const query = state.search.trim().toLowerCase();
  if (query.length > 0) {
    result = result.filter((item) => {
      const display = data ? transactionDisplayDescription(data, item) : item.description;
      return (
        item.description.toLowerCase().includes(query) ||
        display.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    });
  }
  if (state.kind !== "all") {
    result = result.filter((item) => {
      if (state.kind === "income") {
        return item.kind === "income";
      }
      if (item.kind !== "expense") {
        return false;
      }
      if (state.kind === "expense") {
        return item.expenseKind === "expense" || item.expenseKind === undefined;
      }
      if (state.kind === "fee") {
        return item.expenseKind === "fee";
      }
      return item.expenseKind === "refund";
    });
  }
  if (state.status !== "all" && state.status !== "projected" && state.status !== "in_invoice") {
    result = result.filter((item) => item.status === state.status);
  }
  if (state.status === "projected" || state.status === "in_invoice") {
    return [];
  }
  return result;
}

/** @deprecated Legacy unified list filter for tests. */
export function applyLancamentoFilters(
  rows: LancamentoRow[],
  state: LancamentosFilterState,
  data?: AppData,
): LancamentoRow[] {
  let result = [...rows];
  const query = state.search.trim().toLowerCase();
  if (query.length > 0) {
    result = result.filter((row) => {
      if (row.rowKind === "projected" && data) {
        return projectedInstallmentSearchHaystack(data, row.data).includes(query);
      }
      return (
        row.data.description.toLowerCase().includes(query) ||
        row.data.category.toLowerCase().includes(query)
      );
    });
  }
  if (state.kind !== "all") {
    result = result.filter((row) => {
      if (row.rowKind === "projected") {
        return state.kind === "all" || state.kind === "expense";
      }
      if (state.kind === "income") {
        return row.data.kind === "income";
      }
      if (row.data.kind !== "expense") {
        return false;
      }
      if (state.kind === "expense") {
        return row.data.expenseKind === "expense" || row.data.expenseKind === undefined;
      }
      if (state.kind === "fee") {
        return row.data.expenseKind === "fee";
      }
      return row.data.expenseKind === "refund";
    });
  }
  if (state.status === "projected") {
    result = result.filter((row) => row.rowKind === "projected");
  } else if (state.status !== "all" && state.status !== "in_invoice") {
    result = result.filter(
      (row) => row.rowKind === "transaction" && row.data.status === state.status,
    );
  } else if (state.status === "in_invoice") {
    result = result.filter(
      (row) => row.rowKind === "transaction" && row.data.ledgerStatus === "in_invoice",
    );
  }
  return result;
}

export { filters, SEARCH_DEBOUNCE_MS, expenseSort as tableSort };
