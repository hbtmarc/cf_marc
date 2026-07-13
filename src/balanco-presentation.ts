import { formatCentsToBRL, formatCompetenceLabel } from "./finance";
import {
  buildMonthlyBalanceSnapshot,
  getMonthlyBalanceByCompetence,
  listMonthlyBalances,
  type MonthlyBalanceSnapshot,
} from "./monthly-balance";
import { escapeHtml } from "./ui";
import type { AppData, CompetenceSummary, MonthlyBalance } from "./types";

function renderKpiGrid(summary: CompetenceSummary): string {
  const kpis = [
    { label: "Receitas", cents: summary.incomeSettledCents, kind: "income" as const },
    { label: "Despesas", cents: summary.expensePaidCents, kind: "expense" as const },
    { label: "Saldo", cents: summary.balanceRealizedCents, kind: "balance" as const },
    {
      label: "Saldo projetado",
      cents: summary.balancePlannedCents,
      kind: "planned" as const,
    },
  ];

  return `
    <div class="dashboard-kpi-grid" role="list">
      ${kpis
        .map((kpi) => {
          const moneyClass =
            kpi.kind === "income"
              ? kpi.cents > 0
                ? "money money--positive"
                : "money"
              : kpi.kind === "expense"
                ? kpi.cents > 0
                  ? "money money--negative"
                  : "money"
                : kpi.cents > 0
                  ? "money money--positive"
                  : kpi.cents < 0
                    ? "money money--negative"
                    : "money";
          return `
        <div class="dashboard-kpi" role="listitem">
          <span class="dashboard-kpi__label">${escapeHtml(kpi.label)}</span>
          <span class="dashboard-kpi__value ${moneyClass}">${escapeHtml(formatCentsToBRL(kpi.cents))}</span>
        </div>`;
        })
        .join("")}
    </div>`;
}

function renderSubtotalRows(snapshot: MonthlyBalanceSnapshot): string {
  return `
    <dl class="balanco-subtotals">
      <div class="balanco-subtotals__row">
        <dt>Fixas</dt>
        <dd class="money money--negative">${escapeHtml(formatCentsToBRL(snapshot.fixedBillsCents))}</dd>
      </div>
      <div class="balanco-subtotals__row">
        <dt>Faturas</dt>
        <dd>${escapeHtml(formatCentsToBRL(snapshot.invoicesCents))}</dd>
      </div>
    </dl>`;
}

function renderRegisteredValues(balance: MonthlyBalance): string {
  const summary: CompetenceSummary = {
    competenceMonth: balance.competenceMonth,
    incomePlannedCents: 0,
    incomeSettledCents: balance.incomeCents,
    incomePendingCents: 0,
    expensePlannedCents: 0,
    expensePaidCents: balance.expenseCents,
    expensePendingCents: 0,
    balancePlannedCents: balance.projectedBalanceCents,
    balanceRealizedCents: balance.balanceCents,
    recurringIncomeProjectedCents: 0,
    recurringExpenseProjectedCents: 0,
    recurringProjectedCount: 0,
  };

  return `
    <div class="balanco-registered__values">
      <p class="balanco-registered__label">Valores registrados</p>
      ${renderKpiGrid(summary)}
      <dl class="balanco-subtotals balanco-subtotals--registered">
        <div class="balanco-subtotals__row">
          <dt>Fixas</dt>
          <dd class="money money--negative">${escapeHtml(formatCentsToBRL(balance.fixedBillsCents))}</dd>
        </div>
        <div class="balanco-subtotals__row">
          <dt>Faturas</dt>
          <dd>${escapeHtml(formatCentsToBRL(balance.invoicesCents))}</dd>
        </div>
      </dl>
      ${
        balance.note
          ? `<p class="balanco-registered__note"><span>Observação</span> ${escapeHtml(balance.note)}</p>`
          : ""
      }
    </div>`;
}

function formatBalanceTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Data indisponível";
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function renderBalancoPage(data: AppData, competenceMonth: string): string {
  const snapshot = buildMonthlyBalanceSnapshot(data, competenceMonth);
  const summary: CompetenceSummary = {
    competenceMonth,
    incomePlannedCents: 0,
    incomeSettledCents: snapshot.incomeCents,
    incomePendingCents: 0,
    expensePlannedCents: 0,
    expensePaidCents: snapshot.expenseCents,
    expensePendingCents: 0,
    balancePlannedCents: snapshot.projectedBalanceCents,
    balanceRealizedCents: snapshot.balanceCents,
    recurringIncomeProjectedCents: 0,
    recurringExpenseProjectedCents: 0,
    recurringProjectedCount: 0,
  };
  const registered = getMonthlyBalanceByCompetence(data, competenceMonth);
  const history = listMonthlyBalances(data);

  const registrationBlock = registered
    ? `
      <section class="panel balanco-registered" aria-labelledby="balanco-registered-title">
        <header class="panel__header panel__header--split">
          <div>
            <h2 class="panel__title" id="balanco-registered-title">Balanço da competência</h2>
            <p class="balanco-registered__status">
              <span class="status-chip status-chip--success">Registrado</span>
              <span class="balanco-registered__timestamp">Atualizado em ${escapeHtml(formatBalanceTimestamp(registered.updatedAt))}</span>
            </p>
          </div>
          <button type="button" class="btn btn--secondary btn--compact" data-action="update-balance">Atualizar balanço</button>
        </header>
        <div class="panel__body">
          ${renderRegisteredValues(registered)}
        </div>
      </section>`
    : `
      <section class="panel balanco-unregistered" aria-labelledby="balanco-unregistered-title">
        <header class="panel__header panel__header--compact">
          <h2 class="panel__title" id="balanco-unregistered-title">Balanço ainda não registrado</h2>
        </header>
        <div class="panel__body">
          <p class="balanco-unregistered__text">Será salva uma fotografia dos valores atuais desta competência, sem alterar lançamentos ou faturas.</p>
          <button type="button" class="btn btn--primary" data-action="register-balance">Registrar balanço</button>
        </div>
      </section>`;

  const historyRows =
    history.length > 0
      ? `<ul class="balanco-history">
          ${history
            .map(
              (item) => `
            <li class="balanco-history__item">
              <div class="balanco-history__main">
                <span class="balanco-history__month">${escapeHtml(formatCompetenceLabel(item.competenceMonth))}</span>
                <span class="balanco-history__meta">Atualizado em ${escapeHtml(formatBalanceTimestamp(item.updatedAt))}</span>
              </div>
              <div class="balanco-history__values">
                <span class="${item.balanceCents > 0 ? "money money--positive" : item.balanceCents < 0 ? "money money--negative" : "money"}">${escapeHtml(formatCentsToBRL(item.balanceCents))}</span>
                <span class="balanco-history__projected">Proj. ${escapeHtml(formatCentsToBRL(item.projectedBalanceCents))}</span>
              </div>
              <button type="button" class="btn btn--ghost btn--compact" data-action="view-balance" data-competence-month="${escapeHtml(item.competenceMonth)}">Ver</button>
            </li>`,
            )
            .join("")}
        </ul>`
      : `<p class="balanco-history__empty">Nenhum balanço registrado.</p>`;

  return `
    <div class="balanco-page">
      <section class="panel balanco-current" aria-labelledby="balanco-current-title">
        <header class="panel__header panel__header--compact">
          <h2 class="panel__title" id="balanco-current-title">Situação atual</h2>
        </header>
        <div class="panel__body">
          ${renderKpiGrid(summary)}
        </div>
      </section>

      <section class="panel balanco-subtotals-panel" aria-labelledby="balanco-subtotals-title">
        <header class="panel__header panel__header--compact">
          <h2 class="panel__title" id="balanco-subtotals-title">Subtotais</h2>
        </header>
        <div class="panel__body">
          ${renderSubtotalRows(snapshot)}
        </div>
      </section>

      ${registrationBlock}

      <section class="panel balanco-history-panel" aria-labelledby="balanco-history-title">
        <header class="panel__header panel__header--compact">
          <h2 class="panel__title" id="balanco-history-title">Histórico de balanços</h2>
        </header>
        <div class="panel__body">
          ${historyRows}
        </div>
      </section>
    </div>
  `;
}

export function renderBalanceModalSummary(snapshot: MonthlyBalanceSnapshot): string {
  return `
    <dl class="balanco-modal-summary">
      <div><dt>Receitas</dt><dd class="money money--positive">${escapeHtml(formatCentsToBRL(snapshot.incomeCents))}</dd></div>
      <div><dt>Despesas</dt><dd class="money money--negative">${escapeHtml(formatCentsToBRL(snapshot.expenseCents))}</dd></div>
      <div><dt>Saldo</dt><dd>${escapeHtml(formatCentsToBRL(snapshot.balanceCents))}</dd></div>
      <div><dt>Saldo projetado</dt><dd>${escapeHtml(formatCentsToBRL(snapshot.projectedBalanceCents))}</dd></div>
    </dl>`;
}
