import {
  formatCentsToBRL,
  formatCompetenceLabel,
  formatDateLabel,
  invoiceDebtCents,
  invoiceHasCredit,
  invoiceOpenCents,
  invoicePaidCents,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  sumCents,
  transactionStatusLabel,
  transactionDisplayedAmountCents,
} from "./finance";
import { PROJECTED_STATUS_LABEL, type ProjectedInstallment } from "./installments";
import { recurringCycleIcon } from "./icons";
import { recurringTransactionAccessibleLabel } from "./recurrence-class";
import {
  projectedInstallmentDisplayDescription,
  transactionDisplayDescription,
} from "./transaction-aliases";
import {
  type DashboardFixedBillsSummary,
  type DashboardInvoicesSummary,
} from "./dashboard-executive";
import type {
  AppData,
  Card,
  CompetenceSummary,
  Invoice,
  RecurrenceClass,
  Transaction,
} from "./types";
import { escapeHtml, renderMoney, renderStatusChip } from "./ui";
import { installmentDisplayLabel } from "./installment-label";
import { renderSortableTh, tableColumnHeaderId, TABLE_IDS, type SortableColumnOption } from "./table-ui";
import type { TableSortState } from "./table-sort";
import {
  formatInvoiceCount,
  formatItemCount,
  formatTransactionCount,
} from "./text";

export type BalanceTone = "positive" | "negative" | "neutral";

function dashboardKpiMoneyClass(
  cents: number,
  kind: "income" | "expense" | "balance" | "planned",
): string {
  if (kind === "income") {
    return cents > 0 ? "money money--positive" : "money";
  }
  if (kind === "expense") {
    return cents > 0 ? "money money--negative" : "money";
  }
  const tone = balanceTone(cents);
  if (tone === "positive") {
    return "money money--positive";
  }
  if (tone === "negative") {
    return "money money--negative";
  }
  return "money";
}

function dashboardFixedBillStatusVariant(
  status: DashboardFixedBillsSummary["lines"][number]["statusLabel"],
): "success" | "warning" | "neutral" {
  if (status === "PAGA") {
    return "success";
  }
  if (status === "PENDENTE") {
    return "warning";
  }
  return "neutral";
}

function dashboardInvoiceStatusVariant(
  statusLabel: string,
  mode: DashboardInvoicesSummary["lines"][number]["mode"],
): "success" | "warning" | "neutral" {
  if (mode === "projected") {
    return "neutral";
  }
  if (statusLabel === "Paga" || statusLabel === "Credora") {
    return "success";
  }
  if (statusLabel === "Parcial" || statusLabel === "Aberta") {
    return "warning";
  }
  return "neutral";
}

export function renderDashboardSituationPanel(summary: CompetenceSummary): string {
  const kpis = [
    { id: "income", label: "Receitas", cents: summary.incomeSettledCents, kind: "income" as const },
    { id: "expense", label: "Despesas", cents: summary.expensePaidCents, kind: "expense" as const },
    { id: "balance", label: "Saldo", cents: summary.balanceRealizedCents, kind: "balance" as const },
    {
      id: "planned",
      label: "Saldo projetado",
      cents: summary.balancePlannedCents,
      kind: "planned" as const,
    },
  ];

  return `
    <section class="panel dashboard-situation" aria-labelledby="dashboard-situation-title">
      <header class="panel__header panel__header--compact">
        <h2 class="panel__title" id="dashboard-situation-title">Situação financeira</h2>
      </header>
      <div class="panel__body">
        <div class="dashboard-kpi-grid" role="list">
          ${kpis
            .map(
              (kpi) => `
            <div class="dashboard-kpi" role="listitem">
              <span class="dashboard-kpi__label">${escapeHtml(kpi.label)}</span>
              <span class="dashboard-kpi__value ${dashboardKpiMoneyClass(kpi.cents, kpi.kind)}">${escapeHtml(formatCentsToBRL(kpi.cents))}</span>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

export function renderDashboardFixedBillsPanel(fixed: DashboardFixedBillsSummary): string {
  const rows =
    fixed.lines.length > 0
      ? `<ul class="dashboard-list dashboard-list--fixed-bills">
          ${fixed.lines
            .map(
              (line) => `
            <li class="dashboard-list__item">
              <div class="dashboard-list__main">
                <span class="dashboard-list__title">${escapeHtml(line.name)}</span>
                <span class="dashboard-list__meta">${escapeHtml(line.dateLabel)}</span>
              </div>
              <div class="dashboard-list__tail">
                <span class="money money--negative">${escapeHtml(formatCentsToBRL(line.amountCents))}</span>
                ${renderStatusChip(line.statusLabel, dashboardFixedBillStatusVariant(line.statusLabel))}
              </div>
            </li>`,
            )
            .join("")}
        </ul>
        <div class="dashboard-list__subtotal">
          <span>Subtotal</span>
          <span class="money money--negative">${escapeHtml(formatCentsToBRL(fixed.subtotalCents))}</span>
        </div>`
      : `<p class="dashboard-list__empty">Nenhuma despesa fixa nesta competência.</p>`;

  return `
    <section class="panel dashboard-fixed-bills" aria-labelledby="dashboard-fixed-bills-title">
      <header class="panel__header panel__header--split">
        <h2 class="panel__title" id="dashboard-fixed-bills-title">Despesas fixas</h2>
        <a class="btn btn--ghost btn--compact" href="#/planejamento">Ver planejamento</a>
      </header>
      <div class="panel__body">${rows}</div>
    </section>
  `;
}

export function renderDashboardInvoicesPanel(summary: DashboardInvoicesSummary | null): string {
  const rows =
    summary && summary.lines.length > 0
      ? `<ul class="dashboard-list dashboard-list--invoices">
          ${summary.lines
            .map((line) => {
              const viewAttrs = line.invoiceId
                ? ` data-action="view-invoice" data-invoice-id="${escapeHtml(line.invoiceId)}"`
                : ` data-action="view-invoice"`;
              return `
            <li class="dashboard-list__item dashboard-list__item--invoice">
              <div class="dashboard-list__main">
                <span class="dashboard-list__title">${escapeHtml(line.cardName)}</span>
                <span class="dashboard-list__meta">${escapeHtml(line.invoiceLabel)} · Venc. ${escapeHtml(line.dueDate)}</span>
              </div>
              <dl class="dashboard-invoice-metrics">
                <div><dt>Status</dt><dd>${renderStatusChip(line.statusLabel, dashboardInvoiceStatusVariant(line.statusLabel, line.mode))}</dd></div>
                <div><dt>Total</dt><dd>${renderNominalMoney(line.totalCents)}</dd></div>
                <div><dt>Pago</dt><dd>${renderNominalMoney(line.paidCents)}</dd></div>
                <div><dt>Em aberto</dt><dd>${renderNominalMoney(line.openCents, line.openCents > 0 ? "negative" : "neutral")}</dd></div>
              </dl>
              <div class="dashboard-list__action">
                <button type="button" class="btn btn--ghost btn--compact"${viewAttrs}>Ver fatura</button>
              </div>
            </li>`;
            })
            .join("")}
        </ul>`
      : `<p class="dashboard-list__empty">Nenhuma fatura ou projeção de cartão nesta competência.</p>`;

  return `
    <section class="panel dashboard-invoices" aria-labelledby="dashboard-invoices-title">
      <header class="panel__header panel__header--compact">
        <h2 class="panel__title" id="dashboard-invoices-title">Faturas</h2>
      </header>
      <div class="panel__body">${rows}</div>
    </section>
  `;
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

export function balanceTone(cents: number): BalanceTone {
  if (cents > 0) {
    return "positive";
  }
  if (cents < 0) {
    return "negative";
  }
  return "neutral";
}

function transactionDescriptionCell(
  data: AppData,
  item: Transaction,
): { display: string; titleAttr: string } {
  const display = transactionDisplayDescription(data, item);
  const showOriginal = display !== item.description;
  const titleSource = showOriginal ? item.description : item.description;
  const titleAttr =
    showOriginal || titleSource.length > 40
      ? ` title="${escapeHtml(titleSource)}"`
      : "";
  return { display, titleAttr };
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

function renderRecurringIndicator(recurrenceClass: RecurrenceClass | null = null): string {
  const label = recurrenceClass
    ? recurringTransactionAccessibleLabel(recurrenceClass)
    : "Lançamento recorrente";
  return `<span class="recurring-indicator" title="${escapeHtml(label)}">${recurringCycleIcon()}<span class="sr-only">${escapeHtml(label)}</span></span>`;
}

export function renderTransactionTableRow(
  data: AppData,
  item: Transaction,
  tableId: string = TABLE_IDS.lancamentos,
  options?: {
    includeType?: boolean;
    showRecurringIcon?: boolean;
    recurringClass?: RecurrenceClass | null;
  },
): string {
  const includeType = options?.includeType !== false;
  const recurringIcon = options?.showRecurringIcon
    ? `${renderRecurringIndicator(options.recurringClass ?? null)} `
    : "";
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
  const descriptionCell = transactionDescriptionCell(data, item);
  const typeCell = includeType
    ? `<td class="cfm-table__cell--type" ${h("type")} data-label="Tipo">
        <span class="type-chip type-chip--${typeChipClass}">${typeLabel}</span>
      </td>`
    : "";

  return `
    <tr data-transaction-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatDateLabel(item.date))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${descriptionCell.titleAttr}>${recurringIcon}${escapeHtml(descriptionCell.display)}</span>${installmentLabel}
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
  data: AppData,
  item: Transaction,
  tableId: string = TABLE_IDS.lancamentosIncome,
  options?: { showRecurringIcon?: boolean; recurringClass?: RecurrenceClass | null },
): string {
  return renderTransactionTableRow(data, item, tableId, {
    includeType: false,
    ...(options?.showRecurringIcon ? { showRecurringIcon: true, recurringClass: options.recurringClass ?? null } : {}),
  });
}

export function renderProjectedInstallmentRow(
  data: AppData,
  item: ProjectedInstallment,
  tableId: string = TABLE_IDS.lancamentos,
): string {
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);
  const installmentLabel = ` <span class="data-table__meta">${item.installment.current}/${item.installment.total}</span>`;
  const display = projectedInstallmentDisplayDescription(data, item);
  const source = data.transactions.find((transaction) => transaction.id === item.sourceTransactionId);
  const titleSource = source?.description ?? item.description;
  const titleAttr =
    display !== titleSource || titleSource.length > 40
      ? ` title="${escapeHtml(titleSource)}"`
      : "";

  return `
    <tr class="cfm-table__row--projected" data-projected-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatCompetenceLabel(item.competenceMonth))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${titleAttr}>${escapeHtml(display)}</span>${installmentLabel}
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
  data: AppData,
  item: Transaction,
  tableId: string = TABLE_IDS.invoiceDetail,
): string {
  const typeLabel = transactionTypeLabel(item);
  const typeChipClass = transactionTypeChipClass(item);
  const installment = installmentDisplayLabel(item);
  const amountVariant = item.expenseKind === "refund" ? "positive" : "neutral";
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);
  const descriptionCell = transactionDescriptionCell(data, item);

  return `
    <tr class="cfm-table__row--invoice-line">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatDateLabel(item.date))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary"${descriptionCell.titleAttr}>${escapeHtml(descriptionCell.display)}</span>
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
  data: AppData;
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
    data,
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
            ${transactions.map((item) => renderInvoiceTransactionRow(data, item)).join("")}
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
  return renderDashboardSituationPanel(summary);
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
  data: AppData,
  item: ProjectedInstallment,
  tableId: string = TABLE_IDS.lancamentosCardsDetail,
): string {
  const h = (columnId: string): string => tableCellHeaders(tableId, columnId);
  const display = projectedInstallmentDisplayDescription(data, item);
  return `
    <tr class="cfm-table__row--projected" data-projected-id="${escapeHtml(item.id)}">
      <td class="cfm-table__cell--date" ${h("date")} data-label="Data">${escapeHtml(formatCompetenceLabel(item.competenceMonth))}</td>
      <td class="cfm-table__cell--desc" ${h("description")} data-label="Descrição">
        <span class="data-table__primary">${escapeHtml(display)}</span>
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
