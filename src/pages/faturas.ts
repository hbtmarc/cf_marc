import { filterInvoicesByCompetence } from "../finance";
import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import {
  cardNameById,
  deleteInvoice,
  iconActionButton,
  openCardForm,
  openInvoiceForm,
  toggleInvoiceStatus,
} from "../forms";
import {
  el,
  openConfirmModal,
  renderEmptyState,
  invoiceRowHtml,
} from "../ui";

export function renderFaturas(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const invoices = filterInvoicesByCompetence(data.invoices, month);

  host.innerHTML = "";

  const header = el("div", "page-header");
  header.innerHTML = `
    <div>
      <h2 class="page-header__title">Faturas</h2>
      <p class="page-header__subtitle">Controle mensal por cartão de crédito.</p>
    </div>
  `;
  const actions = el("div", "page-header__actions");
  const newCard = el("button", "btn btn--secondary", "Novo cartão");
  newCard.type = "button";
  const newInvoice = el("button", "btn btn--primary", "Nova fatura");
  newInvoice.type = "button";
  actions.appendChild(newCard);
  actions.appendChild(newInvoice);
  header.appendChild(actions);
  host.appendChild(header);

  newCard.addEventListener("click", () => {
    openCardForm({ mutations, onSaved: rerender });
  });

  newInvoice.addEventListener("click", () => {
    openInvoiceForm({
      mutations,
      data,
      competenceMonth: month,
      onSaved: rerender,
    });
  });

  const cardsSection = el("section", "entity-section");
  cardsSection.innerHTML = `<h3 class="entity-section__title">Cartões cadastrados</h3>`;
  if (data.cards.length === 0) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState(
      "Nenhum cartão",
      "Cadastre um cartão para registrar faturas mensais.",
    );
    cardsSection.appendChild(empty);
  } else {
    const list = el("ul", "chip-list");
    for (const card of data.cards) {
      const item = el("li", "chip-list__item");
      const meta: string[] = [card.name];
      if (card.closingDay !== null) {
        meta.push(`Fecha dia ${card.closingDay}`);
      }
      if (card.dueDay !== null) {
        meta.push(`Vence dia ${card.dueDay}`);
      }
      item.textContent = meta.join(" · ");
      list.appendChild(item);
    }
    cardsSection.appendChild(list);
  }
  host.appendChild(cardsSection);

  const invoiceSection = el("section", "entity-section");
  const invoiceTitle = el("h3", "entity-section__title", "Faturas da competência");
  invoiceSection.appendChild(invoiceTitle);

  if (invoices.length === 0) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState(
      "Nenhuma fatura",
      "Registre o valor total da fatura do cartão para esta competência.",
    );
    invoiceSection.appendChild(empty);
  } else {
    const list = el("ul", "list");
    for (const invoice of invoices) {
      const row = el("li", "list-row list-row--actions");
      const content = el("div", "list-row__content");
      content.innerHTML = invoiceRowHtml({
        cardName: cardNameById(data, invoice.cardId),
        dueDate: invoice.dueDate,
        amountCents: invoice.amountCents,
        status: invoice.status,
      });

      const rowActions = el("div", "list-row__actions");
      rowActions.appendChild(
        iconActionButton(
          invoice.status === "paid" ? "Marcar aberta" : "Marcar paga",
          () => {
            toggleInvoiceStatus(mutations, invoice, rerender);
          },
        ),
      );
      rowActions.appendChild(
        iconActionButton("Editar", () => {
          openInvoiceForm({
            mutations,
            data,
            competenceMonth: month,
            invoice,
            onSaved: rerender,
          });
        }),
      );
      rowActions.appendChild(
        iconActionButton("Excluir", () => {
          openConfirmModal({
            title: "Excluir fatura",
            message: "Excluir esta fatura? Esta ação não pode ser desfeita.",
            confirmLabel: "Excluir",
            danger: true,
            onConfirm: () => {
              deleteInvoice(mutations, invoice.id, rerender);
            },
          });
        }),
      );

      row.appendChild(content);
      row.appendChild(rowActions);
      list.appendChild(row);
    }
    invoiceSection.appendChild(list);
  }

  host.appendChild(invoiceSection);
}
