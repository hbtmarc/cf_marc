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
  invoiceOpenCents,
  invoicePaidCents,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  isInvoiceLinkedExpense,
  sumCents,
  transactionStatusLabel,
  transactionDisplayedAmountCents,
} from "./finance";
import {
  projectedInstallmentCentsForMonth,
  projectedInstallmentsForMonth,
  PROJECTED_STATUS_LABEL,
  type ProjectedInstallment,
} from "./installments";
import {
  buildDashboardCardSummary,
  buildDashboardRecurringSummary,
  type DashboardCardSummary,
  type DashboardRecurringSummary,
} from "./dashboard-executive";
import type {
  AppData,
  Card,
  CompetenceSummary,
  Invoice,
  RoutePath,
  Transaction,
} from "./types";
import { escapeHtml, renderMoney, renderStatusChip } from "./ui";
import { installmentDisplayLabel } from "./installment-label";
import { renderSortableTh, tableColumnHeaderId, TABLE_IDS, type SortableColumnOption } from "./table-ui";
import type { TableSortState } from "./table-sort";
import {
  formatCardCount,
  formatInvoiceCount,
  formatItemCount,
  formatTransactionCount,
} from "./text";

export type BalanceTone = "positive" | "negative" | "neutral";

export interface DashboardProjectedInstallments {
  totalCents: number;
  count: number;
  byCard: Array<{ cardId: string; cardName: string; totalCents: number; count: number }>;
}

export interface DashboardProjection {
  realizedCents: number;
  pendingIncomeCents: number;
  recurringIncomeProjectedCents: number;
  pendingExpenseTxCents: number;
  openInvoicesCents: number;
  projectedInstallmentsCents: number;
  recurringExpenseProjectedCents: number;
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
  projectedInstallments: DashboardProjectedInstallments | null;
  recurringSummary: DashboardRecurringSummary | null;
  cardSummary: DashboardCardSummary | null;
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
  const projectedInstallmentsCents = projectedInstallmentCentsForMonth(data, competenceMonth);
  const projectedItems = projectedInstallmentsForMonth(data, competenceMonth);
  const recurringSummary = buildDashboardRecurringSummary(data, competenceMonth);
  const cardSummary = buildDashboardCardSummary(data, competenceMonth);

  const pendingIncomeTxCents = sumCents(
    incomes
      .filter((item) => item.status === "pending")
      .map((item) => item.amountCents),
  );

  const projection: DashboardProjection = {
    realizedCents: summary.balanceRealizedCents,
    pendingIncomeCents: pendingIncomeTxCents,
    recurringIncomeProjectedCents: summary.recurringIncomeProjectedCents,
    pendingExpenseTxCents,
    openInvoicesCents,
    projectedInstallmentsCents,
    recurringExpenseProjectedCents: summary.recurringExpenseProjectedCents,
    projectedCents: summary.balancePlannedCents,
  };

  const projectedByCard = new Map<string, { totalCents: number; count: number }>();
  for (const item of projectedItems) {
    const current = projectedByCard.get(item.cardId) ?? { totalCents: 0, count: 0 };
    current.totalCents += item.amountCents;
    current.count += 1;
    projectedByCard.set(item.cardId, current);
  }
  const projectedInstallments: DashboardProjectedInstallments | null =
    projectedItems.length > 0
      ? {
          totalCents: projectedInstallmentsCents,
          count: projectedItems.length,
          byCard: [...projectedByCard.entries()]
            .map(([cardId, stats]) => ({
              cardId,
              cardName: data.cards.find((card) => card.id === cardId)?.name ?? "Cartão removido",
              totalCents: stats.totalCents,
              count: stats.count,
            }))
            .sort((a, b) => b.totalCents - a.totalCents),
        }
      : null;

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
    hasMovement:
      transactions.length > 0 ||
      invoices.length > 0 ||
      projectedItems.length > 0 ||
      (recurringSummary?.lines.length ?? 0) > 0,
    projectedInstallments,
    recurringSummary,
    cardSummary,
  };
}

export function renderSituationPanel(ctx: DashboardContext): string {
  const tone = balanceTone(ctx.summary.balanceRealizedCents);
  const committed =
    ctx.summary.incomePendingCents +
    ctx.projection.pendingExpenseTxCents +
    ctx.projection.openInvoicesCents +
    (ctx.projectedInstallments?.totalCents ?? 0) +
    ctx.summary.recurringExpenseProjectedCents;
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
  const realizedTone = balanceTone(ctx.projection.realizedCents);
  const rows: Array<{
    label: string;
    value: number;
    sign: string;
    tone: "positive" | "negative" | "neutral" | "deduction" | "projected";
  }> = [
    { label: "Saldo realizado", value: ctx.projection.realizedCents, sign: "", tone: realizedTone },
  ];

  if (ctx.projection.pendingIncomeCents > 0) {
    rows.push({
      label: "Receitas previstas",
      value: ctx.projection.pendingIncomeCents,
      sign: "+",
      tone: "neutral",
    });
  }
  if (ctx.projection.recurringIncomeProjectedCents > 0) {
    rows.push({
      label: "Recorrências de receita",
      value: ctx.projection.recurringIncomeProjectedCents,
      sign: "+",
      tone: "projected",
    });
  }
  if (ctx.projection.pendingExpenseTxCents > 0) {
    rows.push({
      label: "Despesas diretas pendentes",
      value: ctx.projection.pendingExpenseTxCents,
      sign: "−",
      tone: "deduction",
    });
  }
  if (ctx.projection.openInvoicesCents > 0) {
    rows.push({
      label: "Faturas em aberto",
      value: ctx.projection.openInvoicesCents,
      sign: "−",
      tone: "deduction",
    });
  }
  if (ctx.projection.projectedInstallmentsCents > 0) {
    rows.push({
      label: "Parcelas projetadas",
      value: ctx.projection.projectedInstallmentsCents,
      sign: "−",
      tone: "projected",
    });
  }
  if (ctx.projection.recurringExpenseProjectedCents > 0) {
    rows.push({
      label: "Recorrências projetadas",
      value: ctx.projection.recurringExpenseProjectedCents,
      sign: "−",
      tone: "projected",
    });
  }

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
              <span class="projection-breakdown__value">${
                row.label === "Saldo realizado"
                  ? renderMoney(row.value)
                  : `${row.sign}${renderMoney(row.value === 0 ? 0 : Math.abs(row.value))}`
              }</span>
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

function recurringStateVariant(
  state: DashboardRecurringSummary["lines"][number]["state"],
): "success" | "neutral" | "warning" {
  if (state === "matched") {
    return "success";
  }
  if (state === "covered_by_invoice") {
    return "neutral";
  }
  return "warning";
}

export function renderRecurringSummaryPanel(
  recurring: DashboardRecurringSummary | null,
): string {
  if (!recurring) {
    return "";
  }

  return `
    <section class="panel panel--dashboard-recurring" aria-labelledby="dashboard-recurring-title">
      <header class="panel__header panel__header--split">
        <div>
          <p class="text-overline" id="dashboard-recurring-title">Recorrências do mês</p>
          <p class="panel__context">
            Previstas:
            <span class="money money--positive">${escapeHtml(formatCentsToBRL(recurring.incomeProjectedCents))}</span>
            ·
            <span class="money money--projected">${escapeHtml(formatCentsToBRL(recurring.expenseProjectedCents))}</span>
            · ${escapeHtml(formatTransactionCount(recurring.projectedCount))} prevista${recurring.projectedCount === 1 ? "" : "s"}
            · ${recurring.matchedCount} conciliada${recurring.matchedCount === 1 ? "" : "s"}
            · ${recurring.coveredCount} coberta${recurring.coveredCount === 1 ? "" : "s"} por fatura
          </p>
        </div>
        <a class="btn btn--ghost btn--compact" href="#/planejamento">Ver planejamento</a>
      </header>
      <div class="panel__body">
        ${
          recurring.lines.length === 0
            ? `<p class="dashboard-recurring__empty">Nenhuma ocorrência recorrente nesta competência.</p>`
            : `<ul class="dashboard-recurring-list">
              ${recurring.lines
                .map((line) => {
                  const moneyClass =
                    line.kind === "income"
                      ? line.state === "projected"
                        ? "money money--projected"
                        : "money money--positive"
                      : line.state === "projected"
                        ? "money money--projected"
                        : "money money--negative";
                  const cardMeta =
                    line.cardName !== undefined
                      ? `<span class="dashboard-recurring-list__card">${escapeHtml(line.cardName)}</span>`
                      : "";
                  return `
                <li class="dashboard-recurring-list__item">
                  <div class="dashboard-recurring-list__main">
                    <span class="dashboard-recurring-list__date">${escapeHtml(formatDateLabel(line.expectedDate))}</span>
                    <span class="dashboard-recurring-list__label">${escapeHtml(line.description)}</span>
                    ${cardMeta}
                  </div>
                  <div class="dashboard-recurring-list__tail">
                    <span class="${moneyClass}">${escapeHtml(formatCentsToBRL(line.amountCents))}</span>
                    ${renderStatusChip(line.stateLabel, recurringStateVariant(line.state))}
                  </div>
                </li>`;
                })
                .join("")}
            </ul>`
        }
      </div>
    </section>
  `;
}

export function renderCardSummaryPanel(cardSummary: DashboardCardSummary | null): string {
  if (!cardSummary || cardSummary.cards.length === 0) {
    return "";
  }

  return `
    <section class="panel panel--dashboard-cards" aria-labelledby="dashboard-cards-title">
      <header class="panel__header panel__header--split">
        <div>
          <p class="text-overline" id="dashboard-cards-title">Cartões e faturas</p>
          <p class="panel__context">
            Total ${escapeHtml(formatCentsToBRL(cardSummary.footerTotalCents))}
            · Em aberto ${escapeHtml(formatCentsToBRL(cardSummary.footerOpenCents))}
            · ${escapeHtml(formatCardCount(cardSummary.attentionCount))} exig${cardSummary.attentionCount === 1 ? "e" : "em"} atenção
          </p>
        </div>
        <a class="btn btn--ghost btn--compact" href="#/faturas">Ver faturas</a>
      </header>
      <div class="panel__body">
        <ul class="dashboard-card-list">
          ${cardSummary.cards
            .slice(0, 5)
            .map((card) => {
              const statusVariant =
                card.mode === "projected"
                  ? "neutral"
                  : card.needsAttention
                    ? "warning"
                    : "success";
              const statusChip =
                card.mode === "projected"
                  ? `<span class="status-chip status-chip--projected">PROJETADA</span>`
                  : renderStatusChip(card.statusLabel, statusVariant);
              return `
            <li class="dashboard-card-list__item">
              <div class="dashboard-card-list__main">
                <span class="dashboard-card-list__name">${escapeHtml(card.cardName)}</span>
                <span class="dashboard-card-list__meta">${
                  card.mode === "projected"
                    ? "Fatura projetada"
                    : `Venc. ${escapeHtml(card.dueDate)}`
                }</span>
              </div>
              <dl class="dashboard-card-list__metrics">
                <div><dt>Total</dt><dd>${renderNominalMoney(card.totalCents)}</dd></div>
                <div><dt>Pago</dt><dd>${renderNominalMoney(card.paidCents)}</dd></div>
                <div><dt>Em aberto</dt><dd>${renderNominalMoney(card.openCents, card.openCents > 0 ? "negative" : "neutral")}</dd></div>
                <div><dt>Status</dt><dd>${statusChip}</dd></div>
              </dl>
            </li>`;
            })
            .join("")}
        </ul>
      </div>
    </section>
  `;
}

export function renderProjectedInstallmentsPanel(
  projected: DashboardProjectedInstallments | null,
): string {
  if (!projected || projected.count === 0) {
    return "";
  }

  const visibleCards = projected.byCard.slice(0, 5);
  const hiddenCount = projected.byCard.length - visibleCards.length;

  return `
    <section class="panel panel--projected-installments" aria-labelledby="projected-installments-title">
      <header class="panel__header">
        <div>
          <p class="text-overline" id="projected-installments-title">Parcelas projetadas</p>
          <p class="panel__context">${escapeHtml(formatTransactionCount(projected.count))} · ${escapeHtml(formatCentsToBRL(projected.totalCents))}</p>
        </div>
      </header>
      <div class="panel__body">
        <ul class="projected-installments-list">
          ${visibleCards
            .map(
              (card) => `
            <li class="projected-installments-list__item">
              <span class="projected-installments-list__label">${escapeHtml(card.cardName)}</span>
              <span class="projected-installments-list__meta">${escapeHtml(formatTransactionCount(card.count))}</span>
              <span class="projected-installments-list__value money money--negative">${escapeHtml(formatCentsToBRL(card.totalCents))}</span>
            </li>`,
            )
            .join("")}
        </ul>
        ${
          hiddenCount > 0
            ? `<p class="projected-installments-list__more">${escapeHtml(formatCardCount(hiddenCount))} adicionais não exibidos.</p>`
            : ""
        }
        <div class="panel__actions">
          <a class="btn btn--secondary btn--compact" href="#/lancamentos">Ver lançamentos</a>
        </div>
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

export type DashboardRecentSortColumn =
  | "date"
  | "description"
  | "type"
  | "status"
  | "amount";

export const DASHBOARD_RECENT_SORT_COLUMNS: SortableColumnOption<DashboardRecentSortColumn>[] = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "type", label: "Tipo" },
  { id: "status", label: "Status" },
  { id: "amount", label: "Valor" },
];

export function renderDashboardRecentTableHead(
  state: TableSortState<DashboardRecentSortColumn>,
): string {
  return renderSortableTableHead(
    DASHBOARD_RECENT_SORT_COLUMNS,
    state,
    "",
    TABLE_IDS.dashboardRecent,
  );
}

export function renderDashboardRecentHeader(summary: CompetenceSummary): string {
  return `
    <header class="section-header dashboard-recent__header">
      <div>
        <h2 class="section-header__title">Transações recentes</h2>
        <p class="section-header__meta">
          Receitas do mês:
          <span class="money money--positive">${escapeHtml(formatCentsToBRL(summary.incomeSettledCents))}</span>
          · Despesas do mês:
          <span class="money money--negative">${escapeHtml(formatCentsToBRL(summary.expensePaidCents))}</span>
        </p>
      </div>
      <a class="btn btn--ghost btn--compact" href="#/lancamentos">Ver lançamentos</a>
    </header>`;
}

export function renderDashboardRecentRow(item: Transaction): string {
  const statusLabel = transactionStatusLabel(item.kind, item.status, item.ledgerStatus);
  const statusVariant =
    item.ledgerStatus === "in_invoice"
      ? "warning"
      : item.status === "settled"
        ? "success"
        : "warning";
  const typeLabel = transactionTypeLabel(item);
  const typeChipClass = transactionTypeChipClass(item);
  const signedAmount = transactionDisplayedAmountCents(item);
  const tableId = TABLE_IDS.dashboardRecent;
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);

  return `
    <tr data-transaction-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatDateLabel(item.date))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${item.description.length > 40 ? ` title="${escapeHtml(item.description)}"` : ""}>${escapeHtml(item.description)}</span>
        <span class="data-table__secondary">${escapeHtml(item.category)}</span>
      </td>
      <td class="cfm-table__cell--type" ${h("type")} data-label="Tipo">
        <span class="type-chip type-chip--${typeChipClass}">${typeLabel}</span>
      </td>
      <td class="cfm-table__cell--status" ${h("status")} data-label="Status">${renderStatusChip(statusLabel, statusVariant)}</td>
      <td class="cfm-table__cell--amount" ${h("amount")} data-label="Valor">${renderMoney(signedAmount)}</td>
    </tr>
  `;
}

export function renderSortableTableHead<C extends string>(
  columns: SortableColumnOption<C>[],
  state: TableSortState<C>,
  extraHeadCells = "",
  tableId = "table",
): string {
  return `<thead><tr>${columns
    .map((column) =>
      renderSortableTh(
        column,
        state,
        `cfm-table__cell--${column.id}`,
        tableColumnHeaderId(tableId, column.id),
      ),
    )
    .join("")}${extraHeadCells}</tr></thead>`;
}

export function renderInvoiceTableHead<C extends string>(
  columns: SortableColumnOption<C>[],
  state: TableSortState<C>,
): string {
  return renderSortableTableHead(
    columns,
    state,
    `${renderInvoiceTableViewHead()}${renderInvoiceTableActionsHead()}`,
    TABLE_IDS.invoices,
  );
}

export function renderLancamentosTableHead<C extends string>(
  columns: SortableColumnOption<C>[],
  state: TableSortState<C>,
  tableId: string = TABLE_IDS.lancamentos,
): string {
  return renderSortableTableHead(
    columns,
    state,
    `<th scope="col" id="${tableColumnHeaderId(tableId, "actions")}" class="cfm-table__cell--actions"><span class="sr-only">Ações</span></th>`,
    tableId,
  );
}

export function renderInvoiceTransactionTableHead<C extends string>(
  columns: SortableColumnOption<C>[],
  state: TableSortState<C>,
): string {
  return renderSortableTableHead(columns, state, "", TABLE_IDS.invoiceDetail);
}

function tableCellHeaders(tableId: string, columnId: string): string {
  return `headers="${escapeHtml(tableColumnHeaderId(tableId, columnId))}"`;
}

export function transactionTypeLabel(item: Transaction): string {
  if (item.kind === "income") {
    return "Receita";
  }
  switch (item.expenseKind) {
    case "fee":
      return "Tarifa";
    case "refund":
      return "Estorno";
    case "expense":
    default:
      return "Despesa";
  }
}

function transactionTypeChipClass(item: Transaction): string {
  if (item.kind === "income") {
    return "income";
  }
  switch (item.expenseKind) {
    case "fee":
      return "fee";
    case "refund":
      return "refund";
    case "expense":
    default:
      return "expense";
  }
}

export function renderTransactionTableRow(
  item: Transaction,
  tableId: string = TABLE_IDS.lancamentos,
  options?: { includeType?: boolean },
): string {
  const includeType = options?.includeType !== false;
  const statusLabel = transactionStatusLabel(item.kind, item.status, item.ledgerStatus);
  const statusVariant =
    item.ledgerStatus === "in_invoice"
      ? "warning"
      : item.status === "settled"
        ? "success"
        : "warning";
  const typeLabel = transactionTypeLabel(item);
  const typeChipClass = transactionTypeChipClass(item);
  const installmentLabel = item.installment
    ? ` <span class="data-table__meta">${item.installment.current}/${item.installment.total}</span>`
    : "";
  const signedAmount = transactionDisplayedAmountCents(item);
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);
  const typeCell = includeType
    ? `<td class="cfm-table__cell--type" ${h("type")} data-label="Tipo">
        <span class="type-chip type-chip--${typeChipClass}">${typeLabel}</span>
      </td>`
    : "";

  return `
    <tr data-transaction-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatDateLabel(item.date))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${item.description.length > 40 ? ` title="${escapeHtml(item.description)}"` : ""}>${escapeHtml(item.description)}</span>${installmentLabel}
      </td>
      <td class="cfm-table__cell--category" ${h("category")} data-label="Categoria">${escapeHtml(item.category)}</td>
      ${typeCell}
      <td class="cfm-table__cell--status" ${h("status")} data-label="Status">${renderStatusChip(statusLabel, statusVariant)}</td>
      <td class="cfm-table__cell--amount" ${h("amount")} data-label="Valor">
        ${renderMoney(signedAmount)}
      </td>
      <td class="cfm-table__cell--actions" ${h("actions")} data-label="Ações">
        <div class="row-actions" data-row-actions="${escapeHtml(item.id)}"></div>
      </td>
    </tr>
  `;
}

export function renderIncomeTransactionTableRow(
  item: Transaction,
  tableId: string = TABLE_IDS.lancamentosIncome,
): string {
  return renderTransactionTableRow(item, tableId, { includeType: false });
}

export function renderProjectedInstallmentRow(
  item: ProjectedInstallment,
  tableId: string = TABLE_IDS.lancamentos,
): string {
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);
  const installmentLabel = ` <span class="data-table__meta">${item.installment.current}/${item.installment.total}</span>`;

  return `
    <tr class="cfm-table__row--projected" data-projected-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatCompetenceLabel(item.competenceMonth))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${item.description.length > 40 ? ` title="${escapeHtml(item.description)}"` : ""}>${escapeHtml(item.description)}</span>${installmentLabel}
      </td>
      <td class="cfm-table__cell--category" ${h("category")} data-label="Categoria">${escapeHtml(item.category)}</td>
      <td class="cfm-table__cell--type" ${h("type")} data-label="Tipo">
        <span class="type-chip type-chip--expense">Despesa</span>
      </td>
      <td class="cfm-table__cell--status" ${h("status")} data-label="Status">
        <span class="status-chip status-chip--projected">${escapeHtml(PROJECTED_STATUS_LABEL.toUpperCase())}</span>
      </td>
      <td class="cfm-table__cell--amount" ${h("amount")} data-label="Valor">
        ${renderMoney(-item.amountCents)}
      </td>
      <td class="cfm-table__cell--actions" ${h("actions")} data-label="Ações">
        <span class="sr-only">Sem ações disponíveis para parcela projetada</span>
      </td>
    </tr>
  `;
}

export function renderNominalMoney(
  cents: number,
  variant: "neutral" | "positive" | "negative" = "neutral",
): string {
  const normalized = cents === 0 || Object.is(cents, -0) ? 0 : Math.abs(cents);
  const cls =
    variant === "positive"
      ? "money money--positive"
      : variant === "negative"
        ? "money money--negative"
        : "money";
  return `<span class="${cls}">${escapeHtml(formatCentsToBRL(normalized))}</span>`;
}

function invoiceTotalLabel(invoice: Invoice): string {
  return invoiceHasCredit(invoice) ? "Total líquido" : "Total da fatura";
}

function renderCardPanelFinancialItems(invoice: Invoice): string {
  const total = invoiceTotalCentsValue(invoice);
  const paid = invoicePaidCents(invoice);
  const open = invoiceOpenCents(invoice);
  const credit = invoice.creditBalanceCents ?? 0;
  const statusLabel = invoiceStatusLabel(invoice);
  const statusVariant =
    invoiceHasCredit(invoice) || invoice.status === "paid" ? "success" : "warning";

  const openItem = `<div class="card-panel__summary-item">
      <dt>Em aberto</dt>
      <dd class="card-panel__money">${renderNominalMoney(open, open > 0 ? "negative" : "neutral")}</dd>
    </div>`;

  const creditItem =
    credit > 0
      ? `<div class="card-panel__summary-item">
      <dt>Saldo credor</dt>
      <dd class="card-panel__money">${renderNominalMoney(credit, "positive")}</dd>
    </div>`
      : "";

  return [
    `<div class="card-panel__summary-item">
      <dt>${escapeHtml(invoiceTotalLabel(invoice))}</dt>
      <dd class="card-panel__money">${renderNominalMoney(total)}</dd>
    </div>`,
    `<div class="card-panel__summary-item">
      <dt>Pago</dt>
      <dd class="card-panel__money">${renderNominalMoney(paid)}</dd>
    </div>`,
    openItem,
    creditItem,
    `<div class="card-panel__summary-item">
      <dt>Status</dt>
      <dd class="card-panel__status">${renderStatusChip(statusLabel, statusVariant)}</dd>
    </div>`,
  ]
    .filter(Boolean)
    .join("");
}

function invoiceStatusVariant(invoice: Invoice): "success" | "warning" {
  if (invoiceHasCredit(invoice) || invoice.status === "paid") {
    return "success";
  }
  return "warning";
}

function renderInvoiceOpenCell(invoice: Invoice): string {
  const credit = invoice.creditBalanceCents ?? 0;
  if (credit > 0) {
    return renderNominalMoney(credit, "positive");
  }
  const open = invoiceOpenCents(invoice);
  return renderNominalMoney(open, open > 0 ? "negative" : "neutral");
}

export function renderInvoiceTableRow(input: {
  invoice: Invoice;
  cardName: string;
  expanded?: boolean;
  detailPanelId?: string;
  tableId?: string;
}): string {
  const { invoice, cardName, expanded = false, detailPanelId = "", tableId = TABLE_IDS.invoices } = input;
  const statusLabel = invoiceStatusLabel(invoice);
  const statusVariant = invoiceStatusVariant(invoice);
  const total = invoiceTotalCentsValue(invoice);
  const controlsAttr =
    detailPanelId.length > 0 ? ` aria-controls="${escapeHtml(detailPanelId)}"` : "";
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);

  return `
    <tr class="cfm-table__row--invoice" data-invoice-row="${escapeHtml(invoice.id)}">
      <td class="cfm-table__cell--dueDate" ${h("dueDate")} data-label="Vencimento">${escapeHtml(formatDateLabel(invoice.dueDate))}</td>
      <td class="cfm-table__cell--fatura" ${h("fatura")} data-label="Fatura">
        <span class="data-table__primary">Fatura ${escapeHtml(formatCompetenceLabel(invoice.competenceMonth))}</span>
      </td>
      <td class="cfm-table__cell--card" ${h("card")} data-label="Cartão">
        <span class="data-table__primary"${cardName.length > 24 ? ` title="${escapeHtml(cardName)}"` : ""}>${escapeHtml(cardName)}</span>
      </td>
      <td class="cfm-table__cell--competence" ${h("competence")} data-label="Competência">${escapeHtml(formatCompetenceLabel(invoice.competenceMonth))}</td>
      <td class="cfm-table__cell--status" ${h("status")} data-label="Status">${renderStatusChip(statusLabel, statusVariant)}</td>
      <td class="cfm-table__cell--total" ${h("total")} data-label="Total">${renderNominalMoney(total)}</td>
      <td class="cfm-table__cell--open" ${h("open")} data-label="Em aberto">${renderInvoiceOpenCell(invoice)}</td>
      <td class="cfm-table__cell--view" ${h("view")} data-label="Ação">
        <button
          type="button"
          class="btn btn--ghost btn--compact invoice-view-btn"
          data-invoice-view="${escapeHtml(invoice.id)}"
          aria-expanded="${expanded ? "true" : "false"}"
          ${controlsAttr}
        >Ver fatura</button>
      </td>
      <td class="cfm-table__cell--actions" ${h("actions")} data-label="Mais ações">
        <div class="row-actions" data-invoice-actions="${escapeHtml(invoice.id)}"></div>
      </td>
    </tr>
  `;
}

export function renderInvoiceTableActionsHead(tableId: string = TABLE_IDS.invoices): string {
  return `<th scope="col" id="${tableColumnHeaderId(tableId, "actions")}" class="cfm-table__cell--actions"><span class="sr-only">Mais ações</span></th>`;
}

export function renderInvoiceTableViewHead(tableId: string = TABLE_IDS.invoices): string {
  return `<th scope="col" id="${tableColumnHeaderId(tableId, "view")}" class="cfm-table__cell--view">Ação</th>`;
}

export function renderInvoiceTransactionRow(
  item: Transaction,
  tableId: string = TABLE_IDS.invoiceDetail,
): string {
  const typeLabel = transactionTypeLabel(item);
  const typeChipClass = transactionTypeChipClass(item);
  const installment = installmentDisplayLabel(item);
  const amountVariant = item.expenseKind === "refund" ? "positive" : "neutral";
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);

  return `
    <tr class="cfm-table__row--invoice-line">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatDateLabel(item.date))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${item.description.length > 40 ? ` title="${escapeHtml(item.description)}"` : ""}>${escapeHtml(item.description)}</span>
      </td>
      <td class="cfm-table__cell--installment" ${h("installment")} data-label="Parcela">${escapeHtml(installment)}</td>
      <td class="cfm-table__cell--category" ${h("category")} data-label="Categoria">${escapeHtml(item.category)}</td>
      <td class="cfm-table__cell--type" ${h("type")} data-label="Tipo">
        <span class="type-chip type-chip--${typeChipClass}">${typeLabel}</span>
      </td>
      <td class="cfm-table__cell--amount" ${h("amount")} data-label="Valor">${renderNominalMoney(item.amountCents, amountVariant)}</td>
    </tr>
  `;
}

export function renderInvoiceDetailPanel(input: {
  invoice: Invoice;
  cardName: string;
  transactions: Transaction[];
  panelId: string;
  sortColumns: SortableColumnOption<string>[];
  sortState: TableSortState<string>;
  mobileSortControlId: string;
  mobileSortMarkup: string;
}): string {
  const {
    invoice,
    cardName,
    transactions,
    panelId,
    sortColumns,
    sortState,
    mobileSortControlId,
    mobileSortMarkup,
  } = input;
  const total = invoiceTotalCentsValue(invoice);
  const paid = invoicePaidCents(invoice);
  const open = invoiceOpenCents(invoice);
  const credit = invoice.creditBalanceCents ?? 0;
  const statusLabel = invoiceStatusLabel(invoice);
  const statusVariant = invoiceStatusVariant(invoice);
  const closingLabel = invoice.closingDate
    ? formatDateLabel(invoice.closingDate)
    : "—";

  const summaryItems = [
    `<div class="invoice-detail__metric"><dt>${escapeHtml(invoiceTotalLabel(invoice))}</dt><dd>${renderNominalMoney(total)}</dd></div>`,
    `<div class="invoice-detail__metric"><dt>Pago</dt><dd>${renderNominalMoney(paid)}</dd></div>`,
    credit > 0
      ? `<div class="invoice-detail__metric"><dt>Saldo credor</dt><dd>${renderNominalMoney(credit, "positive")}</dd></div>`
      : `<div class="invoice-detail__metric"><dt>Em aberto</dt><dd>${renderNominalMoney(open, open > 0 ? "negative" : "neutral")}</dd></div>`,
  ].join("");

  const linesBody =
    transactions.length === 0
      ? `<p class="invoice-detail__empty">Nenhum lançamento detalhado foi importado para esta fatura.</p>`
      : `
        ${mobileSortMarkup}
        <table class="cfm-table cfm-table--invoice-lines" aria-label="Lançamentos da fatura" data-sort-table="${escapeHtml(mobileSortControlId)}">
          ${renderInvoiceTransactionTableHead(sortColumns, sortState)}
          <tbody>
            ${transactions.map((item) => renderInvoiceTransactionRow(item)).join("")}
          </tbody>
        </table>`;

  return `
    <section class="invoice-detail" id="${escapeHtml(panelId)}" aria-labelledby="${escapeHtml(panelId)}-title">
      <header class="invoice-detail__header">
        <div class="invoice-detail__heading">
          <h3 class="invoice-detail__title" id="${escapeHtml(panelId)}-title">${escapeHtml(cardName)}</h3>
          <p class="invoice-detail__meta">${escapeHtml(formatCompetenceLabel(invoice.competenceMonth))} · Fechamento ${escapeHtml(closingLabel)} · Vencimento ${escapeHtml(formatDateLabel(invoice.dueDate))}</p>
        </div>
        <div class="invoice-detail__status">${renderStatusChip(statusLabel, statusVariant)}</div>
      </header>
      <dl class="invoice-detail__summary">${summaryItems}</dl>
      <p class="invoice-detail__count">${escapeHtml(formatTransactionCount(transactions.length))} observado${transactions.length === 1 ? "" : "s"}</p>
      ${linesBody}
    </section>
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
          ${renderCardPanelFinancialItems(invoice)}
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
        recurringIncomeProjectedCents: summary.recurringIncomeProjectedCents,
        pendingExpenseTxCents: 0,
        openInvoicesCents: 0,
        projectedInstallmentsCents: 0,
        recurringExpenseProjectedCents: summary.recurringExpenseProjectedCents,
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
      projectedInstallments: null,
      recurringSummary: null,
      cardSummary: null,
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

export function renderLedgerCardBlock(input: {
  groupKey: string;
  cardName: string;
  competenceMonth: string;
  mode: "real" | "projected";
  statusLabel: string;
  totalCents: number;
  paidCents: number;
  openCents: number;
  lineCount: number;
  expanded: boolean;
  detailPanelId: string;
}): string {
  const title =
    input.mode === "real"
      ? `${escapeHtml(input.cardName)} · Fatura ${escapeHtml(formatCompetenceLabel(input.competenceMonth))}`
      : `${escapeHtml(input.cardName)} · Projeção de fatura`;
  const statusChip =
    input.mode === "projected"
      ? `<span class="status-chip status-chip--projected">${escapeHtml(PROJECTED_STATUS_LABEL.toUpperCase())}</span>`
      : renderStatusChip(input.statusLabel, input.openCents > 0 ? "warning" : "success");
  const expandLabel = input.expanded ? "Ocultar detalhes" : "Ver detalhes";

  return `
    <article class="ledger-card-block" data-ledger-key="${escapeHtml(input.groupKey)}">
      <div class="ledger-card-block__summary">
        <div class="ledger-card-block__heading">
          <h3 class="ledger-card-block__title">${title}</h3>
          <p class="ledger-card-block__meta">${escapeHtml(formatCompetenceLabel(input.competenceMonth))} · ${input.lineCount} lançamento${input.lineCount === 1 ? "" : "s"}</p>
        </div>
        <dl class="ledger-card-block__metrics">
          <div><dt>Status</dt><dd>${statusChip}</dd></div>
          <div><dt>Total</dt><dd>${renderNominalMoney(input.totalCents)}</dd></div>
          <div><dt>Pago</dt><dd>${renderNominalMoney(input.paidCents)}</dd></div>
          <div><dt>Em aberto</dt><dd>${renderNominalMoney(input.openCents, input.openCents > 0 ? "negative" : "neutral")}</dd></div>
        </dl>
        <button
          type="button"
          class="btn btn--ghost btn--compact ledger-card-block__toggle"
          data-ledger-toggle="${escapeHtml(input.groupKey)}"
          aria-expanded="${input.expanded ? "true" : "false"}"
          aria-controls="${escapeHtml(input.detailPanelId)}"
        >${expandLabel}</button>
      </div>
      <div
        class="ledger-card-block__detail${input.expanded ? "" : " ledger-card-block__detail--hidden"}"
        id="${escapeHtml(input.detailPanelId)}"
        ${input.expanded ? "" : "hidden"}
      ></div>
    </article>`;
}

export function renderLedgerProjectedDetailRow(
  item: ProjectedInstallment,
  tableId: string = TABLE_IDS.lancamentosCardsDetail,
): string {
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);
  return `
    <tr class="cfm-table__row--projected" data-projected-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatCompetenceLabel(item.competenceMonth))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary">${escapeHtml(item.description)}</span>
        <span class="status-chip status-chip--projected">${escapeHtml(PROJECTED_STATUS_LABEL.toUpperCase())}</span>
      </td>
      <td class="cfm-table__cell--installment" ${h("installment")} data-label="Parcela">${item.installment.current}/${item.installment.total}</td>
      <td class="cfm-table__cell--category" ${h("category")} data-label="Categoria">${escapeHtml(item.category)}</td>
      <td class="cfm-table__cell--type" ${h("type")} data-label="Tipo">
        <span class="type-chip type-chip--expense">Despesa</span>
      </td>
      <td class="cfm-table__cell--amount" ${h("amount")} data-label="Valor">${renderMoney(-item.amountCents)}</td>
    </tr>`;
}
