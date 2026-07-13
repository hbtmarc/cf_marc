import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import { deleteCard, openCardForm } from "../forms";
import { renderCardSummaryBody, renderEmptyState, renderSectionHeader } from "../presentation";
import { announce, createRowMenu, el, openConfirmModal } from "../ui";

function formatBackupTimestamp(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(ms));
}

export function renderAjustes(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
  onClearData: () => void | Promise<void>,
  showConflictBackup = false,
  onViewConflictBackup?: () => void,
  showDeletionBackup = false,
  deletionBackupCreatedAt: number | null = null,
  onRestoreDeletionBackup?: () => void | Promise<void>,
): void {
  host.innerHTML = "";
  const flow = el("div", "settings-layout");

  if (showConflictBackup) {
    const conflictSection = el("section", "settings-section");
    conflictSection.innerHTML = renderSectionHeader("Sincronização");
    const conflictText = el(
      "p",
      "text-body",
      "Uma cópia local foi preservada quando dados mais recentes chegaram da nuvem.",
    );
    const conflictButton = el("button", "btn btn--secondary", "Verificar cópia local preservada");
    conflictButton.type = "button";
    conflictButton.addEventListener("click", () => {
      onViewConflictBackup?.();
    });
    conflictSection.appendChild(conflictText);
    conflictSection.appendChild(conflictButton);
    flow.appendChild(conflictSection);
  }

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
      Os dados ficam em cache neste navegador e são sincronizados com a nuvem quando há conexão.
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

  if (showDeletionBackup && deletionBackupCreatedAt) {
    const restoreSection = el("section", "settings-section");
    restoreSection.innerHTML = renderSectionHeader("Snapshot de exclusão");
    const restoreText = el(
      "p",
      "text-body",
      `Um snapshot automático foi criado em ${formatBackupTimestamp(deletionBackupCreatedAt)} antes da última exclusão. Ele fica salvo no RTDB e pode ser restaurado em qualquer dispositivo.`,
    );
    const restoreButton = el("button", "btn btn--secondary", "Restaurar snapshot");
    restoreButton.type = "button";
    restoreButton.addEventListener("click", () => {
      openConfirmModal({
        title: "Restaurar snapshot",
        message:
          "Isso substitui os dados atuais deste dispositivo e na nuvem pelo conteúdo do snapshot salvo no RTDB. Deseja continuar?",
        confirmLabel: "Restaurar",
        onConfirm: () => {
          void Promise.resolve(onRestoreDeletionBackup?.());
        },
      });
    });
    restoreSection.appendChild(restoreText);
    restoreSection.appendChild(restoreButton);
    flow.appendChild(restoreSection);
  }

  const riskSection = el("section", "settings-section settings-section--risk");
  riskSection.innerHTML = `
    ${renderSectionHeader("Zona de risco")}
    <p class="text-body">
      Apagar todos os dados remove receitas, despesas, cartões e faturas deste dispositivo e da nuvem.
      Antes da exclusão, um snapshot automático é gravado no RTDB em <code>personal/finance_snapshot</code>.
    </p>
  `;
  const clearButton = el("button", "btn btn--danger", "Apagar todos os dados");
  clearButton.type = "button";
  clearButton.addEventListener("click", () => {
    openConfirmModal({
      title: "Apagar todos os dados",
      message:
        "Um snapshot será gravado no RTDB antes da exclusão. Os dados serão removidos localmente e em personal/finance. Deseja continuar?",
      confirmLabel: "Apagar tudo",
      danger: true,
      onConfirm: () => {
        void Promise.resolve(onClearData());
      },
    });
  });
  riskSection.appendChild(clearButton);
  flow.appendChild(riskSection);

  host.appendChild(flow);
}
