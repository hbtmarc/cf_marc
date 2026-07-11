import {
  filterTransactionsByCompetence,
  transactionDisplayedAmountCents,
  transactionStatusLabel,
} from "../finance";
import {
  isProjectedInstallmentRow,
  lancamentoRowStatusLabel,
  LANCAMENTOS_STATUS_SORT_ORDER,
  projectedInstallmentsForMonth,
  type LancamentoRow,
} from "../installments";
import type { AppData, Transaction } from "../types";
import type { AppMutations } from "../forms";
import {
  deleteTransaction,
  openTransactionChoiceModal,
  openTransactionForm,
  toggleTransactionStatus,
} from "../forms";
import {
  renderEmptyState,
  renderFilterChip,
  renderLancamentosTableHead,
  renderProjectedInstallmentRow,
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
import { bindTableSortControls, renderMobileSortControl, type SortableColumnOption } from "../table-ui";
import { announce, createRowMenu, el, escapeHtml, openConfirmModal } from "../ui";

type KindFilter = "all" | "income" | "expense" | "fee" | "refund";
type StatusFilter = "all" | "pending" | "settled" | "projected";

export type LancamentosSortColumn =
  | "date"
  | "description"
  | "category"
  | "type"
  | "status"
  | "amount";

interface LancamentosFilters {
  search: string;
  kind: KindFilter;
  status: StatusFilter;
}

const SEARCH_DEBOUNCE_MS = 175;
const LANCAMENTOS_MOBILE_SORT_ID = "lancamentos-mobile-sort";

export const LANCAMENTOS_SORT_COLUMNS: SortableColumnOption<LancamentosSortColumn>[] = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "category", label: "Categoria" },
  { id: "type", label: "Tipo" },
  { id: "status", label: "Status" },
  { id: "amount", label: "Valor" },
];

export const lancamentosRowSortAccessors: Record<
  LancamentosSortColumn,
  SortColumnAccessor<LancamentoRow>
> = {
  date: {
    kind: "date",
    getValue: (row) =>
      row.rowKind === "projected" ? `${row.data.competenceMonth}-01` : row.data.date,
  },
  description: {
    kind: "text",
    getValue: (row) => row.data.description,
  },
  category: {
    kind: "text",
    getValue: (row) => row.data.category,
  },
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
  amount: {
    kind: "number",
    getValue: (item) => transactionDisplayedAmountCents(item),
  },
};

let filters: LancamentosFilters = {
  search: "",
  kind: "all",
  status: "all",
};

let tableSort: TableSortState<LancamentosSortColumn> = {
  column: "date",
  direction: "desc",
};

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function getLancamentosTableSort(): TableSortState<LancamentosSortColumn> {
  return tableSort;
}

function buildLancamentoRows(data: AppData, competenceMonth: string): LancamentoRow[] {
  const transactions = filterTransactionsByCompetence(data.transactions, competenceMonth);
  const projections = projectedInstallmentsForMonth(data, competenceMonth);
  return [
    ...transactions.map((item) => ({ rowKind: "transaction" as const, data: item })),
    ...projections.map((item) => ({ rowKind: "projected" as const, data: item })),
  ];
}

function lancamentosSectionTotal(rows: LancamentoRow[]): number {
  return rows.reduce((total, row) => {
    if (row.rowKind === "projected") {
      return total + row.data.amountCents;
    }
    return total + row.data.amountCents;
  }, 0);
}

function renderLancamentoRow(row: LancamentoRow): string {
  return row.rowKind === "projected"
    ? renderProjectedInstallmentRow(row.data)
    : renderTransactionTableRow(row.data);
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

  const listPanel = el("section", "list-panel");
  const listHeader = el("div", "list-header-panel");
  listHeader.setAttribute("aria-live", "polite");
  listPanel.appendChild(listHeader);

  const tableSection = el("div", "data-table-panel");
  listPanel.appendChild(tableSection);
  host.appendChild(listPanel);

  bindToolbar(host, data, mutations, rerender);
  refreshLancamentosList(host, data, mutations, rerender);
}

function renderToolbarControlsMarkup(): string {
  return `
      <label class="field field--inline field--search">
        <span class="field__label">Buscar</span>
        <input class="field__control" type="search" id="tx-search" placeholder="Descrição ou categoria" value="${escapeHtml(filters.search)}" autocomplete="off" />
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
  if (!filters.search && filters.kind === "all" && filters.status === "all") {
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
    case "projected":
      return "Projetado";
    case "settled":
      return "Quitados";
    case "pending":
    default:
      return "Pendentes";
  }
}

function matchesKindFilter(row: LancamentoRow, kind: KindFilter): boolean {
  if (row.rowKind === "projected") {
    return kind === "all" || kind === "expense";
  }
  switch (kind) {
    case "income":
      return row.data.kind === "income";
    case "expense":
      return (
        row.data.kind === "expense" &&
        (row.data.expenseKind === "expense" || row.data.expenseKind === undefined)
      );
    case "fee":
      return row.data.kind === "expense" && row.data.expenseKind === "fee";
    case "refund":
      return row.data.kind === "expense" && row.data.expenseKind === "refund";
    case "all":
    default:
      return true;
  }
}

export function applyFilters(items: Transaction[], state: LancamentosFilters): Transaction[] {
  let result = [...items];
  const query = state.search.trim().toLowerCase();
  if (query.length > 0) {
    result = result.filter(
      (item) =>
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  }
  if (state.kind !== "all") {
    result = result.filter((item) => matchesKindFilter({ rowKind: "transaction", data: item }, state.kind));
  }
  if (state.status !== "all" && state.status !== "projected") {
    result = result.filter((item) => item.status === state.status);
  }
  if (state.status === "projected") {
    return [];
  }
  return result;
}

export function applyLancamentoFilters(
  rows: LancamentoRow[],
  state: LancamentosFilters,
): LancamentoRow[] {
  let result = [...rows];
  const query = state.search.trim().toLowerCase();
  if (query.length > 0) {
    result = result.filter(
      (row) =>
        row.data.description.toLowerCase().includes(query) ||
        row.data.category.toLowerCase().includes(query),
    );
  }
  if (state.kind !== "all") {
    result = result.filter((row) => matchesKindFilter(row, state.kind));
  }
  if (state.status === "projected") {
    result = result.filter((row) => row.rowKind === "projected");
  } else if (state.status !== "all") {
    result = result.filter(
      (row) => row.rowKind === "transaction" && row.data.status === state.status,
    );
  }
  return result;
}

function refreshLancamentosList(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const allRows = buildLancamentoRows(data, month);
  const filtered = sortTableItems(
    applyLancamentoFilters(allRows, filters),
    tableSort,
    lancamentosRowSortAccessors,
  );

  const chipsSlot = host.querySelector<HTMLElement>(".filter-chips-slot");
  if (chipsSlot) {
    chipsSlot.innerHTML = renderFilterChipsMarkup();
    bindFilterChips(host, rerender);
  }

  const listHeader = host.querySelector<HTMLElement>(".list-header-panel");
  if (listHeader) {
    listHeader.innerHTML = renderSectionHeader("Lançamentos da competência", {
      count: filtered.length,
      totalCents: lancamentosSectionTotal(filtered),
    });
  }

  const tableSection = host.querySelector<HTMLElement>(".data-table-panel");
  if (tableSection) {
    if (filtered.length === 0) {
      tableSection.innerHTML = renderEmptyState({
        title: allRows.length === 0 ? "Nenhum lançamento nesta competência" : "Nenhum resultado para os filtros",
        description:
          allRows.length === 0
            ? "Adicione receitas e despesas para construir o histórico operacional do mês."
            : "Ajuste a busca ou remova filtros para ampliar os resultados.",
        ...(allRows.length === 0
          ? { ctaLabel: "Novo lançamento", ctaAction: "new-transaction-empty" }
          : {}),
      });
      host.querySelector<HTMLButtonElement>('[data-action="new-transaction-empty"]')?.addEventListener(
        "click",
        () => {
          openTransactionChoiceModal({
            mutations,
            competenceMonth: data.selectedCompetenceMonth,
            onSaved: rerender,
          });
        },
      );
    } else {
      tableSection.innerHTML = `
        ${renderMobileSortControl(LANCAMENTOS_SORT_COLUMNS, tableSort, LANCAMENTOS_MOBILE_SORT_ID)}
        <table class="cfm-table cfm-table--lancamentos" aria-label="Lançamentos" data-sort-table="${LANCAMENTOS_MOBILE_SORT_ID}">
          ${renderLancamentosTableHead(LANCAMENTOS_SORT_COLUMNS, tableSort)}
          <tbody>
            ${filtered.map((item) => renderLancamentoRow(item)).join("")}
          </tbody>
        </table>
      `;

      bindTableSortControls<LancamentosSortColumn>(tableSection, {
        mobileControlId: LANCAMENTOS_MOBILE_SORT_ID,
        onColumnActivate: (column) => {
          tableSort = toggleTableSort(tableSort, column, "asc");
          refreshLancamentosList(host, data, mutations, rerender);
        },
        onMobileSort: (column, direction) => {
          tableSort = { column, direction };
          refreshLancamentosList(host, data, mutations, rerender);
        },
      });
    }
  }

  if (filters.search || filters.kind !== "all" || filters.status !== "all") {
    announce(`${filtered.length} de ${allRows.length} lançamentos exibidos.`);
  }

  bindRowActions(host, filtered, data, mutations, rerender);
}

function bindToolbar(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const refresh = (): void => {
    refreshLancamentosList(host, data, mutations, rerender);
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

  const openNew = (): void => {
    openTransactionChoiceModal({
      mutations,
      competenceMonth: data.selectedCompetenceMonth,
      onSaved: rerender,
    });
  };

  host.querySelector<HTMLButtonElement>("#tx-new-transaction")?.addEventListener("click", openNew);
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
  items: LancamentoRow[],
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  for (const row of items) {
    if (isProjectedInstallmentRow(row)) {
      continue;
    }
    const item = row.data;
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

export { filters, SEARCH_DEBOUNCE_MS, tableSort };
