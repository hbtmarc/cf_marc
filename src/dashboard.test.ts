import { describe, expect, it } from "vitest";
import { emptyAppData } from "./storage";
import { renderDashboard } from "./pages/dashboard";
import type { AppMutations } from "./forms";

const noopMutations: AppMutations = {
  addTransaction: () => {},
  updateTransaction: () => {},
  deleteTransaction: () => {},
  addCard: () => {},
  updateCard: () => {},
  deleteCard: () => {},
  addInvoice: () => {},
  updateInvoice: () => {},
  deleteInvoice: () => {},
  setCompetenceMonth: () => {},
};

describe("renderDashboard layout", () => {
  it("keeps recent transactions inside the primary column stack", () => {
    const host = document.createElement("div");
    const data = {
      ...emptyAppData(),
      transactions: [
        {
          id: "tx-1",
          kind: "income" as const,
          description: "Salário",
          amountCents: 500000,
          date: "2026-07-05",
          competenceMonth: "2026-07",
          category: "Trabalho",
          status: "settled" as const,
          createdAt: "2026-07-05T12:00:00.000Z",
          updatedAt: "2026-07-05T12:00:00.000Z",
        },
      ],
    };

    renderDashboard(host, data, noopMutations, () => {});

    const primary = host.querySelector(".dashboard-grid__primary");
    const recent = host.querySelector(".dashboard-recent");
    expect(primary).not.toBeNull();
    expect(recent).not.toBeNull();
    expect(primary?.contains(recent!)).toBe(true);
    expect(host.querySelector(".dashboard-secondary")).toBeNull();
  });
});
