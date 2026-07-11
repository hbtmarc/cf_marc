import { describe, expect, it } from "vitest";
import {
  compareSortValues,
  INVOICE_STATUS_SORT_ORDER,
  sortTableItems,
  toggleTableSort,
  TRANSACTION_STATUS_SORT_ORDER,
  type TableSortState,
} from "./table-sort";
import { renderSortableTh } from "./table-ui";
import {
  applyFilters,
  getLancamentosTableSort,
  lancamentosSortAccessors,
} from "./pages/lancamentos";
import { invoiceDetailSortAccessors } from "./pages/faturas";
import { filterTransactionsByCompetence, transactionDisplayedAmountCents } from "./finance";
import type { Transaction } from "./types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Item",
    amountCents: 1000,
    date: "2026-07-01",
    competenceMonth: "2026-07",
    category: "Casa",
    status: "settled",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...partial,
  };
}

describe("table-sort helper", () => {
  it("toggles ascending and descending on the same column", () => {
    const initial = { column: "date" as const, direction: "desc" as const };
    expect(toggleTableSort(initial, "date", "asc")).toEqual({
      column: "date",
      direction: "asc",
    });
    expect(toggleTableSort({ column: "date", direction: "asc" }, "amount", "asc")).toEqual({
      column: "amount",
      direction: "asc",
    });
  });

  it("sorts dates chronologically", () => {
    const items = [
      tx({ id: "a", date: "2026-07-03" }),
      tx({ id: "b", date: "2026-07-01" }),
    ];
    const sorted = sortTableItems(items, { column: "date", direction: "asc" }, lancamentosSortAccessors);
    expect(sorted.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("sorts mixed financial amounts by displayed sign ascending and descending", () => {
    const items = [
      tx({ id: "income", kind: "income", amountCents: 500_000 }),
      tx({ id: "refund", kind: "expense", expenseKind: "refund", amountCents: 11_223 }),
      tx({ id: "expense-small", kind: "expense", amountCents: 1_000 }),
      tx({ id: "fee", kind: "expense", expenseKind: "fee", amountCents: 2_000 }),
      tx({ id: "expense-large", kind: "expense", amountCents: 112_185 }),
    ];

    const asc = sortTableItems(items, { column: "amount", direction: "asc" }, lancamentosSortAccessors);
    expect(asc.map((item) => item.id)).toEqual([
      "expense-large",
      "fee",
      "expense-small",
      "refund",
      "income",
    ]);

    const desc = sortTableItems(items, { column: "amount", direction: "desc" }, lancamentosSortAccessors);
    expect(desc.map((item) => item.id)).toEqual([
      "income",
      "refund",
      "expense-small",
      "fee",
      "expense-large",
    ]);
  });

  it("treats refund as positive and fee as negative for sorting", () => {
    expect(transactionDisplayedAmountCents(tx({ id: "r", expenseKind: "refund", amountCents: 500 }))).toBe(
      500,
    );
    expect(
      transactionDisplayedAmountCents(tx({ id: "f", expenseKind: "fee", amountCents: 500 })),
    ).toBe(-500);
  });

  it("sorts invoice detail amounts by financial sign", () => {
    const items = [
      tx({ id: "purchase", kind: "expense", amountCents: 10_000 }),
      tx({ id: "credit", kind: "expense", expenseKind: "refund", amountCents: 2_000 }),
      tx({ id: "tariff", kind: "expense", expenseKind: "fee", amountCents: 500 }),
    ];
    const sorted = sortTableItems(
      items,
      { column: "amount", direction: "asc" },
      invoiceDetailSortAccessors,
    );
    expect(sorted.map((item) => item.id)).toEqual(["purchase", "tariff", "credit"]);
  });

  it("sorts amounts numerically", () => {
    const items = [
      tx({ id: "a", kind: "income", amountCents: 5000 }),
      tx({ id: "b", kind: "income", amountCents: 1000 }),
    ];
    const sorted = sortTableItems(items, { column: "amount", direction: "asc" }, lancamentosSortAccessors);
    expect(sorted.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("sorts text alphabetically", () => {
    const result = compareSortValues("Banana", "Abacaxi", "text", "asc");
    expect(result).toBeGreaterThan(0);
  });

  it("sorts installments by current then total", () => {
    const result = compareSortValues(
      { current: 2, total: 6 },
      { current: 1, total: 3 },
      "installment",
      "asc",
    );
    expect(result).toBeGreaterThan(0);
  });

  it("sorts status using explicit order", () => {
    const result = compareSortValues("Paga", "Aberta", "status", "asc", INVOICE_STATUS_SORT_ORDER);
    expect(result).toBeGreaterThan(0);
    expect(TRANSACTION_STATUS_SORT_ORDER.indexOf("Na fatura")).toBeLessThan(
      TRANSACTION_STATUS_SORT_ORDER.indexOf("Pendente"),
    );
  });

  it("keeps missing values last in both directions", () => {
    expect(compareSortValues(null, "abc", "text", "asc")).toBe(1);
    expect(compareSortValues(null, "abc", "text", "desc")).toBe(1);
    expect(
      compareSortValues(
        { current: null, total: null },
        { current: 1, total: 2 },
        "installment",
        "asc",
      ),
    ).toBe(1);
  });

  it("does not mutate the original array", () => {
    const items = [tx({ id: "a", date: "2026-07-03" }), tx({ id: "b", date: "2026-07-01" })];
    const copy = [...items];
    sortTableItems(items, { column: "date", direction: "asc" }, lancamentosSortAccessors);
    expect(items).toEqual(copy);
  });

  it("renders aria-sort only on active header th", () => {
    const state: TableSortState<"date" | "amount"> = { column: "date", direction: "desc" };
    const active = renderSortableTh({ id: "date", label: "Data" }, state);
    const inactive = renderSortableTh({ id: "amount", label: "Valor" }, state);
    expect(active).toMatch(/<th[^>]*aria-sort="descending"/);
    expect(active).not.toMatch(/<button[^>]*aria-sort/);
    expect(inactive).not.toContain("aria-sort");
  });
});

describe("lancamentos sort persistence", () => {
  it("keeps table sort after filtering", () => {
    const items = [
      tx({ id: "a", date: "2026-07-10", description: "Alpha" }),
      tx({ id: "b", date: "2026-07-01", description: "Beta" }),
    ];
    const filtered = applyFilters(items, { search: "Alpha", kind: "all", status: "all" });
    const sorted = sortTableItems(filtered, getLancamentosTableSort(), lancamentosSortAccessors);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.id).toBe("a");
    expect(getLancamentosTableSort()).toEqual({ column: "date", direction: "desc" });
  });

  it("keeps table sort after competence filtering and search", () => {
    const items = [
      tx({ id: "jul", competenceMonth: "2026-07", description: "Julho Alpha", amountCents: 100 }),
      tx({ id: "jun", competenceMonth: "2026-06", description: "Junho Beta", amountCents: 200 }),
      tx({ id: "jul-b", competenceMonth: "2026-07", description: "Julho Beta", amountCents: 300 }),
    ];
    const inCompetence = filterTransactionsByCompetence(items, "2026-07");
    const filtered = applyFilters(inCompetence, { search: "Alpha", kind: "all", status: "all" });
    const sorted = sortTableItems(
      filtered,
      { column: "amount", direction: "asc" },
      lancamentosSortAccessors,
    );
    expect(sorted.map((item) => item.id)).toEqual(["jul"]);
  });
});
