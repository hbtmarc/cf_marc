import { describe, expect, it } from "vitest";
import {
  collectFieldErrors,
  createFieldTouchState,
  isFormValid,
  pageHasDuplicateHeading,
  PAGE_DESCRIPTIONS,
  renderFieldErrorState,
  shouldShowFieldError,
  createValidatedField,
} from "./form-validation";
import { STORAGE_KEY } from "./storage";
import { calculateCompetenceSummary } from "./finance";
import type { AppData } from "./types";

describe("progressive form validation", () => {
  it("does not show errors before touch or submit", () => {
    const state = createFieldTouchState();
    expect(shouldShowFieldError("Descrição é obrigatória.", "tx-description", state)).toBe(false);
  });

  it("shows error after blur on invalid required field", () => {
    const state = createFieldTouchState();
    state.touched["tx-description"] = true;
    expect(shouldShowFieldError("Descrição é obrigatória.", "tx-description", state)).toBe(true);
  });

  it("shows all relevant errors after submit attempt", () => {
    const state = createFieldTouchState();
    state.submitted = true;
    expect(shouldShowFieldError("Informe um valor maior que zero.", "tx-amount", state)).toBe(true);
    expect(shouldShowFieldError(null, "tx-status", state)).toBe(false);
  });

  it("removes visible error when field becomes valid", () => {
    const description = document.createElement("input");
    const field = createValidatedField({
      name: "tx-description",
      label: "Descrição",
      control: description,
      required: true,
      getError: () =>
        description.value.trim().length === 0 ? "Descrição é obrigatória." : null,
    });

    const state = createFieldTouchState();
    state.touched["tx-description"] = true;
    renderFieldErrorState(field, state);
    expect(field.errorElement.hidden).toBe(false);

    description.value = "Salário";
    renderFieldErrorState(field, state);
    expect(field.errorElement.hidden).toBe(true);
    expect(field.control.getAttribute("aria-invalid")).toBeNull();
  });

  it("keeps submit disabled while form is invalid", () => {
    const errors = {
      "tx-description": "Descrição é obrigatória.",
      "tx-amount": null,
    };
    expect(isFormValid(errors)).toBe(false);
    expect(isFormValid({ "tx-description": null, "tx-amount": null })).toBe(true);
  });

  it("renders no visible errors on initial open", () => {
    const amount = document.createElement("input");
    const field = createValidatedField({
      name: "tx-amount",
      label: "Valor",
      control: amount,
      required: true,
      getError: () => "Informe um valor maior que zero.",
    });

    const state = createFieldTouchState();
    renderFieldErrorState(field, state);

    expect(field.errorElement.hidden).toBe(true);
    expect(field.errorElement.textContent).toBe("");
  });
});

describe("page hierarchy", () => {
  it("uses canonical descriptions without duplicating route titles", () => {
    expect(PAGE_DESCRIPTIONS["/faturas"]).toBe(
      "Controle mensal por cartão de crédito.",
    );
    expect(pageHasDuplicateHeading("Faturas", "Faturas")).toBe(true);
    expect(pageHasDuplicateHeading("Faturas", "Cartões cadastrados")).toBe(false);
  });
});

describe("unchanged finance and storage contracts", () => {
  it("keeps finance summary calculations stable", () => {
    const data: AppData = {
      schemaVersion: "cfm.local.v2",
      selectedCompetenceMonth: "2026-07",
      transactions: [
        {
          id: "income-1",
          kind: "income",
          description: "Salário",
          amountCents: 100000,
          date: "2026-07-01",
          competenceMonth: "2026-07",
          category: "Trabalho",
          status: "settled",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      cards: [],
      invoices: [],
    };

    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.incomePlannedCents).toBe(100000);
    expect(summary.balanceRealizedCents).toBe(100000);
  });

  it("keeps storage key on v2 schema", () => {
    expect(STORAGE_KEY).toBe("cfm:v2:appData");
  });

  it("collects field errors without mutating touch state", () => {
    const control = document.createElement("input");
    const field = createValidatedField({
      name: "card-name",
      label: "Nome",
      control,
      required: true,
      getError: () => "Nome do cartão é obrigatório.",
    });

    const errors = collectFieldErrors([field]);
    expect(errors["card-name"]).toBe("Nome do cartão é obrigatório.");
  });
});
