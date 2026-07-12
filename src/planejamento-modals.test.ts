import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppMutations } from "./forms";
import {
  openCreateRuleModal,
  openEditRuleModal,
  openUpdateRuleValueModal,
  resetPlanejamentoModalsForTests,
} from "./planejamento-modals";
import { renderPlanejamento, resetPlanejamentoUiStateForTests } from "./pages/planejamento";
import { emptyAppData } from "./storage";
import type { AppData, RecurringRule } from "./types";
import { closeModal, initUiRoots } from "./ui";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id">): RecurringRule {
  return {
    kind: "expense",
    description: "Internet",
    amountCents: 12_990,
    category: "Moradia",
    dayOfMonth: 10,
    startMonth: "2026-07",
    status: "active",
    billingMode: "direct",
    recurrenceClass: "fixed_bill",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...partial,
  };
}

function baseData(options: Partial<AppData> = {}): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-07",
    cards: [
      {
        id: "card-1",
        name: "Cartão Demo",
        closingDay: 10,
        dueDay: 20,
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

function ensureModalDom(): void {
  document.body.innerHTML = `
    <div class="app-shell"></div>
    <div id="modal-root"></div>
    <div id="live-region" aria-live="polite"></div>
  `;
  initUiRoots();
}

function openModalFromPage(action: string, ruleId?: string): HTMLButtonElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  renderPlanejamento(host, dataRef, mutations, () => {});
  const selector = ruleId
    ? `[data-action='${action}'][data-rule-id='${ruleId}']`
    : `[data-action='${action}']`;
  const button = host.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Missing action button: ${action}`);
  }
  button.focus();
  button.click();
  return button;
}

describe("planejamento modals", () => {
  beforeEach(() => {
    resetPlanejamentoUiStateForTests();
    resetPlanejamentoModalsForTests();
    dataRef = baseData();
    ensureModalDom();
  });

  afterEach(() => {
    closeModal();
    resetPlanejamentoModalsForTests();
    resetPlanejamentoUiStateForTests();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("opens Nova regra in modal without inline form host", () => {
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    expect(host.querySelector("#planejamento-form-host")).toBeNull();

    document.dispatchEvent(new CustomEvent("cfm:planejamento-new-rule"));

    const modalRoot = document.getElementById("modal-root");
    expect(modalRoot?.classList.contains("modal-root--open")).toBe(true);
    expect(modalRoot?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(modalRoot?.querySelector("#planejamento-rule-form")).not.toBeNull();
    expect(modalRoot?.querySelector(".modal-panel__title")?.textContent).toBe("Nova regra");
  });

  it("opens Editar fixa in modal for fixed_bill rules", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-fixed" })] });
    const trigger = openModalFromPage("edit-rule", "rule-fixed");

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.querySelector(".modal-panel__title")?.textContent).toBe("Editar fixa");
    expect(document.querySelector("#planejamento-rule-form")).not.toBeNull();
    expect(document.querySelector(".planejamento-page #planejamento-rule-form")).toBeNull();

    closeModal();
    expect(document.activeElement).toBe(trigger);
  });

  it("opens Atualizar valor modal instead of native prompt", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
    dataRef = baseData({ recurringRules: [rule({ id: "rule-value" })] });
    openModalFromPage("update-rule-value", "rule-value");

    expect(promptSpy).not.toHaveBeenCalled();
    expect(document.querySelector(".modal-panel__title")?.textContent).toBe("Atualizar valor");
    expect(document.querySelector("#rule-new-amount")).not.toBeNull();
    expect(document.querySelector("#rule-effective-month")).not.toBeNull();
    expect(document.body.textContent).toContain(
      "O valor anterior será preservado até a competência anterior.",
    );
    promptSpy.mockRestore();
  });

  it("preserves previous amount and applies new value from selected month", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-value", amountCents: 10_000, startMonth: "2026-06" })],
    });
    openUpdateRuleValueModal({
      data: dataRef,
      month: "2026-08",
      mutations,
      onSaved: () => {},
      rule: dataRef.recurringRules![0]!,
    });

    const amountInput = document.querySelector<HTMLInputElement>("#rule-new-amount");
    const monthInput = document.querySelector<HTMLInputElement>("#rule-effective-month");
    amountInput!.value = "159,90";
    monthInput!.value = "2026-08";
    document.querySelector<HTMLButtonElement>(".btn--primary")?.click();

    const versions = (dataRef.recurringRules ?? []).filter(
      (item) => (item.seriesId ?? item.id) === "rule-value",
    );
    expect(versions.length).toBeGreaterThan(1);
    const oldVersion = versions.find((item) => item.endMonth === "2026-07");
    const newVersion = versions.find((item) => item.startMonth === "2026-08");
    expect(oldVersion?.amountCents).toBe(10_000);
    expect(newVersion?.amountCents).toBe(15_990);
  });

  it("cancel does not change rule data", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-value", amountCents: 10_000 })] });
    const before = JSON.stringify(dataRef.recurringRules);
    openUpdateRuleValueModal({
      data: dataRef,
      month: "2026-07",
      mutations,
      onSaved: () => {},
      rule: dataRef.recurringRules![0]!,
    });
    document.querySelector<HTMLButtonElement>(".btn--secondary")?.click();
    expect(JSON.stringify(dataRef.recurringRules)).toBe(before);
  });

  it("focuses initial field inside modal", () => {
    openCreateRuleModal({ data: dataRef, month: "2026-07", mutations, onSaved: () => {} });
    expect(document.activeElement?.id).toBe("rule-description");
  });

  it("keeps input node stable while typing", () => {
    openCreateRuleModal({ data: dataRef, month: "2026-07", mutations, onSaved: () => {} });
    const description = document.querySelector<HTMLInputElement>("#rule-description");
    const inputRef = description;
    description!.value = "Plano";
    description!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector("#rule-description")).toBe(inputRef);
  });

  it("does not submit invalid rule form on Enter", () => {
    openCreateRuleModal({ data: dataRef, month: "2026-07", mutations, onSaved: () => {} });
    const form = document.querySelector<HTMLFormElement>("#planejamento-rule-form");
    form?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    form?.requestSubmit();
    expect(dataRef.recurringRules ?? []).toHaveLength(0);
    expect(document.getElementById("modal-root")?.classList.contains("modal-root--open")).toBe(
      true,
    );
  });

  it("closes modal on Escape and restores focus", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-fixed" })] });
    const trigger = openModalFromPage("edit-rule", "rule-fixed");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("modal-root")?.classList.contains("modal-root--open")).toBe(
      false,
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("traps Tab focus inside modal", () => {
    openCreateRuleModal({ data: dataRef, month: "2026-07", mutations, onSaved: () => {} });
    const panel = document.querySelector<HTMLElement>(".modal-panel");
    expect(panel).not.toBeNull();
    const focusable = panel!.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable[focusable.length - 1];
    last?.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(focusable[0]?.contains(document.activeElement) || document.activeElement).toBeTruthy();
    expect(panel?.contains(document.activeElement)).toBe(true);
  });

  it("uses mobile-safe modal width without horizontal overflow styles", () => {
    openCreateRuleModal({ data: dataRef, month: "2026-07", mutations, onSaved: () => {} });
    const panel = document.querySelector<HTMLElement>(".modal-panel--form");
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("modal-panel--form")).toBe(true);
    expect(getComputedStyle(document.body).overflow).not.toBe("scroll");
  });

  it("shows Fixas nomenclature in rules section", () => {
    dataRef = baseData({
      recurringRules: [
        rule({ id: "rule-fixed", recurrenceClass: "fixed_bill" }),
        rule({
          id: "rule-sub",
          description: "Streaming",
          recurrenceClass: "card_subscription",
          billingMode: "card",
          cardId: "card-1",
        }),
        rule({
          id: "rule-income",
          kind: "income",
          description: "Salário",
          recurrenceClass: "income",
        }),
      ],
    });
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    expect(host.textContent).toContain("Fixas");
    expect(host.textContent).toContain("Assinaturas");
    expect(host.textContent).toContain("Receitas previstas");
    expect(host.textContent).not.toContain("Despesas recorrentes");
    expect(host.textContent).not.toContain("Conta fixa");
  });

  it("uses contextual edit titles per recurrence class", () => {
    openEditRuleModal({
      data: dataRef,
      month: "2026-07",
      mutations,
      onSaved: () => {},
      rule: rule({ id: "income", kind: "income", recurrenceClass: "income" }),
    });
    expect(document.querySelector(".modal-panel__title")?.textContent).toBe(
      "Editar receita prevista",
    );
    closeModal();

    openEditRuleModal({
      data: dataRef,
      month: "2026-07",
      mutations,
      onSaved: () => {},
      rule: rule({
        id: "sub",
        recurrenceClass: "card_subscription",
        billingMode: "card",
        cardId: "card-1",
      }),
    });
    expect(document.querySelector(".modal-panel__title")?.textContent).toBe("Editar assinatura");
  });
});
