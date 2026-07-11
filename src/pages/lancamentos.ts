import { filterTransactionsByCompetence } from "../finance";
import type { AppData, Transaction } from "../types";
import type { AppMutations } from "../forms";
import {
  deleteTransaction,
  openTransactionChoiceModal,
  openTransactionForm,
  toggleTransactionStatus,
} from "../forms";
import {
  renderDataTableHead,
  renderEmptyState,
  renderFilterChip,
  renderSectionHeader,
  renderTransactionTableRow,
  sectionTotal,
} from "../presentation";
import { announce, createRowMenu, el, escapeHtml, openConfirmModal } from "../ui";

type KindFilter = "all" | "income" | "expense" | "fee" | "refund";
type StatusFilter = "all" | "pending" | "settled";
type SortKey = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

interface LancamentosFilters {
  search: string;
  kind: KindFilter;
  status: StatusFilter;
  sort: SortKey;
}

const SEARCH_DEBOUNCE_MS = 175;

let filters: LancamentosFilters = {
  search: "",
  kind: "all",
  status: "all",
  sort: "date-desc",
};

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
          </select>
        </label>
        <label class="field field--inline">
          <span class="field__label">Ordenar</span>
          <select class="field__control" id="tx-sort">
            <option value="date-desc" ${filters.sort === "date-desc" ? "selected" : ""}>Data mais recente</option>
            <option value="date-asc" ${filters.sort === "date-asc" ? "selected" : ""}>Data mais antiga</option>
            <option value="amount-desc" ${filters.sort === "amount-desc" ? "selected" : ""}>Maior valor</option>
            <option value="amount-asc" ${filters.sort === "amount-asc" ? "selected" : ""}>Menor valor</option>
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
    filters.status !== "all"
      ? renderFilterChip(filters.status === "pending" ? "Pendentes" : "Quitados", "status")
      : "",
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

function matchesKindFilter(item: Transaction, kind: KindFilter): boolean {
  switch (kind) {
    case "income":
      return item.kind === "income";
    case "expense":
      return item.kind === "expense" && (item.expenseKind === "expense" || item.expenseKind === undefined);
    case "fee":
      return item.kind === "expense" && item.expenseKind === "fee";
    case "refund":
      return item.kind === "expense" && item.expenseKind === "refund";
    case "all":
    default:
      return true;
  }
}

function applyFilters(items: Transaction[], state: LancamentosFilters): Transaction[] {
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
    result = result.filter((item) => matchesKindFilter(item, state.kind));
  }
  if (state.status !== "all") {
    result = result.filter((item) => item.status === state.status);
  }
  result.sort((a, b) => {
    switch (state.sort) {
      case "date-asc":
        return a.date.localeCompare(b.date);
      case "amount-desc":
        return b.amountCents - a.amountCents;
      case "amount-asc":
        return a.amountCents - b.amountCents;
      case "date-desc":
      default:
        return b.date.localeCompare(a.date);
    }
  });
  return result;
}

function refreshLancamentosList(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const allTransactions = filterTransactionsByCompetence(data.transactions, month);
  const filtered = applyFilters(allTransactions, filters);

  const chipsSlot = host.querySelector<HTMLElement>(".filter-chips-slot");
  if (chipsSlot) {
    chipsSlot.innerHTML = renderFilterChipsMarkup();
    bindFilterChips(host, rerender);
  }

  const listHeader = host.querySelector<HTMLElement>(".list-header-panel");
  if (listHeader) {
    listHeader.innerHTML = renderSectionHeader("Lançamentos da competência", {
      count: filtered.length,
      totalCents: sectionTotal(filtered),
    });
  }

  const tableSection = host.querySelector<HTMLElement>(".data-table-panel");
  if (tableSection) {
    if (filtered.length === 0) {
      tableSection.innerHTML = renderEmptyState({
        title: allTransactions.length === 0 ? "Nenhum lançamento nesta competência" : "Nenhum resultado para os filtros",
        description:
          allTransactions.length === 0
            ? "Adicione receitas e despesas para construir o histórico operacional do mês."
            : "Ajuste a busca ou remova filtros para ampliar os resultados.",
        ...(allTransactions.length === 0
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
        <div class="data-table" role="table" aria-label="Lançamentos">
          ${renderDataTableHead()}
          <div class="data-table__body" role="rowgroup">
            ${filtered.map((item) => renderTransactionTableRow(item)).join("")}
          </div>
        </div>
      `;
    }
  }

  if (filters.search || filters.kind !== "all" || filters.status !== "all") {
    announce(`${filtered.length} de ${allTransactions.length} lançamentos exibidos.`);
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
  host.querySelector<HTMLSelectElement>("#tx-sort")?.addEventListener("change", (event) => {
    filters.sort = (event.target as HTMLSelectElement).value as SortKey;
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
  items: Transaction[],
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  for (const item of items) {
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

export { applyFilters, filters, SEARCH_DEBOUNCE_MS };
