import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderBalancoPage } from "./balanco-presentation";
import { openRegisterBalanceModal } from "./balanco-modals";
import { renderBalanco } from "./pages/balanco";
import { normalizeRoute } from "./router";
import { closeModal, initUiRoots, renderNav } from "./ui";
import { emptyAppData } from "./storage";
import { registerMonthlyBalance } from "./monthly-balance";
import type { AppData } from "./types";
import type { AppMutations } from "./forms";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function baseData(options: Partial<AppData> = {}): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-07",
    transactions: [
      {
        id: "tx-income",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        date: "2026-07-05",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    ...options,
  };
}

let dataRef = baseData();

const mutations: AppMutations = {
  update(mutator) {
    mutator(dataRef);
  },
};

function ensureDom(): void {
  document.body.innerHTML = `
    <div class="app-shell"></div>
    <div id="modal-root"></div>
    <div id="live-region" aria-live="polite"></div>
  `;
  initUiRoots();
}

describe("balanco page", () => {
  beforeEach(() => {
    dataRef = baseData();
    ensureDom();
  });

  afterEach(() => {
    closeModal();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("normalizes #/balanco route", () => {
    expect(normalizeRoute("#/balanco")).toBe("/balanco");
  });

  it("includes Balanço in navigation", () => {
    const html = renderNav("/balanco", dataRef);
    expect(html).toContain('href="#/balanco"');
    expect(html).toContain("Balanço mensal");
  });

  it("renders empty state without balances", () => {
    const html = renderBalancoPage(dataRef, "2026-07");
    expect(html).toContain("Situação atual");
    expect(html).toContain("Subtotais");
    expect(html).toContain("Balanço ainda não registrado");
    expect(html).toContain("Nenhum balanço registrado.");
    expect(html).toContain("balanco-page");
  });

  it("renders registered balance section", () => {
    registerMonthlyBalance(dataRef, "2026-07", "Observação teste");
    const html = renderBalancoPage(dataRef, "2026-07");
    expect(html).toContain("Registrado");
    expect(html).toContain("Valores registrados");
    expect(html).toContain("Observação teste");
    expect(html).toContain("Atualizar balanço");
  });

  it("uses responsive layout markers", () => {
    const html = renderBalancoPage(dataRef, "2026-07");
    expect(html).toContain("dashboard-kpi-grid");
    expect(html).toContain("balanco-subtotals");
    expect(html).not.toContain("dashboard-grid");
  });

  it("selects competence from history Ver action", () => {
    registerMonthlyBalance(dataRef, "2026-06");
    registerMonthlyBalance(dataRef, "2026-07");
    const host = document.createElement("div");
    const onSelect = vi.fn();
    renderBalanco(host, dataRef, mutations, () => {}, onSelect);
    host.querySelector<HTMLButtonElement>('[data-competence-month="2026-06"]')?.click();
    expect(onSelect).toHaveBeenCalledWith("2026-06");
  });

  it("opens register modal without native dialogs", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderBalanco(host, dataRef, mutations, () => {}, () => {});
    const trigger = host.querySelector<HTMLButtonElement>('[data-action="register-balance"]')!;
    trigger.focus();
    trigger.click();

    expect(document.querySelector(".modal-panel")).not.toBeNull();
    expect(document.querySelector("#balance-note")).not.toBeNull();
    expect(document.body.classList.contains("modal-open")).toBe(true);
  });

  it("closes modal on Cancelar and returns focus", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderBalanco(host, dataRef, mutations, () => {}, () => {});
    const trigger = host.querySelector<HTMLButtonElement>('[data-action="register-balance"]')!;
    trigger.focus();
    trigger.click();

    const cancel = document.querySelector<HTMLButtonElement>(".balanco-form .btn--secondary");
    cancel?.click();
    expect(document.querySelector(".modal-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps note field focus while typing", () => {
    openRegisterBalanceModal({
      data: dataRef,
      competenceMonth: "2026-07",
      mutations,
      onSaved: () => {},
      trigger: document.body,
    });
    const note = document.querySelector<HTMLTextAreaElement>("#balance-note")!;
    note.focus();
    note.value = "A";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.activeElement).toBe(note);
    note.value = "AB";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.activeElement).toBe(note);
  });

  it("does not use window.prompt confirm or alert", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    const host = document.createElement("div");
    document.body.appendChild(host);
    renderBalanco(host, dataRef, mutations, () => {}, () => {});
    host.querySelector<HTMLButtonElement>('[data-action="register-balance"]')?.click();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
