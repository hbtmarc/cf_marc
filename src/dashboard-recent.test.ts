import { describe, expect, it, beforeEach } from "vitest";
import {
  dashboardRecentSortAccessors,
  getDashboardRecentSort,
  renderDashboard,
  resetDashboardRecentSortForTests,
} from "./pages/dashboard";
import {
  renderDashboardRecentHeader,
  renderDashboardRecentRow,
  renderDashboardRecentTableHead,
} from "./presentation";
import { buildInstallmentProjections } from "./installments";
import { sortTableItems } from "./table-sort";
import { emptyAppData } from "./storage";
import type { AppMutations } from "./forms";
import type { AppData } from "./types";

const mutations: AppMutations = { update: () => {} };

function sampleDashboardData(): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-07",
    transactions: [
      {
        id: "income-1",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        date: "2026-07-20",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "settled",
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "expense-1",
        kind: "expense",
        description: "Aluguel",
        amountCents: 150_000,
        date: "2026-07-10",
        competenceMonth: "2026-07",
        category: "Moradia",
        status: "settled",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
      },
      {
        id: "refund-1",
        kind: "expense",
        expenseKind: "refund",
        description: "Estorno loja",
        amountCents: 12_000,
        date: "2026-07-05",
        competenceMonth: "2026-07",
        category: "Compras",
        status: "settled",
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      },
    ],
  };
}

describe("dashboard recent transactions", () => {
  beforeEach(() => {
    resetDashboardRecentSortForTests();
  });

  it("shows month income and expense totals from financial summary", () => {
    const header = renderDashboardRecentHeader({
      competenceMonth: "2026-07",
      incomePlannedCents: 500_000,
      incomeSettledCents: 500_000,
      incomePendingCents: 0,
      expensePlannedCents: 150_000,
      expensePaidCents: 150_000,
      expensePendingCents: 0,
      balancePlannedCents: 350_000,
      balanceRealizedCents: 350_000,
    });
    expect(header).toContain("Receitas do mês");
    expect(header).toContain("Despesas do mês");
    expect(header.replace(/\u00a0/g, " ")).toContain("R$ 5.000,00");
    expect(header.replace(/\u00a0/g, " ")).toContain("R$ 1.500,00");
    expect(header).toContain('href="#/lancamentos"');
  });

  it("renders sortable cfm-table with income and expense rows", () => {
    const host = document.createElement("div");
    renderDashboard(host, sampleDashboardData(), mutations, () => {});
    expect(host.querySelector(".cfm-table--dashboard-recent")).not.toBeNull();
    expect(host.querySelector(".table-sort-btn[data-sort-column='amount']")).not.toBeNull();
    expect(host.textContent).toContain("Salário");
    expect(host.textContent).toContain("Aluguel");
    expect(host.textContent).toContain("Estorno loja");
  });

  it("sorts all dashboard recent columns including signed amounts", () => {
    const items = sampleDashboardData().transactions.slice(0, 3);
    const byAmountAsc = sortTableItems(
      items,
      { column: "amount", direction: "asc" },
      dashboardRecentSortAccessors,
    );
    expect(byAmountAsc.map((item) => item.id)).toEqual(["expense-1", "refund-1", "income-1"]);

    const byDescription = sortTableItems(
      items,
      { column: "description", direction: "asc" },
      dashboardRecentSortAccessors,
    );
    expect(byDescription[0]?.description).toBe("Aluguel");

    const head = renderDashboardRecentTableHead(getDashboardRecentSort());
    expect(head).toContain('scope="col"');
    expect(head).toContain('data-sort-column="type"');
  });

  it("does not include projected installments in recent transactions", () => {
    const data: AppData = {
      ...emptyAppData(),
      selectedCompetenceMonth: "2026-07",
      cards: [
        {
          id: "card-1",
          name: "Cartão",
          closingDay: 10,
          dueDay: 20,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      transactions: [
        {
          id: "src",
          kind: "expense",
          description: "Parcelada",
          amountCents: 10_000,
          date: "2026-05-10",
          competenceMonth: "2026-05",
          category: "Compras",
          status: "settled",
          ledgerStatus: "in_invoice",
          cardId: "card-1",
          installment: { current: 2, total: 6 },
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    };
    expect(buildInstallmentProjections(data).some((item) => item.competenceMonth === "2026-07")).toBe(
      true,
    );
    const host = document.createElement("div");
    renderDashboard(host, data, mutations, () => {});
    expect(host.querySelector(".cfm-table--dashboard-recent")).toBeNull();
    expect(host.textContent).not.toContain("PROJETADA");
  });

  it("uses signed financial amounts in recent rows", () => {
    const row = renderDashboardRecentRow({
      id: "fee-1",
      kind: "expense",
      expenseKind: "fee",
      description: "Tarifa",
      amountCents: 500,
      date: "2026-07-01",
      competenceMonth: "2026-07",
      category: "Tarifas",
      status: "settled",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(row).toContain("money--negative");
  });
});
