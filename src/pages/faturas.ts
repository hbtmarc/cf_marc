import {
  filterInvoicesByCompetence,
  formatCompetenceLabel,
  invoiceStatusLabel,
  invoiceTotalCentsValue,
  invoiceOpenCents,
  transactionDisplayedAmountCents,
  transactionsForInvoice,
} from "../finance";
import type { AppData, Invoice, Transaction } from "../types";
import type { AppMutations } from "../forms";
import {
  cardNameById,
  deleteInvoice,
  openCardForm,
  openInvoiceForm,
  toggleInvoiceStatus,
} from "../forms";
import {
  invoiceTotal,
  renderCardPanel,
  renderEmptyState,
  renderInvoiceDetailPanel,
  renderInvoiceTableHead,
  renderInvoiceTableRow,
  renderSectionHeader,
  transactionTypeLabel,
} from "../presentation";
import { installmentSortValue } from "../installment-label";
import {
  INVOICE_STATUS_SORT_ORDER,
  sortTableItems,
  toggleTableSort,
  type SortColumnAccessor,
  type TableSortState,
} from "../table-sort";
import { bindTableSortControls, renderMobileSortControl, type SortableColumnOption } from "../table-ui";
import { createRowMenu, el, openConfirmModal } from "../ui";
import { formatCardCount, formatInvoiceCount } from "../text";

let expandedInvoiceId: string | null = null;

const INVOICES_MOBILE_SORT_ID = "invoices-mobile-sort";
const INVOICE_DETAIL_MOBILE_SORT_ID = "invoice-detail-mobile-sort";

export type InvoiceSortColumn =
  | "dueDate"
  | "fatura"
  | "card"
  | "competence"
  | "status"
  | "total"
  | "open";

export type InvoiceDetailSortColumn =
  | "date"
  | "description"
  | "installment"
  | "category"
  | "type"
  | "amount";

export const INVOICE_SORT_COLUMNS: SortableColumnOption<InvoiceSortColumn>[] = [
  { id: "dueDate", label: "Vencimento" },
  { id: "fatura", label: "Fatura" },
  { id: "card", label: "Cartão" },
  { id: "competence", label: "Competência" },
  { id: "status", label: "Status" },
  { id: "total", label: "Total" },
  { id: "open", label: "Em aberto" },
];

export const INVOICE_DETAIL_SORT_COLUMNS: SortableColumnOption<InvoiceDetailSortColumn>[] = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "installment", label: "Parcela" },
  { id: "category", label: "Categoria" },
  { id: "type", label: "Tipo" },
  { id: "amount", label: "Valor" },
];

let invoiceTableSort: TableSortState<InvoiceSortColumn> = {
  column: "dueDate",
  direction: "asc",
};

let invoiceDetailSort: TableSortState<InvoiceDetailSortColumn> = {
  column: "date",
  direction: "desc",
};

export function resetFaturasUiState(): void {
  expandedInvoiceId = null;
}

export function getExpandedInvoiceId(): string | null {
  return expandedInvoiceId;
}

export function getInvoiceTableSort(): TableSortState<InvoiceSortColumn> {
  return invoiceTableSort;
}

export function getInvoiceDetailSort(): TableSortState<InvoiceDetailSortColumn> {
  return invoiceDetailSort;
}

export function buildInvoiceSortAccessors(
  cardNameFor: (invoice: Invoice) => string,
): Record<InvoiceSortColumn, SortColumnAccessor<Invoice>> {
  return {
    dueDate: { kind: "date", getValue: (item) => item.dueDate },
    fatura: {
      kind: "text",
      getValue: (item) => `Fatura ${formatCompetenceLabel(item.competenceMonth)}`,
    },
    card: { kind: "text", getValue: (item) => cardNameFor(item) },
    competence: { kind: "date", getValue: (item) => item.competenceMonth },
    status: {
      kind: "status",
      getValue: (item) => invoiceStatusLabel(item),
      statusOrder: INVOICE_STATUS_SORT_ORDER,
    },
    total: { kind: "number", getValue: (item) => invoiceTotalCentsValue(item) },
    open: { kind: "number", getValue: (item) => invoiceOpenCents(item) },
  };
}

export const invoiceDetailSortAccessors: Record<
  InvoiceDetailSortColumn,
  SortColumnAccessor<Transaction>
> = {
  date: { kind: "date", getValue: (item) => item.date },
  description: { kind: "text", getValue: (item) => item.description },
  installment: {
    kind: "installment",
    getValue: (item) => installmentSortValue(item),
  },
  category: { kind: "text", getValue: (item) => item.category },
  type: { kind: "text", getValue: (item) => transactionTypeLabel(item) },
  amount: { kind: "number", getValue: (item) => transactionDisplayedAmountCents(item) },
};

export function renderFaturasHeaderActions(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  host.innerHTML = "";
  const month = data.selectedCompetenceMonth;
  const hasCards = data.cards.length > 0;
  const actions = el("div", "page-header__actions");

  if (!hasCards) {
    const registerCard = el("button", "btn btn--primary", "Cadastrar cartão");
    registerCard.type = "button";
    registerCard.addEventListener("click", () => {
      openCardForm({ mutations, onSaved: rerender });
    });
    actions.appendChild(registerCard);
  } else {
    const newInvoice = el("button", "btn btn--primary", "Nova fatura");
    newInvoice.type = "button";
    newInvoice.addEventListener("click", () => {
      openInvoiceForm({ mutations, data, competenceMonth: month, onSaved: rerender });
    });
    const manageCards = el("a", "btn btn--secondary", "Gerenciar cartões");
    manageCards.href = "#/ajustes";
    actions.appendChild(newInvoice);
    actions.appendChild(manageCards);
  }

  host.appendChild(actions);
}

export function renderFaturas(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const invoices = sortTableItems(
    filterInvoicesByCompetence(data.invoices, month),
    invoiceTableSort,
    buildInvoiceSortAccessors((invoice) => cardNameById(data, invoice.cardId)),
  );
  const hasCards = data.cards.length > 0;
  const singleCard = data.cards.length === 1;

  if (
    expandedInvoiceId !== null &&
    !invoices.some((item) => item.id === expandedInvoiceId)
  ) {
    expandedInvoiceId = null;
  }

  host.innerHTML = "";

  const cardsSection = el("section", "cards-grid-section");
  cardsSection.innerHTML = renderSectionHeader("Cartões e faturas", {
    meta: formatCardCount(data.cards.length),
  });
  if (!hasCards) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState({
      title: "Nenhum cartão cadastrado",
      description:
        "Cadastre um cartão para registrar faturas mensais, vencimentos e acompanhar compromissos de crédito.",
      ctaLabel: "Cadastrar cartão",
      ctaAction: "register-card",
    });
    cardsSection.appendChild(empty);
    empty.querySelector<HTMLButtonElement>('[data-action="register-card"]')?.addEventListener(
      "click",
      () => openCardForm({ mutations, onSaved: rerender }),
    );
  } else {
    const grid = el("div", `cards-grid${singleCard ? " cards-grid--single" : ""}`);
    for (const card of data.cards) {
      const cardInvoices = data.invoices.filter((item) => item.cardId === card.id);
      const currentInvoice = invoices.find((item) => item.cardId === card.id);
      const panel = el("div");
      panel.innerHTML = renderCardPanel({
        card,
        invoiceCount: cardInvoices.length,
        single: singleCard,
        ...(currentInvoice ? { invoice: currentInvoice } : {}),
      });
      const article = panel.firstElementChild;
      if (article) {
        grid.appendChild(article);
      }
    }
    cardsSection.appendChild(grid);
  }
  host.appendChild(cardsSection);

  const invoiceSection = el("section", "data-table-panel");
  invoiceSection.innerHTML = renderSectionHeader("Faturas da competência", {
    count: invoices.length,
    countLabel: formatInvoiceCount,
    totalCents: invoiceTotal(invoices),
    kind: "expense",
  });

  if (invoices.length === 0) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState({
      title: "Nenhuma fatura nesta competência",
      description: hasCards
        ? "Registre o valor total da fatura para acompanhar vencimento, status e impacto no fechamento projetado."
        : "Cadastre um cartão antes de registrar a primeira fatura.",
      ...(hasCards ? { ctaLabel: "Nova fatura", ctaAction: "new-invoice" } : {}),
    });
    invoiceSection.appendChild(empty);
    empty.querySelector<HTMLButtonElement>('[data-action="new-invoice"]')?.addEventListener(
      "click",
      () => openInvoiceForm({ mutations, data, competenceMonth: month, onSaved: rerender }),
    );
  } else {
    const tableWrap = el("div", "cfm-table-wrap");
    tableWrap.innerHTML = `
      ${renderMobileSortControl(INVOICE_SORT_COLUMNS, invoiceTableSort, INVOICES_MOBILE_SORT_ID)}
      <table class="cfm-table cfm-table--invoice" aria-label="Faturas da competência" data-sort-table="${INVOICES_MOBILE_SORT_ID}">
        ${renderInvoiceTableHead(INVOICE_SORT_COLUMNS, invoiceTableSort)}
        <tbody>
          ${invoices
            .map((invoice) => {
              const panelId = `invoice-detail-${invoice.id}`;
              return renderInvoiceTableRow({
                invoice,
                cardName: cardNameById(data, invoice.cardId),
                expanded: expandedInvoiceId === invoice.id,
                detailPanelId: panelId,
              });
            })
            .join("")}
        </tbody>
      </table>
    `;
    invoiceSection.appendChild(tableWrap);

    bindTableSortControls<InvoiceSortColumn>(tableWrap, {
      mobileControlId: INVOICES_MOBILE_SORT_ID,
      onColumnActivate: (column) => {
        invoiceTableSort = toggleTableSort(invoiceTableSort, column, "asc");
        rerender();
      },
      onMobileSort: (column, direction) => {
        invoiceTableSort = { column, direction };
        rerender();
      },
    });

    if (expandedInvoiceId !== null) {
      const invoice = invoices.find((item) => item.id === expandedInvoiceId);
      if (invoice) {
        const detailTransactions = sortTableItems(
          transactionsForInvoice(data.transactions, invoice.id),
          invoiceDetailSort,
          invoiceDetailSortAccessors,
        );
        const detailHost = el("div", "invoice-detail-host");
        detailHost.innerHTML = renderInvoiceDetailPanel({
          invoice,
          cardName: cardNameById(data, invoice.cardId),
          transactions: detailTransactions,
          panelId: `invoice-detail-${invoice.id}`,
          sortColumns: INVOICE_DETAIL_SORT_COLUMNS,
          sortState: invoiceDetailSort,
          mobileSortControlId: INVOICE_DETAIL_MOBILE_SORT_ID,
          mobileSortMarkup: renderMobileSortControl(
            INVOICE_DETAIL_SORT_COLUMNS,
            invoiceDetailSort,
            INVOICE_DETAIL_MOBILE_SORT_ID,
          ),
        });
        invoiceSection.appendChild(detailHost);

        bindTableSortControls<InvoiceDetailSortColumn>(detailHost, {
          mobileControlId: INVOICE_DETAIL_MOBILE_SORT_ID,
          onColumnActivate: (column) => {
            invoiceDetailSort = toggleTableSort(invoiceDetailSort, column, "asc");
            rerender();
          },
          onMobileSort: (column, direction) => {
            invoiceDetailSort = { column, direction };
            rerender();
          },
        });
      }
    }

    bindInvoiceViewActions(invoiceSection, rerender);
    bindInvoiceActions(invoiceSection, invoices, data, mutations, month, rerender);
  }

  host.appendChild(invoiceSection);
}

function bindInvoiceViewActions(host: HTMLElement, rerender: () => void): void {
  host.querySelectorAll<HTMLButtonElement>("[data-invoice-view]").forEach((button) => {
    const toggle = (): void => {
      const invoiceId = button.dataset.invoiceView;
      if (!invoiceId) {
        return;
      }
      expandedInvoiceId = expandedInvoiceId === invoiceId ? null : invoiceId;
      rerender();
    };

    button.addEventListener("click", toggle);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  });
}

function bindInvoiceActions(
  host: HTMLElement,
  invoices: AppData["invoices"],
  data: AppData,
  mutations: AppMutations,
  month: string,
  rerender: () => void,
): void {
  for (const invoice of invoices) {
    const slot = host.querySelector<HTMLElement>(`[data-invoice-actions="${invoice.id}"]`);
    if (!slot) {
      continue;
    }

    slot.replaceChildren();

    const toggleLabel =
      invoice.status === "paid" ? "Marcar como aberta" : "Marcar como paga";

    slot.appendChild(
      createRowMenu([
        {
          label: "Editar",
          onClick: () => {
            openInvoiceForm({
              mutations,
              data,
              competenceMonth: month,
              invoice,
              onSaved: rerender,
            });
          },
        },
        {
          label: toggleLabel,
          onClick: () => toggleInvoiceStatus(mutations, invoice, rerender),
        },
        {
          label: "Excluir",
          variant: "danger",
          onClick: () => {
            openConfirmModal({
              title: "Excluir fatura",
              message: "Excluir esta fatura? Esta ação não pode ser desfeita.",
              confirmLabel: "Excluir",
              danger: true,
              onConfirm: () => {
                if (expandedInvoiceId === invoice.id) {
                  expandedInvoiceId = null;
                }
                deleteInvoice(mutations, invoice.id, rerender);
              },
            });
          },
        },
      ]),
    );
  }
}
