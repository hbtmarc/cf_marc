import { filterInvoicesByCompetence, transactionsForInvoice } from "../finance";
import type { AppData } from "../types";
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
} from "../presentation";
import { createRowMenu, el, openConfirmModal } from "../ui";
import { formatCardCount, formatInvoiceCount } from "../text";

let expandedInvoiceId: string | null = null;

export function resetFaturasUiState(): void {
  expandedInvoiceId = null;
}

export function getExpandedInvoiceId(): string | null {
  return expandedInvoiceId;
}

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
  const invoices = filterInvoicesByCompetence(data.invoices, month);
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
    const table = el("div", "data-table data-table--invoice");
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", "Faturas da competência");
    table.innerHTML = `
      ${renderInvoiceTableHead()}
      <div class="data-table__body" role="rowgroup">
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
      </div>
    `;
    invoiceSection.appendChild(table);

    if (expandedInvoiceId !== null) {
      const invoice = invoices.find((item) => item.id === expandedInvoiceId);
      if (invoice) {
        const detailHost = el("div", "invoice-detail-host");
        detailHost.innerHTML = renderInvoiceDetailPanel({
          invoice,
          cardName: cardNameById(data, invoice.cardId),
          transactions: transactionsForInvoice(data.transactions, invoice.id),
          panelId: `invoice-detail-${invoice.id}`,
        });
        invoiceSection.appendChild(detailHost);
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
