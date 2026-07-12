import type { AppMutations } from "./forms";
import {
  findTransactionDescriptionAlias,
  removeTransactionDescriptionAlias,
  upsertTransactionDescriptionAlias,
} from "./transaction-aliases";
import type { AppData, Transaction } from "./types";
import { announce, closeModal, el, openModal } from "./ui";

export function openTransactionDisplayAliasModal(options: {
  data: AppData;
  transaction: Transaction;
  mutations: AppMutations;
  onSaved: () => void;
}): void {
  const { transaction, mutations, onSaved } = options;
  const existing = findTransactionDescriptionAlias(options.data, transaction.description);

  const content = el("div", "alias-modal");
  const intro = el(
    "p",
    "alias-modal__intro",
    "O nome exibido será aplicado às transações atuais e futuras com a mesma descrição de origem.",
  );

  const originalGroup = el("div", "field");
  const originalLabel = el("label", "field__label", "Descrição original");
  originalLabel.htmlFor = "alias-original";
  const originalValue = el("p", "alias-modal__original", transaction.description);
  originalValue.id = "alias-original";
  originalGroup.append(originalLabel, originalValue);

  const displayGroup = el("div", "field");
  const displayLabel = el("label", "field__label", "Nome exibido");
  displayLabel.htmlFor = "alias-display-name";
  const displayInput = el("input", "field__control") as HTMLInputElement;
  displayInput.type = "text";
  displayInput.id = "alias-display-name";
  displayInput.name = "alias-display-name";
  displayInput.value = existing?.displayName ?? transaction.description;
  displayInput.autocomplete = "off";
  const displayError = el("p", "field__error");
  displayError.hidden = true;
  displayGroup.append(displayLabel, displayInput, displayError);

  const actions = el("div", "alias-modal__actions");
  const cancelButton = el("button", "btn btn--secondary", "Cancelar");
  cancelButton.type = "button";
  const saveButton = el("button", "btn btn--primary", "Salvar nome");
  saveButton.type = "button";

  if (existing) {
    const restoreButton = el(
      "button",
      "btn btn--ghost alias-modal__restore",
      "Restaurar nome original",
    );
    restoreButton.type = "button";
    restoreButton.addEventListener("click", () => {
      mutations.update((data) => {
        removeTransactionDescriptionAlias(data, transaction.description);
      });
      closeModal();
      announce("Nome original restaurado.");
      onSaved();
    });
    actions.append(restoreButton);
  }

  actions.append(cancelButton, saveButton);
  content.append(intro, originalGroup, displayGroup, actions);

  let saved = false;

  const showError = (message: string): void => {
    displayError.textContent = message;
    displayError.hidden = false;
    displayGroup.classList.add("field--invalid");
    displayInput.setAttribute("aria-invalid", "true");
    displayInput.focus();
  };

  const clearError = (): void => {
    displayError.hidden = true;
    displayGroup.classList.remove("field--invalid");
    displayInput.removeAttribute("aria-invalid");
  };

  saveButton.addEventListener("click", () => {
    clearError();
    let hasError = false;
    mutations.update((data) => {
      const result = upsertTransactionDescriptionAlias(
        data,
        transaction.description,
        displayInput.value,
      );
      if (result.errors.displayName) {
        hasError = true;
        showError(result.errors.displayName);
      }
    });
    if (!hasError) {
      saved = true;
      closeModal();
      announce("Nome de exibição salvo.");
      onSaved();
    }
  });

  cancelButton.addEventListener("click", () => {
    closeModal();
  });

  openModal({
    title: "Renomear exibição",
    content,
    initialFocus: displayInput,
    panelClass: "modal-panel--alias",
    onClose: () => {
      if (!saved) {
        return;
      }
    },
  });
}
