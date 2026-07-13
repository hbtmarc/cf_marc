import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderBalancoPage } from "./balanco-presentation";
import type { AppMutations } from "./forms";
import {
  completeMonthlyBalanceChecklist,
  setMonthlyBalanceChecklistItem,
} from "./monthly-balance";
import { renderBalanco } from "./pages/balanco";
import { buildPaymentChecklist } from "./payment-checklist";
import { normalizeRoute } from "./router";
import { emptyAppData } from "./storage";
import type { AppData } from "./types";
import { closeModal, initUiRoots, renderNav } from "./ui";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function baseData(): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-07",
    transactions: [
      {
        id: "income",
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
      {
        id: "pending",
        kind: "expense",
        description: "Boleto",
        amountCents: 50_000,
        date: "2026-07-10",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "pending",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  };
}

let dataRef: AppData;
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

describe("balanco payment checklist page", () => {
  beforeEach(() => {
    dataRef = baseData();
    ensureDom();
  });

  afterEach(() => {
    closeModal();
    document.body.innerHTML = "";
  });

  it("keeps the existing route and renames navigation to balanço", () => {
    expect(normalizeRoute("#/balanco")).toBe("/balanco");
    const html = renderNav("/balanco", dataRef);
    expect(html).toContain('href="#/balanco"');
    expect(html).toContain("Balanço");
  });

  it("renders the four payment status labels", () => {
    const data = {
      ...baseData(),
      cards: [
        {
          id: "card",
          name: "Nubank",
          closingDay: 20,
          dueDay: 5,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      invoices: [
        {
          id: "invoice-open",
          cardId: "card",
          competenceMonth: "2026-07",
          amountCents: 80_000,
          amountDueCents: 80_000,
          amountPaidCents: 0,
          dueDate: "2026-08-01",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        {
          id: "invoice-overdue",
          cardId: "card",
          competenceMonth: "2026-07",
          amountCents: 40_000,
          amountDueCents: 40_000,
          amountPaidCents: 0,
          dueDate: "2026-07-01",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      monthlyBalances: [
        {
          id: "monthly-balance:2026-07",
          competenceMonth: "2026-07",
          incomeCents: 0,
          expenseCents: 0,
          balanceCents: 0,
          projectedBalanceCents: 0,
          fixedBillsCents: 0,
          invoicesCents: 0,
          checkedItemIds: ["expense:pending"],
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    };
    const html = renderBalancoPage(data, "2026-07");
    expect(html).toContain("Em aberto");
    expect(html).toContain("Vencida");
    expect(html).toContain("PAGO");
    expect(html).not.toContain("Paga no sistema");
    expect(html).not.toContain("Conferida");
  });

  it("renders the operational summary and checklist instead of historical balance forms", () => {
    const html = renderBalancoPage(dataRef, "2026-07");
    expect(html).toContain("Fechamento do salário");
    expect(html).toContain("Outros compromissos");
    expect(html).toContain("Concluir quitação do mês");
    expect(html).not.toContain("Histórico de balanços");
    expect(html).not.toContain("Registrar balanço");
  });

  it("checks an item only in the balance mirror", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderBalanco(host, dataRef, mutations, () => {}, () => {});
    const input = host.querySelector<HTMLInputElement>('[data-item-id="expense:pending"]')!;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(dataRef.monthlyBalances?.[0]?.checkedItemIds).toEqual(["expense:pending"]);
    expect(dataRef.transactions.find((item) => item.id === "pending")?.status).toBe("pending");
  });

  it("shows the frozen settlement after completion", () => {
    setMonthlyBalanceChecklistItem(dataRef, "2026-07", "expense:pending", true);
    completeMonthlyBalanceChecklist(
      dataRef,
      "2026-07",
      buildPaymentChecklist(dataRef, "2026-07"),
    );
    const html = renderBalancoPage(dataRef, "2026-07");
    expect(html).toContain("Quitação registrada");
    expect(html).toContain("Reabrir conferência");
    expect(html).toContain("fotografia preserva o balanço");
  });

  it("does not use native prompt, confirm or alert", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderBalanco(host, dataRef, mutations, () => {}, () => {});
    expect(promptSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
