import {
  calculateCompetenceSummary,
  filterInvoicesByCompetence,
  filterTransactionsByCompetence,
  formatCentsToBRL,
} from "../finance";
import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import {
  el,
  renderEmptyState,
  renderMoney,
} from "../ui";
import { navigate } from "../router";
import { openTransactionForm } from "../forms";
import { invoiceRowHtml, transactionRowHtml } from "../ui";

export function renderDashboard(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const summary = calculateCompetenceSummary(data, month);
  const incomes = filterTransactionsByCompetence(data.transactions, month).filter(
    (item) => item.kind === "income",
  );
  const expenses = filterTransactionsByCompetence(
    data.transactions,
    month,
  ).filter((item) => item.kind === "expense");
  const invoices = filterInvoicesByCompetence(data.invoices, month);

  const hasMovement =
    incomes.length > 0 || expenses.length > 0 || invoices.length > 0;

  host.innerHTML = `
    <section class="dashboard-hero" aria-labelledby="balance-realized-label">
      <p class="dashboard-hero__label" id="balance-realized-label">Saldo realizado</p>
      <p class="dashboard-hero__value">${renderMoney(summary.balanceRealizedCents)}</p>
      <p class="dashboard-hero__meta">Saldo planejado: ${renderMoney(summary.balancePlannedCents)}</p>
    </section>

    <section class="kpi-grid" aria-label="Resumo da competência">
      <article class="kpi-card">
        <h2 class="kpi-card__title">Receitas planejadas</h2>
        <p class="kpi-card__value money money--positive">${formatCentsToBRL(summary.incomePlannedCents)}</p>
        <p class="kpi-card__meta">Recebidas: ${formatCentsToBRL(summary.incomeSettledCents)}</p>
      </article>
      <article class="kpi-card">
        <h2 class="kpi-card__title">Despesas planejadas</h2>
        <p class="kpi-card__value money money--negative">${formatCentsToBRL(summary.expensePlannedCents)}</p>
        <p class="kpi-card__meta">Pagas: ${formatCentsToBRL(summary.expensePaidCents)}</p>
      </article>
      <article class="kpi-card kpi-card--warning">
        <h2 class="kpi-card__title">Pendências</h2>
        <p class="kpi-card__value">${formatCentsToBRL(summary.incomePendingCents + summary.expensePendingCents)}</p>
        <p class="kpi-card__meta">Receitas pendentes + despesas em aberto</p>
      </article>
    </section>

    <section class="quick-actions" aria-label="Ações rápidas">
      <button type="button" class="btn btn--primary" data-action="new-income">Nova receita</button>
      <button type="button" class="btn btn--secondary" data-action="new-expense">Nova despesa</button>
      <button type="button" class="btn btn--secondary" data-action="go-invoices">Ver faturas</button>
    </section>
  `;

  if (!hasMovement) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState(
      "Competência sem movimentações",
      "Comece adicionando uma receita, despesa ou fatura para este mês.",
    );
    host.appendChild(empty);
    bindDashboardActions(host, data, mutations, rerender);
    return;
  }

  const panels = el("div", "dashboard-panels");

  panels.innerHTML = `
    <section class="panel">
      <div class="panel__header">
        <h2 class="panel__title">Receitas recentes</h2>
      </div>
      <div class="panel__body">
        ${renderTransactionList(incomes.slice(0, 4), "Nenhuma receita nesta competência.")}
      </div>
    </section>
    <section class="panel">
      <div class="panel__header">
        <h2 class="panel__title">Despesas recentes</h2>
      </div>
      <div class="panel__body">
        ${renderTransactionList(expenses.slice(0, 4), "Nenhuma despesa nesta competência.")}
      </div>
    </section>
    <section class="panel panel--full">
      <div class="panel__header">
        <h2 class="panel__title">Faturas do mês</h2>
      </div>
      <div class="panel__body">
        ${renderInvoiceList(data, invoices.slice(0, 4))}
      </div>
    </section>
  `;

  host.appendChild(panels);
  bindDashboardActions(host, data, mutations, rerender);
}

function renderTransactionList(
  items: AppData["transactions"],
  emptyMessage: string,
): string {
  if (items.length === 0) {
    return `<p class="panel__empty">${emptyMessage}</p>`;
  }

  return `<ul class="list">${items
    .map(
      (item) => `
      <li class="list-row">
        ${transactionRowHtml({
          description: item.description,
          category: item.category,
          date: item.date,
          amountCents: item.amountCents,
          kind: item.kind,
          status: item.status,
        })}
      </li>`,
    )
    .join("")}</ul>`;
}

function renderInvoiceList(data: AppData, invoices: AppData["invoices"]): string {
  if (invoices.length === 0) {
    return `<p class="panel__empty">Nenhuma fatura nesta competência.</p>`;
  }

  return `<ul class="list">${invoices
    .map((invoice) => {
      const card = data.cards.find((item) => item.id === invoice.cardId);
      return `
      <li class="list-row">
        ${invoiceRowHtml({
          cardName: card?.name ?? "Cartão removido",
          dueDate: invoice.dueDate,
          amountCents: invoice.amountCents,
          status: invoice.status,
        })}
      </li>`;
    })
    .join("")}</ul>`;
}

function bindDashboardActions(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  host.querySelector<HTMLButtonElement>('[data-action="new-income"]')?.addEventListener(
    "click",
    () => {
      openTransactionForm({
        mutations,
        competenceMonth: data.selectedCompetenceMonth,
        kind: "income",
        onSaved: rerender,
      });
    },
  );

  host.querySelector<HTMLButtonElement>('[data-action="new-expense"]')?.addEventListener(
    "click",
    () => {
      openTransactionForm({
        mutations,
        competenceMonth: data.selectedCompetenceMonth,
        kind: "expense",
        onSaved: rerender,
      });
    },
  );

  host.querySelector<HTMLButtonElement>('[data-action="go-invoices"]')?.addEventListener(
    "click",
    () => {
      navigate("/faturas");
    },
  );
}
