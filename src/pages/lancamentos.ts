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

type KindFilter = "all" | "income" | "expense";
type StatusFilter = "all" | "pending" | "settled";
type SortKey = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

interface LancamentosFilters {
  search: string;
  kind: KindFilter;
  status: StatusFilter;
  sort: SortKey;
}

let filters: LancamentosFilters = {
  search: "",
  kind: "all",
  status: "all",
  sort: "date-desc",
};

export function renderLancamentos(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const allTransactions = filterTransactionsByCompetence(data.transactions, month);
  const filtered = applyFilters(allTransactions, filters);

  host.innerHTML = "";

  const toolbar = el("section", "toolbar-panel");
  toolbar.innerHTML = `
    <div class="toolbar-panel__row">
      <label class="field field--inline field--search">
        <span class="field__label">Buscar</span>
        <input class="field__control" type="search" id="tx-search" placeholder="Descrição ou categoria" value="${escapeHtml(filters.search)}" />
      </label>
      <div class="toolbar-panel__filters">
        <label class="field field--inline">
          <span class="field__label">Tipo</span>
          <select class="field__control" id="tx-kind-filter">
            <option value="all" ${filters.kind === "all" ? "selected" : ""}>Todos</option>
            <option value="income" ${filters.kind === "income" ? "selected" : ""}>Receitas</option>
            <option value="expense" ${filters.kind === "expense" ? "selected" : ""}>Despesas</option>
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
    </div>
    ${
      filters.search || filters.kind !== "all" || filters.status !== "all"
        ? `<div class="filter-chips">${[
            filters.search ? renderFilterChip(`Busca: ${filters.search}`, "search") : "",
            filters.kind !== "all" ? renderFilterChip(filters.kind === "income" ? "Receitas" : "Despesas", "kind") : "",
            filters.status !== "all" ? renderFilterChip(filters.status === "pending" ? "Pendentes" : "Quitados", "status") : "",
          ]
            .filter(Boolean)
            .join("")}</div>`
        : ""
    }
  `;
  host.appendChild(toolbar);

  const listPanel = el("section", "list-panel");
  const listHeader = el("div", "list-header-panel");
  listHeader.setAttribute("aria-live", "polite");
  listHeader.innerHTML = renderSectionHeader("Lançamentos da competência", {
    count: filtered.length,
    totalCents: sectionTotal(filtered),
  });
  listPanel.appendChild(listHeader);

  const tableSection = el("div", "data-table-panel");
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
  listPanel.appendChild(tableSection);
  host.appendChild(listPanel);

  bindToolbar(host, data, mutations, rerender, filtered.length, allTransactions.length);
  bindRowActions(host, filtered, data, mutations, rerender);
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
    result = result.filter((item) => item.kind === state.kind);
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

function bindToolbar(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
  resultCount: number,
  totalCount: number,
): void {
  const update = (): void => {
    rerender();
  };

  host.querySelector<HTMLInputElement>("#tx-search")?.addEventListener("input", (event) => {
    filters.search = (event.target as HTMLInputElement).value;
    update();
  });
  host.querySelector<HTMLSelectElement>("#tx-kind-filter")?.addEventListener("change", (event) => {
    filters.kind = (event.target as HTMLSelectElement).value as KindFilter;
    update();
  });
  host.querySelector<HTMLSelectElement>("#tx-status-filter")?.addEventListener("change", (event) => {
    filters.status = (event.target as HTMLSelectElement).value as StatusFilter;
    update();
  });
  host.querySelector<HTMLSelectElement>("#tx-sort")?.addEventListener("change", (event) => {
    filters.sort = (event.target as HTMLSelectElement).value as SortKey;
    update();
  });

  const openNew = (): void => {
    openTransactionChoiceModal({
      mutations,
      competenceMonth: data.selectedCompetenceMonth,
      onSaved: rerender,
    });
  };

  host.querySelector<HTMLButtonElement>("#tx-new-transaction")?.addEventListener("click", openNew);
  host.querySelector<HTMLButtonElement>('[data-action="new-transaction-empty"]')?.addEventListener(
    "click",
    openNew,
  );

  if (filters.search || filters.kind !== "all" || filters.status !== "all") {
    announce(`${resultCount} de ${totalCount} lançamentos exibidos.`);
  }

  host.querySelectorAll<HTMLButtonElement>("[data-filter-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.filterChip;
      if (key === "search") {
        filters.search = "";
      }
      if (key === "kind") {
        filters.kind = "all";
      }
      if (key === "status") {
        filters.status = "all";
      }
      update();
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
