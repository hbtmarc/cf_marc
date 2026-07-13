import type { AppMutations } from "./forms";
import { formatCompetenceLabel } from "./finance";
import {
  buildMonthlyBalanceSnapshot,
  getMonthlyBalanceByCompetence,
  registerMonthlyBalance,
  updateMonthlyBalance,
} from "./monthly-balance";
import { renderBalanceModalSummary } from "./balanco-presentation";
import type { AppData } from "./types";
import { announce, closeModal, el, openModal } from "./ui";

export function openRegisterBalanceModal(options: {
  data: AppData;
  competenceMonth: string;
  mutations: AppMutations;
  onSaved: () => void;
  trigger: HTMLElement;
}): void {
  openBalanceModal({
    ...options,
    mode: "register",
    title: `Registrar balanço de ${formatCompetenceLabel(options.competenceMonth)}`,
    submitLabel: "Registrar balanço",
  });
}

export function openUpdateBalanceModal(options: {
  data: AppData;
  competenceMonth: string;
  mutations: AppMutations;
  onSaved: () => void;
  trigger: HTMLElement;
}): void {
  openBalanceModal({
    ...options,
    mode: "update",
    title: `Atualizar balanço de ${formatCompetenceLabel(options.competenceMonth)}`,
    submitLabel: "Atualizar balanço",
  });
}

function openBalanceModal(options: {
  data: AppData;
  competenceMonth: string;
  mutations: AppMutations;
  onSaved: () => void;
  trigger: HTMLElement;
  mode: "register" | "update";
  title: string;
  submitLabel: string;
}): void {
  const snapshot = buildMonthlyBalanceSnapshot(options.data, options.competenceMonth);
  const existing = getMonthlyBalanceByCompetence(options.data, options.competenceMonth);

  const form = el("form", "form balanco-form");
  form.noValidate = true;

  const competenceGroup = el("div", "field");
  const competenceLabel = el("label", "field__label", "Competência");
  competenceLabel.htmlFor = "balance-competence";
  const competenceValue = el(
    "p",
    "field__readonly",
    formatCompetenceLabel(options.competenceMonth),
  );
  competenceValue.id = "balance-competence";
  competenceGroup.append(competenceLabel, competenceValue);

  const summaryHost = el("div", "balanco-modal-summary-host");
  summaryHost.innerHTML = renderBalanceModalSummary(snapshot);

  const noteGroup = el("div", "field");
  const noteLabel = el("label", "field__label", "Observação");
  noteLabel.htmlFor = "balance-note";
  const noteInput = el("textarea", "field__control") as HTMLTextAreaElement;
  noteInput.id = "balance-note";
  noteInput.rows = 3;
  noteInput.placeholder = "Opcional";
  noteInput.value = existing?.note ?? "";
  noteGroup.append(noteLabel, noteInput);

  const actions = el("div", "form__actions");
  const cancelButton = el("button", "btn btn--secondary", "Cancelar");
  cancelButton.type = "button";
  const submitButton = el("button", `btn btn--primary`, options.submitLabel);
  submitButton.type = "submit";
  actions.append(cancelButton, submitButton);

  form.append(competenceGroup, summaryHost, noteGroup, actions);

  cancelButton.addEventListener("click", () => {
    closeModal();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const note = noteInput.value;
    options.mutations.update((data) => {
      if (options.mode === "register") {
        registerMonthlyBalance(data, options.competenceMonth, note);
      } else {
        updateMonthlyBalance(data, options.competenceMonth, note);
      }
    });
    announce(
      options.mode === "register"
        ? "Balanço registrado com sucesso."
        : "Balanço atualizado com sucesso.",
    );
    closeModal();
    options.onSaved();
  });

  openModal({
    title: options.title,
    content: form,
    panelClass: "modal-panel--form",
    initialFocus: noteInput,
  });
}
