import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData, Transaction } from "./types";
import { renderLancamentos, filters, SEARCH_DEBOUNCE_MS } from "./pages/lancamentos";
import type { AppMutations } from "./forms";

function makeData(transactions: Transaction[]): AppData {
  return {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-07",
    transactions,
    cards: [],
    invoices: [],
  };
}

const mutations: AppMutations = {
  update: () => {},
};

describe("lancamentos search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    filters.search = "";
    filters.kind = "all";
    filters.status = "all";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps search focus while typing "safe2pay" and filters results', () => {
    const data = makeData([
      {
        id: "tx-safe2pay",
        kind: "expense",
        description: "Assinatura Safe2Pay mensal",
        amountCents: 9900,
        date: "2026-07-12",
        competenceMonth: "2026-07",
        category: "Serviços",
        status: "settled",
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:00:00.000Z",
      },
      {
        id: "tx-other",
        kind: "expense",
        description: "Supermercado",
        amountCents: 25000,
        date: "2026-07-08",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "settled",
        createdAt: "2026-07-08T12:00:00.000Z",
        updatedAt: "2026-07-08T12:00:00.000Z",
      },
    ]);

    const host = document.createElement("div");
    const rerender = (): void => {
      renderLancamentos(host, data, mutations, rerender);
    };
    rerender();

    const searchInput = host.querySelector<HTMLInputElement>("#tx-search");
    expect(searchInput).not.toBeNull();
    const inputRef = searchInput!;
    searchInput!.focus();

    const query = "safe2pay";
    for (const char of query) {
      searchInput!.value += char;
      searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
      expect(host.querySelector("#tx-search")).toBe(inputRef);
    }

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(searchInput!.value).toBe("safe2pay");
    expect(host.querySelector("#tx-search")).toBe(inputRef);
    expect(host.querySelectorAll("[data-transaction-id]")).toHaveLength(1);
    expect(host.textContent).toContain("Safe2Pay");
    expect(host.textContent).not.toContain("Supermercado");
    expect(host.querySelector(".filter-chip")?.textContent).toContain("Busca: safe2pay");
  });
});
