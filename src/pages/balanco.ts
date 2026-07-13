import type { AppData } from "../types";
import type { AppMutations } from "../forms";
import { renderBalancoPage } from "../balanco-presentation";
import {
  openRegisterBalanceModal,
  openUpdateBalanceModal,
} from "../balanco-modals";

export function renderBalanco(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
  onSelectCompetence: (month: string) => void,
): void {
  const month = data.selectedCompetenceMonth;
  host.innerHTML = renderBalancoPage(data, month);
  bindBalancoActions(host, data, mutations, rerender, onSelectCompetence);
}

function bindBalancoActions(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
  onSelectCompetence: (month: string) => void,
): void {
  const month = data.selectedCompetenceMonth;

  host
    .querySelector<HTMLButtonElement>('[data-action="register-balance"]')
    ?.addEventListener("click", (event) => {
      const trigger = event.currentTarget as HTMLElement;
      openRegisterBalanceModal({
        data,
        competenceMonth: month,
        mutations,
        onSaved: rerender,
        trigger,
      });
    });

  host
    .querySelector<HTMLButtonElement>('[data-action="update-balance"]')
    ?.addEventListener("click", (event) => {
      const trigger = event.currentTarget as HTMLElement;
      openUpdateBalanceModal({
        data,
        competenceMonth: month,
        mutations,
        onSaved: rerender,
        trigger,
      });
    });

  host.querySelectorAll<HTMLButtonElement>('[data-action="view-balance"]').forEach((button) => {
    button.addEventListener("click", () => {
      const competenceMonth = button.dataset.competenceMonth;
      if (!competenceMonth) {
        return;
      }
      onSelectCompetence(competenceMonth);
    });
  });
}
