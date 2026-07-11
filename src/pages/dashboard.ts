import type { AppData, Transaction } from "../types";
import type { AppMutations } from "../forms";
import {
  buildDashboardContext,
  renderContextualPanel,
  renderDashboardRecentHeader,
  renderDashboardRecentRow,
  renderDashboardRecentTableHead,
  renderEmptyState,
  renderProjectionPanel,
  renderProjectedInstallmentsPanel,
  renderRhythmPanel,
  renderSituationPanel,
  transactionTypeLabel,
  type DashboardRecentSortColumn,
} from "../presentation";
import { filterTransactionsByCompetence, transactionDisplayedAmountCents, transactionStatusLabel } from "../finance";
import {
  sortTableItems,
  toggleTableSort,
  TRANSACTION_STATUS_SORT_ORDER,
  type SortColumnAccessor,
  type TableSortState,
} from "../table-sort";
import { bindTableSortControls } from "../table-ui";
import { el } from "../ui";
import { openTransactionChoiceModal } from "../forms";

let dashboardRecentSort: TableSortState<DashboardRecentSortColumn> = {
  column: "date",
  direction: "desc",
};

export const dashboardRecentSortAccessors: Record<
  DashboardRecentSortColumn,
  SortColumnAccessor<Transaction>
> = {
  date: { kind: "date", getValue: (item) => item.date },
  description: { kind: "text", getValue: (item) => item.description },
  type: { kind: "text", getValue: (item) => transactionTypeLabel(item) },
  status: {
    kind: "status",
    getValue: (item) => transactionStatusLabel(item.kind, item.status, item.ledgerStatus),
    statusOrder: TRANSACTION_STATUS_SORT_ORDER,
  },
  amount: {
    kind: "number",
    getValue: (item) => transactionDisplayedAmountCents(item),
  },
};

export function getDashboardRecentSort(): TableSortState<DashboardRecentSortColumn> {
  return dashboardRecentSort;
}

function selectRecentTransactions(data: AppData, competenceMonth: string): Transaction[] {
  return filterTransactionsByCompetence(data.transactions, competenceMonth)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
}

function renderRecentTransactionsBlock(
  data: AppData,
  competenceMonth: string,
  summary: ReturnType<typeof buildDashboardContext>["summary"],
): string {
  const recentPool = selectRecentTransactions(data, competenceMonth);
  if (recentPool.length === 0) {
    return "";
  }

  const sorted = sortTableItems(recentPool, dashboardRecentSort, dashboardRecentSortAccessors);

  return `
    <section class="dashboard-recent">
      ${renderDashboardRecentHeader(summary)}
      <div class="cfm-table-wrap cfm-table-wrap--dashboard-recent">
        <table class="cfm-table cfm-table--dashboard-recent" aria-label="Transações recentes">
          ${renderDashboardRecentTableHead(dashboardRecentSort)}
          <tbody>
            ${sorted.map((item) => renderDashboardRecentRow(item)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderDashboard(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const ctx = buildDashboardContext(data, month);
  const recentBlock = renderRecentTransactionsBlock(data, month, ctx.summary);

  host.innerHTML = `
    <div class="dashboard-grid">
      <div class="dashboard-grid__primary">
        ${renderSituationPanel(ctx)}
        ${renderRhythmPanel(ctx.rhythm)}
        ${renderProjectedInstallmentsPanel(ctx.projectedInstallments)}
        ${recentBlock}
      </div>
      <div class="dashboard-grid__side">
        ${renderProjectionPanel(ctx)}
        ${renderContextualPanel(ctx.upcoming, ctx.attention)}
      </div>
    </div>
  `;

  if (!ctx.hasMovement) {
    const empty = el("section", "dashboard-empty");
    empty.innerHTML = renderEmptyState({
      title: "Ainda não há movimentações nesta competência",
      description:
        "Registre receitas, despesas ou faturas para acompanhar saldo realizado, compromissos e fechamento projetado do mês.",
      ctaLabel: "Novo lançamento",
      ctaAction: "new-transaction",
    });
    host.querySelector(".dashboard-grid__primary")?.appendChild(empty);
  }

  bindDashboardActions(host, data, mutations, rerender);
  bindDashboardRecentSort(host, rerender);
}

function bindDashboardRecentSort(host: HTMLElement, rerender: () => void): void {
  const tableWrap = host.querySelector<HTMLElement>(".cfm-table-wrap--dashboard-recent");
  if (!tableWrap) {
    return;
  }

  bindTableSortControls<DashboardRecentSortColumn>(tableWrap, {
    onColumnActivate: (column) => {
      dashboardRecentSort = toggleTableSort(dashboardRecentSort, column, "asc");
      rerender();
    },
    onMobileSort: () => {},
  });
}

function bindDashboardActions(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const openNew = (): void => {
    openTransactionChoiceModal({
      mutations,
      competenceMonth: data.selectedCompetenceMonth,
      onSaved: rerender,
    });
  };

  host.querySelector<HTMLButtonElement>('[data-action="new-transaction"]')?.addEventListener(
    "click",
    openNew,
  );
  host.querySelector<HTMLButtonElement>('[data-action="new-income"]')?.addEventListener(
    "click",
    openNew,
  );
}

export function resetDashboardRecentSortForTests(): void {
  dashboardRecentSort = { column: "date", direction: "desc" };
}
