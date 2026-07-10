import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import { deleteCard, openCardForm } from "../forms";
import { renderCardSummaryBody, renderEmptyState, renderSectionHeader } from "../presentation";
import { announce, createRowMenu, el, openConfirmModal } from "../ui";
import { clearAppData, emptyAppData, saveAppData } from "../storage";

export function renderAjustes(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
  onClearData: () => void,
): void {
  host.innerHTML = "";
  const flow = el("div", "settings-layout");

  const cardsSection = el("section", "settings-section");
  const cardsHeaderWrap = el("div", "section-header section-header--split");
  cardsHeaderWrap.innerHTML = renderSectionHeader("Cartões");
  const newCard = el("button", "btn btn--secondary btn--small", "Novo cartão");
  newCard.type = "button";
  newCard.id = "settings-new-card";
  cardsHeaderWrap.appendChild(newCard);
  cardsSection.appendChild(cardsHeaderWrap);

  newCard.addEventListener("click", () => openCardForm({ mutations, onSaved: rerender }));

  if (data.cards.length === 0) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState({
      title: "Nenhum cartão cadastrado",
      description:
        "Configure cartões para organizar faturas mensais, vencimentos e alertas de fechamento.",
      ctaLabel: "Novo cartão",
      ctaAction: "new-card",
    });
    cardsSection.appendChild(empty);
    empty.querySelector<HTMLButtonElement>('[data-action="new-card"]')?.addEventListener(
      "click",
      () => openCardForm({ mutations, onSaved: rerender }),
    );
  } else {
    const list = el("ul", "settings-list");
    for (const card of data.cards) {
      const row = el("li", "settings-list__item");
      const main = el("div", "settings-list__main");
      main.innerHTML = renderCardSummaryBody(card);
      const actions = el("div", "settings-list__actions");
      actions.appendChild(
        createRowMenu([
          {
            label: "Editar",
            onClick: () => openCardForm({ mutations, card, onSaved: rerender }),
          },
          {
            label: "Excluir",
            variant: "danger",
            onClick: () => {
              openConfirmModal({
                title: "Excluir cartão",
                message: `Excluir o cartão "${card.name}" e suas faturas vinculadas?`,
                confirmLabel: "Excluir",
                danger: true,
                onConfirm: () => deleteCard(mutations, card.id, rerender),
              });
            },
          },
        ]),
      );
      row.appendChild(main);
      row.appendChild(actions);
      list.appendChild(row);
    }
    cardsSection.appendChild(list);
  }
  flow.appendChild(cardsSection);

  const storageSection = el("section", "settings-section");
  storageSection.innerHTML = `
    ${renderSectionHeader("Armazenamento local")}
    <p class="text-body">
      Seus dados ficam armazenados neste navegador e não são sincronizados automaticamente com outros dispositivos.
    </p>
    <details class="settings-details">
      <summary>Detalhes técnicos</summary>
      <dl class="settings-meta">
        <div><dt>Schema</dt><dd>${data.schemaVersion}</dd></div>
        <div><dt>Storage key</dt><dd><code>cfm:v2:appData</code></dd></div>
        <div><dt>Competência ativa</dt><dd>${data.selectedCompetenceMonth}</dd></div>
        <div><dt>Lançamentos</dt><dd>${data.transactions.length}</dd></div>
        <div><dt>Cartões</dt><dd>${data.cards.length}</dd></div>
        <div><dt>Faturas</dt><dd>${data.invoices.length}</dd></div>
        <div><dt>Fingerprints importados</dt><dd>${data.importMeta?.fingerprints.length ?? 0}</dd></div>
      </dl>
    </details>
  `;
  flow.appendChild(storageSection);

  const riskSection = el("section", "settings-section settings-section--risk");
  riskSection.innerHTML = `
    ${renderSectionHeader("Zona de risco")}
    <p class="text-body">
      Apagar todos os dados remove receitas, despesas, cartões e faturas deste dispositivo. Esta ação não pode ser desfeita.
    </p>
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
  riskSection.appendChild(clearButton);
  flow.appendChild(riskSection);

  host.appendChild(flow);
}
