import { formatCentsToBRL, formatCompetenceLabel } from "./finance";
import { getMonthlyBalanceByCompetence } from "./monthly-balance";
import {
  buildPaymentChecklist,
  type PaymentChecklistItem,
  type PaymentChecklistItemKind,
  type PaymentChecklistProjection,
} from "./payment-checklist";
import { paymentItemDisplayStatus } from "./payment-item-status";
import { escapeHtml } from "./ui";
import type { AppData, MonthlyBalance } from "./types";

function moneyClass(cents: number, negative = false): string {
  if (cents === 0) {
    return "money";
  }
  if (negative) {
    return "money money--negative";
  }
  return cents > 0 ? "money money--positive" : "money money--negative";
}

function renderSummaryKpis(options: {
  incomeCents: number;
  currentBalanceCents: number;
  outstandingCents: number;
  afterCommitmentsCents: number;
}): string {
  const kpis = [
    { label: "Recebido", cents: options.incomeCents, className: moneyClass(options.incomeCents) },
    {
      label: "Saldo atual",
      cents: options.currentBalanceCents,
      className: moneyClass(options.currentBalanceCents),
    },
    {
      label: "Ainda comprometido",
      cents: options.outstandingCents,
      className: moneyClass(options.outstandingCents, true),
    },
    {
      label: "Saldo após quitar",
      cents: options.afterCommitmentsCents,
      className: moneyClass(options.afterCommitmentsCents),
    },
  ];

  return `
    <div class="dashboard-kpi-grid" role="list">
      ${kpis
        .map(
          (kpi) => `
        <div class="dashboard-kpi" role="listitem">
          <span class="dashboard-kpi__label">${escapeHtml(kpi.label)}</span>
          <span class="dashboard-kpi__value ${kpi.className}">${escapeHtml(formatCentsToBRL(kpi.cents))}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function formatTimestamp(iso: string): string {
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

function itemStatus(item: PaymentChecklistItem): { label: string; className: string } {
  const today = new Date().toISOString().slice(0, 10);
  return paymentItemDisplayStatus(item, today);
}

function sectionTitle(kind: PaymentChecklistItemKind): string {
  switch (kind) {
    case "fixed_bill":
      return "Contas fixas";
    case "invoice":
      return "Faturas";
    default:
      return "Outros compromissos";
  }
}

function renderChecklistItem(item: PaymentChecklistItem, locked: boolean): string {
  const status = itemStatus(item);
  const disabled = locked || !item.checkable;
  return `
    <li class="payment-checklist__item${item.checked ? " is-checked" : ""}">
      <label class="payment-checklist__label">
        <input
          class="payment-checklist__input"
          type="checkbox"
          data-action="toggle-payment"
          data-item-id="${escapeHtml(item.id)}"
          ${item.checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
        />
        <span class="payment-checklist__box" aria-hidden="true"></span>
        <span class="payment-checklist__content">
          <span class="payment-checklist__title">${escapeHtml(item.title)}</span>
          <span class="payment-checklist__detail">${escapeHtml(item.detail)}</span>
        </span>
        <span class="payment-checklist__side">
          <span class="${moneyClass(item.amountCents, true)}">${escapeHtml(formatCentsToBRL(item.amountCents))}</span>
          <span class="status-chip ${status.className}">${escapeHtml(status.label)}</span>
        </span>
      </label>
    </li>`;
}

function renderChecklistSection(
  kind: PaymentChecklistItemKind,
  items: PaymentChecklistItem[],
  locked: boolean,
): string {
  if (items.length === 0) {
    return "";
  }
  return `
    <section class="panel payment-checklist" aria-labelledby="payment-${kind}-title">
      <header class="panel__header panel__header--split">
        <h2 class="panel__title" id="payment-${kind}-title">${escapeHtml(sectionTitle(kind))}</h2>
        <span class="payment-checklist__count">${items.filter((item) => item.checked).length}/${items.length}</span>
      </header>
      <div class="panel__body panel__body--flush-top">
        <ul class="payment-checklist__list">
          ${items.map((item) => renderChecklistItem(item, locked)).join("")}
        </ul>
      </div>
    </section>`;
}

function renderProjection(item: PaymentChecklistProjection): string {
  return `
    <li class="payment-projection__item">
      <span class="payment-projection__content">
        <span class="payment-checklist__title">${escapeHtml(item.title)}</span>
        <span class="payment-checklist__detail">${escapeHtml(item.detail)}</span>
      </span>
      <span class="payment-checklist__side">
        <span class="money">${escapeHtml(formatCentsToBRL(item.amountCents))}</span>
        <span class="status-chip status-chip--projected">Projetada</span>
      </span>
    </li>`;
}

function renderProjections(projections: PaymentChecklistProjection[]): string {
  if (projections.length === 0) {
    return "";
  }
  return `
    <section class="panel payment-projection" aria-labelledby="payment-projection-title">
      <header class="panel__header panel__header--compact">
        <div>
          <h2 class="panel__title" id="payment-projection-title">Próximas faturas</h2>
          <p class="panel__description">Valores ainda não fechados. Eles informam o planejamento, mas não entram na conclusão do checklist.</p>
        </div>
      </header>
      <div class="panel__body panel__body--flush-top">
        <ul class="payment-projection__list">
          ${projections.map(renderProjection).join("")}
        </ul>
      </div>
    </section>`;
}

function renderProgress(checked: number, total: number, remainingCents: number): string {
  const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
  return `
    <div class="payment-progress" aria-label="Progresso do checklist">
      <div class="payment-progress__header">
        <strong>${checked} de ${total} compromissos conferidos</strong>
        <span>${percentage}%</span>
      </div>
      <div class="payment-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${checked}">
        <span class="payment-progress__bar" style="width: ${percentage}%"></span>
      </div>
      <p class="payment-progress__meta">Restante no checklist: <strong>${escapeHtml(formatCentsToBRL(remainingCents))}</strong></p>
    </div>`;
}

function renderSettlement(balance: MonthlyBalance): string {
  return `
    <section class="panel payment-settlement payment-settlement--complete" aria-labelledby="payment-settlement-title">
      <header class="panel__header panel__header--split">
        <div>
          <h2 class="panel__title" id="payment-settlement-title">Quitação registrada</h2>
          <p class="payment-settlement__timestamp">Concluída em ${escapeHtml(formatTimestamp(balance.settledAt ?? balance.updatedAt))}</p>
        </div>
        <button type="button" class="btn btn--secondary btn--compact" data-action="reopen-payments">Reabrir conferência</button>
      </header>
      <div class="panel__body">
        ${renderSummaryKpis({
          incomeCents: balance.incomeCents,
          currentBalanceCents: balance.balanceCents,
          outstandingCents: balance.sourceOutstandingCents ?? 0,
          afterCommitmentsCents:
            balance.estimatedBalanceAfterCommitmentsCents ?? balance.projectedBalanceCents,
        })}
        <p class="payment-settlement__note">Esta fotografia preserva o balanço daquele momento. Alterações posteriores no sistema não a recalculam.</p>
      </div>
    </section>`;
}

export function renderBalancoPage(data: AppData, competenceMonth: string): string {
  const checklist = buildPaymentChecklist(data, competenceMonth);
  const balance = getMonthlyBalanceByCompetence(data, competenceMonth);
  const settled = Boolean(balance?.settledAt);
  const incomeCents = data.transactions
    .filter(
      (item) =>
        item.competenceMonth === competenceMonth &&
        item.kind === "income" &&
        item.status === "settled",
    )
    .reduce((total, item) => total + item.amountCents, 0);
  const kinds: PaymentChecklistItemKind[] = ["fixed_bill", "invoice", "other"];
  const hasManualChecks = checklist.items.some((item) => item.manuallyChecked);

  const actionBlock = settled && balance
    ? renderSettlement(balance)
    : `
      <section class="panel payment-settlement" aria-labelledby="payment-settlement-title">
        <header class="panel__header panel__header--compact">
          <h2 class="panel__title" id="payment-settlement-title">Concluir quitação</h2>
        </header>
        <div class="panel__body payment-settlement__body">
          <div>
            <p class="payment-settlement__text">Conclua quando todos os compromissos estiverem conferidos. O sistema salvará o balanço exato deste momento.</p>
            <p class="payment-settlement__helper">Os checks pertencem apenas a esta página e não alteram lançamentos ou faturas.</p>
          </div>
          <div class="payment-settlement__actions">
            ${hasManualChecks ? '<button type="button" class="btn btn--ghost" data-action="clear-payments">Limpar marcações</button>' : ""}
            <button type="button" class="btn btn--primary" data-action="complete-payments" ${checklist.allChecked ? "" : "disabled"}>Concluir quitação do mês</button>
          </div>
        </div>
      </section>`;

  const emptyState = checklist.totalCount === 0
    ? `
      <section class="panel payment-empty" aria-labelledby="payment-empty-title">
        <div class="panel__body">
          <h2 class="panel__title" id="payment-empty-title">Nenhum compromisso para conferir</h2>
          <p>Cadastre contas fixas, faturas reais ou despesas pendentes para formar o checklist desta competência.</p>
        </div>
      </section>`
    : "";

  return `
    <div class="balanco-page">
      <section class="panel payment-overview" aria-labelledby="payment-overview-title">
        <header class="panel__header panel__header--split">
          <div>
            <h2 class="panel__title" id="payment-overview-title">Fechamento do salário</h2>
            <p class="panel__description">${escapeHtml(formatCompetenceLabel(competenceMonth))}: confira o que precisa sair e preserve o balanço da quitação.</p>
          </div>
          ${settled ? '<span class="status-chip status-chip--paid">Concluído</span>' : '<span class="status-chip status-chip--open">Em conferência</span>'}
        </header>
        <div class="panel__body">
          ${renderSummaryKpis({
            incomeCents,
            currentBalanceCents: checklist.currentBalanceCents,
            outstandingCents: checklist.sourceOutstandingCents,
            afterCommitmentsCents: checklist.estimatedBalanceAfterCommitmentsCents,
          })}
          ${renderProgress(
            checklist.checkedCount,
            checklist.totalCount,
            checklist.checklistRemainingCents,
          )}
        </div>
      </section>

      ${emptyState}
      ${kinds
        .map((kind) =>
          renderChecklistSection(
            kind,
            checklist.items.filter((item) => item.kind === kind),
            settled,
          ),
        )
        .join("")}
      ${renderProjections(checklist.projections)}
      ${actionBlock}
    </div>`;
}
