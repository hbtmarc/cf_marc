import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import {
  deleteCard,
  iconActionButton,
  openCardForm,
} from "../forms";
import {
  announce,
  el,
  openConfirmModal,
  renderEmptyState,
} from "../ui";
import { clearAppData, emptyAppData, saveAppData } from "../storage";

export function renderAjustes(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
  onClearData: () => void,
): void {
  host.innerHTML = "";

  const cardsSection = el("section", "entity-section");
  const cardsHeader = el("div", "entity-section__header");
  const cardsTitle = el("h2", "entity-section__title", "Cartões");
  const newCard = el("button", "btn btn--secondary btn--small", "Novo cartão");
  newCard.type = "button";
  cardsHeader.appendChild(cardsTitle);
  cardsHeader.appendChild(newCard);
  cardsSection.appendChild(cardsHeader);

  newCard.addEventListener("click", () => {
    openCardForm({ mutations, onSaved: rerender });
  });

  if (data.cards.length === 0) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState(
      "Nenhum cartão cadastrado",
      "Adicione cartões para organizar faturas mensais.",
    );
    cardsSection.appendChild(empty);
  } else {
    const list = el("ul", "list");
    for (const card of data.cards) {
      const row = el("li", "list-row list-row--actions");
      const content = el("div", "list-row__content");
      const meta: string[] = [];
      if (card.closingDay !== null) {
        meta.push(`Fechamento: dia ${card.closingDay}`);
      }
      if (card.dueDay !== null) {
        meta.push(`Vencimento: dia ${card.dueDay}`);
      }
      content.innerHTML = `
        <div class="list-row__main">
          <strong class="list-row__title">${card.name}</strong>
          <span class="list-row__meta">${meta.join(" · ") || "Sem dias configurados"}</span>
        </div>
      `;

      const actions = el("div", "list-row__actions");
      actions.appendChild(
        iconActionButton("Editar", () => {
          openCardForm({
            mutations,
            card,
            onSaved: rerender,
          });
        }),
      );
      actions.appendChild(
        iconActionButton("Excluir", () => {
          openConfirmModal({
            title: "Excluir cartão",
            message: `Excluir o cartão "${card.name}" e suas faturas vinculadas?`,
            confirmLabel: "Excluir",
            danger: true,
            onConfirm: () => {
              deleteCard(mutations, card.id, rerender);
            },
          });
        }),
      );

      row.appendChild(content);
      row.appendChild(actions);
      list.appendChild(row);
    }
    cardsSection.appendChild(list);
  }

  host.appendChild(cardsSection);

  const dangerSection = el("section", "entity-section entity-section--danger");
  dangerSection.innerHTML = `
    <h2 class="entity-section__title">Dados locais</h2>
    <p class="entity-section__text">
      Todos os lançamentos ficam apenas neste navegador, na chave
      <code>cfm:v2:appData</code>.
      Limpar os dados do navegador ou acessar por outro dispositivo não preserva estas informações.
    </p>
    <p class="entity-section__meta">Versão do schema: <strong>${data.schemaVersion}</strong></p>
  `;

  const clearButton = el("button", "btn btn--danger", "Apagar todos os dados");
  clearButton.type = "button";
  clearButton.addEventListener("click", () => {
    openConfirmModal({
      title: "Apagar todos os dados",
      message:
        "Isso remove receitas, despesas, cartões e faturas deste dispositivo. Deseja continuar?",
      confirmLabel: "Apagar tudo",
      danger: true,
      onConfirm: () => {
        clearAppData();
        const fresh = emptyAppData();
        saveAppData(fresh);
        announce("Todos os dados locais foram apagados.");
        onClearData();
      },
    });
  });

  dangerSection.appendChild(clearButton);
  host.appendChild(dangerSection);
}
