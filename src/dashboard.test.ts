import { describe, expect, it } from "vitest";
import { emptyAppData } from "./storage";
import { renderDashboard } from "./pages/dashboard";
import type { AppMutations } from "./forms";

const noopMutations: AppMutations = {
  update: () => {},
};

describe("renderDashboard layout", () => {
  it("renders only the executive dashboard sections in a single column", () => {
    const host = document.createElement("div");
    const data = {
      ...emptyAppData(),
      transactions: [
        {
          id: "tx-1",
          kind: "income" as const,
          description: "Salário",
          amountCents: 500_000,
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

    const page = host.querySelector(".dashboard-page");
    expect(page).not.toBeNull();
    expect(host.querySelector(".dashboard-grid")).toBeNull();
    expect(host.querySelector(".dashboard-grid__side")).toBeNull();
    expect(host.querySelector(".dashboard-recent")).toBeNull();
    expect(host.querySelector(".dashboard-situation")).not.toBeNull();
    expect(host.querySelector(".dashboard-fixed-bills")).not.toBeNull();
    expect(host.querySelector(".dashboard-invoices")).not.toBeNull();
  });
});
