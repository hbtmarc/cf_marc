import {
  calculateCompetenceSummary,
  currentCompetenceMonth,
  filterInvoicesByCompetence,
  filterTransactionsByCompetence,
  formatCentsToBRL,
  formatCompetenceLabel,
  formatDateLabel,
  invoiceDebtCents,
  invoiceHasCredit,
  invoiceStatusLabel,
  isInvoiceLinkedExpense,
  sumCents,
  transactionStatusLabel,
} from "./finance";
import type {
  AppData,
  Card,
  CompetenceSummary,
  Invoice,
  RoutePath,
  Transaction,
} from "./types";
import { escapeHtml, renderMoney, renderStatusChip } from "./ui";
import {
  formatCardCount,
  formatInvoiceCount,
  formatItemCount,
  formatTransactionCount,
} from "./text";

export type BalanceTone = "positive" | "negative" | "neutral";

export interface DashboardProjection {
  realizedCents: number;
  pendingIncomeCents: number;
  pendingExpenseTxCents: number;
  openInvoicesCents: number;
  projectedCents: number;
}

export interface DashboardRhythm {
  daysElapsed: number;
  daysInMonth: number;
  monthElapsedPct: number;
  incomeSettledCents: number;
  incomePlannedCents: number;
  incomeSettledPct: number | null;
  expensePaidCents: number;
  expensePlannedCents: number;
  expensePaidPct: number | null;
}

export interface DashboardUpcomingItem {
  id: string;
  date: string;
  label: string;
  origin: string;
  amountCents: number;
  kind: "income" | "expense" | "invoice";
  statusLabel: string;
}

export interface DashboardAttentionItem {
  severity: "info" | "warning";
  message: string;
  route?: RoutePath;
  routeLabel?: string;
}

export interface DashboardContext {
  summary: CompetenceSummary;
  updatedAtLabel: string;
  balanceContext: string;
  projection: DashboardProjection;
  rhythm: DashboardRhythm;
  upcoming: DashboardUpcomingItem[];
  attention: DashboardAttentionItem[];
  hasMovement: boolean;
}

export function balanceTone(cents: number): BalanceTone {
  if (cents > 0) {
    return "positive";
  }
  if (cents < 0) {
    return "negative";
  }
  return "neutral";
}

function daysInCompetenceMonth(competenceMonth: string): number {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return new Date(year, month, 0).getDate();
}

function daysElapsedInCompetence(competenceMonth: string, today = new Date()): number {
  const current = currentCompetenceMonth();
  if (competenceMonth !== current) {
    return competenceMonth < current ? daysInCompetenceMonth(competenceMonth) : 0;
  }
  return today.getDate();
}

function latestUpdateLabel(data: AppData): string {
  const stamps = [
    ...data.transactions.map((item) => item.updatedAt),
    ...data.invoices.map((item) => item.updatedAt),
    ...data.cards.map((item) => item.updatedAt),
  ];
  if (stamps.length === 0) {
    return "Sem atualizações registradas";
  }
  const latest = stamps.sort().at(-1) ?? "";
  const date = new Date(latest);
  if (Number.isNaN(date.getTime())) {
    return "Atualização local";
  }
  return `Atualizado em ${date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function balanceContextLabel(summary: CompetenceSummary): string {
  const pending = summary.incomePendingCents + summary.expensePendingCents;
  if (summary.balanceRealizedCents < 0) {
    return "Saldo negativo nesta competência";
  }
  if (summary.balanceRealizedCents === 0 && pending > 0) {
    return "Saldo zerado com compromissos em aberto";
  }
  if (pending > summary.balanceRealizedCents && summary.balanceRealizedCents > 0) {
    return "Saldo positivo, porém comprometido";
  }
  if (summary.balanceRealizedCents > 0) {
    return "Saldo positivo no período";
  }
  return "Sem saldo realizado no período";
}

export function buildDashboardContext(data: AppData, competenceMonth: string): DashboardContext {
  const summary = calculateCompetenceSummary(data, competenceMonth);
  const transactions = filterTransactionsByCompetence(data.transactions, competenceMonth);
  const invoices = filterInvoicesByCompetence(data.invoices, competenceMonth);
  const expenses = transactions.filter((item) => item.kind === "expense");
  const incomes = transactions.filter((item) => item.kind === "income");

  const pendingExpenseTxCents = sumCents(
    expenses
      .filter((item) => item.status === "pending" && !isInvoiceLinkedExpense(item))
      .map((item) => item.amountCents),
  );
  const openInvoicesCents = sumCents(
    invoices
      .filter((item) => item.status === "open" || item.status === "partial")
      .map((item) => invoiceDebtCents(item)),
  );

  const projection: DashboardProjection = {
    realizedCents: summary.balanceRealizedCents,
    pendingIncomeCents: summary.incomePendingCents,
    pendingExpenseTxCents,
    openInvoicesCents,
    projectedCents: summary.balancePlannedCents,
  };

  const daysInMonth = daysInCompetenceMonth(competenceMonth);
  const daysElapsed = daysElapsedInCompetence(competenceMonth);
  const rhythm: DashboardRhythm = {
    daysElapsed,
    daysInMonth,
    monthElapsedPct: daysInMonth > 0 ? Math.round((daysElapsed / daysInMonth) * 100) : 0,
    incomeSettledCents: summary.incomeSettledCents,
    incomePlannedCents: summary.incomePlannedCents,
    incomeSettledPct:
      summary.incomePlannedCents > 0
        ? Math.round((summary.incomeSettledCents / summary.incomePlannedCents) * 100)
        : null,
    expensePaidCents: summary.expensePaidCents,
    expensePlannedCents: summary.expensePlannedCents,
    expensePaidPct:
      summary.expensePlannedCents > 0
        ? Math.round((summary.expensePaidCents / summary.expensePlannedCents) * 100)
        : null,
  };

  const upcoming: DashboardUpcomingItem[] = [
    ...incomes
      .filter((item) => item.status === "pending")
      .map((item) => ({
        id: item.id,
        date: item.date,
        label: item.description,
        origin: item.category,
        amountCents: item.amountCents,
        kind: "income" as const,
        statusLabel: transactionStatusLabel(item.kind, item.status, item.ledgerStatus),
      })),
    ...expenses
      .filter((item) => item.status === "pending" && !isInvoiceLinkedExpense(item))
      .map((item) => ({
        id: item.id,
        date: item.date,
        label: item.description,
        origin: item.category,
        amountCents: item.amountCents,
        kind: "expense" as const,
        statusLabel: transactionStatusLabel(item.kind, item.status, item.ledgerStatus),
      })),
    ...invoices
      .filter((item) => item.status === "open" || item.status === "partial")
      .map((item) => {
        const card = data.cards.find((cardItem) => cardItem.id === item.cardId);
        return {
          id: item.id,
          date: item.dueDate,
          label: `Fatura ${card?.name ?? "Cartão"}`,
          origin: formatCompetenceLabel(item.competenceMonth),
          amountCents: item.amountCents,
          kind: "invoice" as const,
          statusLabel: invoiceStatusLabel(item),
        };
      }),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const attention: DashboardAttentionItem[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const cardsWithoutDays = data.cards.filter(
    (card) => card.closingDay === null || card.dueDay === null,
  );
  if (cardsWithoutDays.length > 0) {
    attention.push({
      severity: "warning",
      message: `${formatCardCount(cardsWithoutDays.length)} sem dias de fechamento ou vencimento configurados.`,
      route: "/ajustes",
      routeLabel: "Revisar cartões",
    });
  }

  const overdueInvoices = invoices.filter(
    (item) =>
      (item.status === "open" || item.status === "partial") && item.dueDate < today,
  );
  if (overdueInvoices.length > 0) {
    attention.push({
      severity: "warning",
      message: `${formatInvoiceCount(overdueInvoices.length)} vencida${overdueInvoices.length === 1 ? "" : "s"} totalizando ${formatCentsToBRL(sumCents(overdueInvoices.map((item) => item.amountCents)))}.`,
      route: "/faturas",
      routeLabel: "Revisar faturas",
    });
  }

  const uncategorized = transactions.filter((item) => item.category.trim().length === 0);
  if (uncategorized.length > 0) {
    attention.push({
      severity: "info",
      message: `${formatTransactionCount(uncategorized.length)} sem categoria definida.`,
      route: "/lancamentos",
      routeLabel: "Revisar lançamentos",
    });
  }

  return {
    summary,
    updatedAtLabel: latestUpdateLabel(data),
    balanceContext: balanceContextLabel(summary),
    projection,
    rhythm,
    upcoming,
    attention,
    hasMovement: transactions.length > 0 || invoices.length > 0,
  };
}

export function renderSituationPanel(ctx: DashboardContext): string {
  const tone = balanceTone(ctx.summary.balanceRealizedCents);
  const committed =
    ctx.summary.incomePendingCents +
    ctx.projection.pendingExpenseTxCents +
    ctx.projection.openInvoicesCents;
  return `
    <section class="panel panel--situation" aria-labelledby="situation-title">
      <header class="panel__header">
        <div>
          <p class="text-overline" id="situation-title">Situação financeira</p>
          <p class="panel__context">${escapeHtml(ctx.balanceContext)}</p>
        </div>
        <p class="panel__meta">${escapeHtml(ctx.updatedAtLabel)}</p>
      </header>
      <div class="panel__body panel__body--situation">
        <p class="metric-dominant metric-dominant--${tone}">${renderMoney(ctx.summary.balanceRealizedCents)}</p>
        <dl class="metric-inline-list">
          <div class="metric-inline-list__item">
            <dt>Recebido</dt>
            <dd class="money money--positive">${escapeHtml(formatCentsToBRL(ctx.summary.incomeSettledCents))}</dd>
          </div>
          <div class="metric-inline-list__item">
            <dt>Pago</dt>
            <dd class="money money--negative">${escapeHtml(formatCentsToBRL(ctx.summary.expensePaidCents))}</dd>
          </div>
          <div class="metric-inline-list__item">
            <dt>Comprometido</dt>
            <dd>${escapeHtml(formatCentsToBRL(committed))}</dd>
          </div>
        </dl>
        ${renderSituationActions()}
      </div>
    </section>
  `;
}

export function renderProjectionPanel(ctx: DashboardContext): string {
  const rows: Array<{
    label: string;
    value: number;
    sign: string;
    tone: "positive" | "negative" | "neutral" | "deduction";
  }> = [
    { label: "Saldo realizado", value: ctx.projection.realizedCents, sign: "", tone: "positive" },
    {
      label: "Receitas previstas",
      value: ctx.projection.pendingIncomeCents,
      sign: "+",
      tone: "neutral",
    },
    {
      label: "Despesas pendentes",
      value: ctx.projection.pendingExpenseTxCents,
      sign: "−",
      tone: "deduction",
    },
    {
      label: "Faturas em aberto",
      value: ctx.projection.openInvoicesCents,
      sign: "−",
      tone: "deduction",
    },
  ];
  const projectedTone = balanceTone(ctx.projection.projectedCents);

  return `
    <section class="panel panel--projection" aria-labelledby="projection-title">
      <header class="panel__header">
        <p class="text-overline" id="projection-title">Fechamento projetado</p>
      </header>
      <div class="panel__body">
        <ol class="projection-breakdown">
          ${rows
            .map(
              (row) => `
            <li class="projection-breakdown__row projection-breakdown__row--${row.tone}">
              <span class="projection-breakdown__label">${escapeHtml(row.label)}</span>
              <span class="projection-breakdown__value">${row.sign}${renderMoney(Math.abs(row.value))}</span>
            </li>`,
            )
            .join("")}
          <li class="projection-breakdown__row projection-breakdown__row--total projection-breakdown__row--${projectedTone}">
            <span class="projection-breakdown__label">Saldo projetado</span>
            <span class="projection-breakdown__value">${renderMoney(ctx.projection.projectedCents)}</span>
          </li>
        </ol>
      </div>
    </section>
  `;
}

function renderRhythmMetric(input: {
  label: string;
  pct: number | null;
  valueText: string;
  barClass: string;
  ariaValueText: string;
}): string {
  if (input.pct === null) {
    return `
      <div class="rhythm-item rhythm-item--value-only">
        <span class="rhythm-item__label">${escapeHtml(input.label)}</span>
        <span class="rhythm-item__value">${escapeHtml(input.valueText)}</span>
      </div>`;
  }

  return `
    <div class="rhythm-item">
      <span class="rhythm-item__label">${escapeHtml(input.label)}</span>
      <div class="progress-bar ${input.barClass}" role="progressbar" aria-valuenow="${input.pct}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${escapeHtml(input.ariaValueText)}">
        <span class="progress-bar__fill" style="width: ${input.pct}%"></span>
      </div>
      <span class="rhythm-item__value">${input.pct}%</span>
    </div>`;
}

export function renderRhythmPanel(rhythm: DashboardRhythm): string {
  return `
    <section class="panel panel--rhythm" aria-labelledby="rhythm-title">
      <header class="panel__header">
        <p class="text-overline" id="rhythm-title">Ritmo do mês</p>
        <p class="panel__meta">Dia ${rhythm.daysElapsed} de ${rhythm.daysInMonth}</p>
      </header>
      <div class="panel__body rhythm-grid">
        ${renderRhythmMetric({
          label: "Tempo transcorrido",
          pct: rhythm.monthElapsedPct,
          valueText: `${rhythm.monthElapsedPct}% da competência`,
          barClass: "",
          ariaValueText: `${rhythm.monthElapsedPct}% da competência transcorrida`,
        })}
        ${renderRhythmMetric({
          label: "Recebido até hoje",
          pct: null,
          valueText: formatCentsToBRL(rhythm.incomeSettledCents),
          barClass: "progress-bar--income",
          ariaValueText: `Recebido até hoje ${formatCentsToBRL(rhythm.incomeSettledCents)}`,
        })}
        ${renderRhythmMetric({
          label: "Pago até hoje",
          pct: null,
          valueText: formatCentsToBRL(rhythm.expensePaidCents),
          barClass: "progress-bar--expense",
          ariaValueText: `Pago até hoje ${formatCentsToBRL(rhythm.expensePaidCents)}`,
        })}
      </div>
    </section>
  `;
}

export function renderContextualPanel(
  upcoming: DashboardUpcomingItem[],
  attention: DashboardAttentionItem[],
): string {
  const upcomingHtml =
    upcoming.length === 0
      ? `<p class="contextual-panel__empty">Nenhum vencimento ou pendência próxima nesta competência.</p>`
      : `<ul class="commitment-list commitment-list--nested">
        ${upcoming
          .slice(0, 6)
          .map(
            (item) => `
          <li class="commitment-list__item">
            <div class="commitment-list__main">
              <span class="commitment-list__date">${escapeHtml(formatDateLabel(item.date))}</span>
              <span class="commitment-list__label">${escapeHtml(item.label)}</span>
              <span class="commitment-list__origin">${escapeHtml(item.origin)}</span>
            </div>
            <div class="commitment-list__tail">
              ${renderMoney(item.kind === "income" ? item.amountCents : -item.amountCents)}
              <span class="status-chip status-chip--${item.kind === "income" ? "income" : item.kind === "invoice" ? "warning" : "expense"}">${escapeHtml(item.statusLabel)}</span>
            </div>
          </li>`,
          )
          .join("")}
      </ul>`;

  const attentionHtml =
    attention.length === 0
      ? `<p class="contextual-panel__ok">Nenhuma pendência crítica nesta competência.</p>`
      : `<ul class="attention-list attention-list--nested">
        ${attention
          .map(
            (item) => `
          <li class="attention-list__item attention-list__item--${item.severity}">
            <p class="attention-list__message">${escapeHtml(item.message)}</p>
            ${item.route && item.routeLabel ? `<a class="btn btn--text btn--small" href="#${item.route}">${escapeHtml(item.routeLabel)}</a>` : ""}
          </li>`,
          )
          .join("")}
      </ul>`;

  return `
    <section class="panel panel--contextual" aria-labelledby="contextual-title">
      <header class="panel__header panel__header--split">
        <p class="text-overline" id="contextual-title">Compromissos e atenção</p>
        <a class="btn btn--text btn--small" href="#/lancamentos">Ver todos</a>
      </header>
      <div class="panel__body contextual-panel">
        <div class="contextual-panel__section">
          <h3 class="contextual-panel__heading">Próximos compromissos</h3>
          ${upcomingHtml}
        </div>
        <div class="contextual-panel__section">
          <h3 class="contextual-panel__heading">Atenção necessária</h3>
          ${attentionHtml}
        </div>
      </div>
    </section>
  `;
}

export function renderSituationActions(): string {
  return `
    <div class="situation-actions" role="toolbar" aria-label="Ações rápidas">
      <button type="button" class="btn btn--primary" data-action="new-transaction">Novo lançamento</button>
      <a class="situation-actions__link" href="#/faturas">Revisar faturas</a>
      <a class="situation-actions__link" href="#/lancamentos">Ver lançamentos</a>
    </div>
  `;
}

/** @deprecated */
export function renderActionStrip(): string {
  return renderSituationActions();
}

/** @deprecated */
export function renderUpcomingPanel(items: DashboardUpcomingItem[]): string {
  return renderContextualPanel(items, []);
}

/** @deprecated */
export function renderAttentionPanel(items: DashboardAttentionItem[]): string {
  return renderContextualPanel([], items);
}

export function renderEmptyState(input: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaAction?: string;
}): string {
  return `
    <div class="empty-state">
      <p class="empty-state__title">${escapeHtml(input.title)}</p>
      <p class="empty-state__text">${escapeHtml(input.description)}</p>
      ${input.ctaLabel && input.ctaAction ? `<button type="button" class="btn btn--secondary" data-action="${escapeHtml(input.ctaAction)}">${escapeHtml(input.ctaLabel)}</button>` : ""}
    </div>
  `;
}

/** @deprecated */
export function renderEmptyHint(title: string, description: string): string {
  return renderEmptyState({ title, description });
}

export function renderSectionHeader(
  title: string,
  options?: {
    totalCents?: number;
    count?: number;
    countLabel?: (count: number) => string;
    kind?: "income" | "expense";
    meta?: string;
  },
): string {
  const meta: string[] = [];
  if (options?.count !== undefined) {
    const label = options.countLabel ?? formatItemCount;
    meta.push(label(options.count));
  }
  if (options?.totalCents !== undefined) {
    const moneyClass =
      options.kind === "expense"
        ? "money money--negative"
        : options.kind === "income"
          ? "money money--positive"
          : "money";
    meta.push(
      `<span class="${moneyClass}">${escapeHtml(formatCentsToBRL(options.totalCents))}</span>`,
    );
  }
  if (options?.meta) {
    meta.push(escapeHtml(options.meta));
  }

  return `
    <header class="section-header">
      <h2 class="section-header__title">${escapeHtml(title)}</h2>
      ${meta.length > 0 ? `<p class="section-header__meta">${meta.join(" · ")}</p>` : ""}
    </header>
  `;
}

export function renderCompactTableHead(): string {
  return `
    <div class="data-table__head data-table__head--compact" role="row">
      <span class="data-table__cell data-table__cell--date" role="columnheader">Data</span>
      <span class="data-table__cell data-table__cell--desc" role="columnheader">Descrição</span>
      <span class="data-table__cell data-table__cell--status" role="columnheader">Status</span>
      <span class="data-table__cell data-table__cell--amount" role="columnheader">Valor</span>
    </div>
  `;
}

export function renderInvoiceTableHead(): string {
  return `
    <div class="data-table__head data-table__head--invoice" role="row">
      <span class="data-table__cell data-table__cell--date" role="columnheader">Vencimento</span>
      <span class="data-table__cell data-table__cell--desc" role="columnheader">Fatura</span>
      <span class="data-table__cell data-table__cell--card" role="columnheader">Cartão</span>
      <span class="data-table__cell data-table__cell--competence" role="columnheader">Competência</span>
      <span class="data-table__cell data-table__cell--status" role="columnheader">Status</span>
      <span class="data-table__cell data-table__cell--amount" role="columnheader">Valor</span>
      <span class="data-table__cell data-table__cell--actions" role="columnheader"><span class="sr-only">Ações</span></span>
    </div>
  `;
}

export function renderDataTableHead(): string {
  return `
    <div class="data-table__head" role="row">
      <span class="data-table__cell data-table__cell--date" role="columnheader">Data</span>
      <span class="data-table__cell data-table__cell--desc" role="columnheader">Descrição</span>
      <span class="data-table__cell data-table__cell--category" role="columnheader">Categoria</span>
      <span class="data-table__cell data-table__cell--type" role="columnheader">Tipo</span>
      <span class="data-table__cell data-table__cell--status" role="columnheader">Status</span>
      <span class="data-table__cell data-table__cell--amount" role="columnheader">Valor</span>
      <span class="data-table__cell data-table__cell--actions" role="columnheader"><span class="sr-only">Ações</span></span>
    </div>
  `;
}

export function renderTransactionTableRow(item: Transaction): string {
  const statusLabel = transactionStatusLabel(item.kind, item.status, item.ledgerStatus);
  const statusVariant =
    item.ledgerStatus === "in_invoice"
      ? "warning"
      : item.status === "settled"
        ? "success"
        : "warning";
  const typeLabel = item.kind === "income" ? "Receita" : "Despesa";
  const installmentLabel = item.installment
    ? ` <span class="data-table__meta">${item.installment.current}/${item.installment.total}</span>`
    : "";
  const signedAmount =
    item.kind === "expense" && item.expenseKind !== "refund"
      ? -item.amountCents
      : item.expenseKind === "refund"
        ? item.amountCents
        : item.amountCents;

  return `
    <div class="data-table__row" role="row" data-transaction-id="${escapeHtml(item.id)}">
      <span class="data-table__cell data-table__cell--date" role="cell">${escapeHtml(formatDateLabel(item.date))}</span>
      <span class="data-table__cell data-table__cell--desc" role="cell">
        <span class="data-table__primary"${item.description.length > 40 ? ` title="${escapeHtml(item.description)}"` : ""}>${escapeHtml(item.description)}</span>${installmentLabel}
      </span>
      <span class="data-table__cell data-table__cell--category" role="cell">${escapeHtml(item.category)}</span>
      <span class="data-table__cell data-table__cell--type" role="cell">
        <span class="type-chip type-chip--${item.kind}">${typeLabel}</span>
      </span>
      <span class="data-table__cell data-table__cell--status" role="cell">${renderStatusChip(statusLabel, statusVariant)}</span>
      <span class="data-table__cell data-table__cell--amount" role="cell">
        ${renderMoney(signedAmount)}
      </span>
      <span class="data-table__cell data-table__cell--actions" role="cell">
        <div class="row-actions" data-row-actions="${escapeHtml(item.id)}"></div>
      </span>
    </div>
  `;
}

function renderInvoiceAmountCell(invoice: Invoice): string {
  if (invoiceHasCredit(invoice)) {
    return `<span class="money money--positive">${escapeHtml(formatCentsToBRL(invoice.creditBalanceCents ?? 0))}</span>`;
  }
  return renderMoney(-invoiceDebtCents(invoice));
}

function invoiceStatusVariant(invoice: Invoice): "success" | "warning" {
  if (invoiceHasCredit(invoice) || invoice.status === "paid") {
    return "success";
  }
  return "warning";
}

export function renderInvoiceTableRow(input: {
  invoice: Invoice;
  cardName: string;
}): string {
  const statusLabel = invoiceStatusLabel(input.invoice);
  const statusVariant = invoiceStatusVariant(input.invoice);
  return `
    <div class="data-table__row data-table__row--invoice" role="row">
      <span class="data-table__cell data-table__cell--date" role="cell">${escapeHtml(formatDateLabel(input.invoice.dueDate))}</span>
      <span class="data-table__cell data-table__cell--desc" role="cell">
        <span class="data-table__primary">Fatura ${escapeHtml(formatCompetenceLabel(input.invoice.competenceMonth))}</span>
      </span>
      <span class="data-table__cell data-table__cell--card" role="cell">
        <span class="data-table__primary"${input.cardName.length > 24 ? ` title="${escapeHtml(input.cardName)}"` : ""}>${escapeHtml(input.cardName)}</span>
      </span>
      <span class="data-table__cell data-table__cell--competence" role="cell">${escapeHtml(formatCompetenceLabel(input.invoice.competenceMonth))}</span>
      <span class="data-table__cell data-table__cell--status" role="cell">${renderStatusChip(statusLabel, statusVariant)}</span>
      <span class="data-table__cell data-table__cell--amount" role="cell">${renderInvoiceAmountCell(input.invoice)}</span>
      <span class="data-table__cell data-table__cell--actions" role="cell">
        <div class="row-actions" data-invoice-actions="${escapeHtml(input.invoice.id)}"></div>
      </span>
    </div>
  `;
}

export function renderCardPanel(input: {
  card: Card;
  invoice?: Invoice;
  invoiceCount: number;
  single?: boolean;
}): string {
  const { card, invoice, invoiceCount, single = false } = input;
  const cycleParts: string[] = [];
  if (card.closingDay !== null) {
    cycleParts.push(`Fecha dia ${card.closingDay}`);
  }
  if (card.dueDay !== null) {
    cycleParts.push(`vence dia ${card.dueDay}`);
  }
  const cycle =
    cycleParts.length > 0 ? cycleParts.join(" · ") : "Ciclo não configurado";
  const nameAttr = card.name.length > 28 ? ` title="${escapeHtml(card.name)}"` : "";

  return `
    <article class="card-panel${single ? " card-panel--single" : ""}">
      <header class="card-panel__header">
        <div class="card-panel__title-wrap">
          <h3 class="card-panel__name"${nameAttr}>${escapeHtml(card.name)}</h3>
          <p class="card-panel__count">${escapeHtml(formatInvoiceCount(invoiceCount))}</p>
        </div>
      </header>
      <p class="card-panel__cycle">${escapeHtml(cycle)}</p>
      ${
        invoice
          ? `
        <dl class="card-panel__summary">
          <div class="card-panel__summary-item">
            <dt>Fatura atual</dt>
            <dd>${escapeHtml(formatCompetenceLabel(invoice.competenceMonth))}</dd>
          </div>
          <div class="card-panel__summary-item">
            <dt>Vencimento</dt>
            <dd class="card-panel__nowrap">${escapeHtml(formatDateLabel(invoice.dueDate))}</dd>
          </div>
          <div class="card-panel__summary-item">
            <dt>${invoiceHasCredit(invoice) ? "Saldo credor" : "Valor devido"}</dt>
            <dd class="card-panel__money ${invoiceHasCredit(invoice) ? "money money--positive" : "money money--negative"}">${escapeHtml(formatCentsToBRL(invoiceHasCredit(invoice) ? (invoice.creditBalanceCents ?? 0) : invoiceDebtCents(invoice)))}</dd>
          </div>
          <div class="card-panel__summary-item">
            <dt>Status</dt>
            <dd class="card-panel__status">${renderStatusChip(invoiceStatusLabel(invoice), invoiceHasCredit(invoice) || invoice.status === "paid" ? "success" : "warning")}</dd>
          </div>
        </dl>`
          : `<p class="card-panel__empty">Nenhuma fatura registrada para este cartão na competência.</p>`
      }
    </article>
  `;
}

export function renderFilterChip(label: string, value: string): string {
  return `<button type="button" class="filter-chip is-active" data-filter-chip="${escapeHtml(value)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`;
}

export function sectionTotal(items: Transaction[]): number {
  return sumCents(items.map((item) => item.amountCents));
}

export function invoiceTotal(items: Invoice[]): number {
  return sumCents(items.map((item) => invoiceDebtCents(item)));
}

/** @deprecated */
export function renderFinanceSynthesis(summary: CompetenceSummary): string {
  return renderSituationPanel(
    {
      summary,
      updatedAtLabel: "",
      balanceContext: "",
      projection: {
        realizedCents: summary.balanceRealizedCents,
        pendingIncomeCents: summary.incomePendingCents,
        pendingExpenseTxCents: 0,
        openInvoicesCents: 0,
        projectedCents: summary.balancePlannedCents,
      },
      rhythm: {
        daysElapsed: 0,
        daysInMonth: 0,
        monthElapsedPct: 0,
        incomeSettledCents: 0,
        incomePlannedCents: 0,
        incomeSettledPct: null,
        expensePaidCents: 0,
        expensePlannedCents: 0,
        expensePaidPct: null,
      },
      upcoming: [],
      attention: [],
      hasMovement: true,
    },
  );
}

/** @deprecated */
export function renderEditorialHead(
  title: string,
  options?: Parameters<typeof renderSectionHeader>[1],
): string {
  return renderSectionHeader(title, options);
}

/** @deprecated */
export function ledgerTransactionRow(): string {
  return "";
}

/** @deprecated */
export function ledgerInvoiceRow(): string {
  return "";
}

/** @deprecated */
export function renderCardRegistryRow(card: Card): string {
  return `<li class="registry-row"><span>${escapeHtml(card.name)}</span></li>`;
}

export function renderCardSummaryBody(card: Card): string {
  const details: string[] = [];
  if (card.closingDay !== null) {
    details.push(`Fecha dia ${card.closingDay}`);
  }
  if (card.dueDay !== null) {
    details.push(`Vence dia ${card.dueDay}`);
  }
  return `
    <span class="data-table__primary">${escapeHtml(card.name)}</span>
    <span class="data-table__secondary">${escapeHtml(details.join(" · ") || "Sem dias configurados")}</span>
  `;
}
