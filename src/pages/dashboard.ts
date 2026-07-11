import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import {
  buildDashboardContext,
  renderCompactTableHead,
  renderContextualPanel,
  renderEmptyState,
  renderProjectionPanel,
  renderProjectedInstallmentsPanel,
  renderRhythmPanel,
  renderSectionHeader,
  renderSituationPanel,
  renderTransactionTableRow,
} from "../presentation";
import { filterTransactionsByCompetence } from "../finance";
import { el } from "../ui";
import { openTransactionChoiceModal } from "../forms";

function renderRecentTransactions(transactions: ReturnType<typeof filterTransactionsByCompetence>): string {
  return `
    <section class="dashboard-recent">
      ${renderSectionHeader("Transações recentes", { count: transactions.length })}
      <div class="data-table data-table--compact" role="table" aria-label="Transações recentes">
        ${renderCompactTableHead()}
        <div class="data-table__body" role="rowgroup">
          ${transactions.map((item) => renderTransactionTableRow(item)).join("")}
        </div>
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

  const transactions = ctx.hasMovement
    ? filterTransactionsByCompetence(data.transactions, month)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
    : [];

  const recentBlock =
    transactions.length > 0 ? renderRecentTransactions(transactions) : "";

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
