import type { AppMutations } from "../forms";
import {
  clearMonthlyBalanceChecklist,
  completeMonthlyBalanceChecklist,
  reopenMonthlyBalanceChecklist,
  setMonthlyBalanceChecklistItem,
} from "../monthly-balance";
import { renderBalancoPage } from "../balanco-presentation";
import { buildPaymentChecklist } from "../payment-checklist";
import type { AppData } from "../types";
import { announce } from "../ui";

export function renderBalanco(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  _rerender: () => void,
  _onSelectCompetence: (month: string) => void,
): void {
  const month = data.selectedCompetenceMonth;
  host.innerHTML = renderBalancoPage(data, month);
  bindBalancoActions(host, data, mutations, month);
}

function bindBalancoActions(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  competenceMonth: string,
): void {
  host
    .querySelectorAll<HTMLInputElement>('[data-action="toggle-payment"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        const itemId = input.dataset.itemId;
        if (!itemId) {
          return;
        }
        mutations.update((draft) => {
          setMonthlyBalanceChecklistItem(
            draft,
            competenceMonth,
            itemId,
            input.checked,
          );
        });
      });
    });

  host
    .querySelector<HTMLButtonElement>('[data-action="clear-payments"]')
    ?.addEventListener("click", () => {
      mutations.update((draft) => {
        clearMonthlyBalanceChecklist(draft, competenceMonth);
      });
      announce("Marcações do checklist removidas.");
    });

  host
    .querySelector<HTMLButtonElement>('[data-action="complete-payments"]')
    ?.addEventListener("click", () => {
      const checklist = buildPaymentChecklist(data, competenceMonth);
      if (!checklist.allChecked) {
        announce("Confira todos os compromissos antes de concluir.");
        return;
      }
      mutations.update((draft) => {
        const currentChecklist = buildPaymentChecklist(draft, competenceMonth);
        completeMonthlyBalanceChecklist(
          draft,
          competenceMonth,
          currentChecklist,
        );
      });
      announce("Quitação do mês registrada.");
    });

  host
    .querySelector<HTMLButtonElement>('[data-action="reopen-payments"]')
    ?.addEventListener("click", () => {
      mutations.update((draft) => {
        reopenMonthlyBalanceChecklist(draft, competenceMonth);
      });
      announce("Conferência reaberta.");
    });
}
