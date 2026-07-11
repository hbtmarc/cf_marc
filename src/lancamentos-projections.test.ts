import { describe, expect, it } from "vitest";
import {
  applyLancamentoFilters,
  applyFilters,
  lancamentosRowSortAccessors,
} from "./pages/lancamentos";
import { renderProjectedInstallmentRow } from "./presentation";
import { sortTableItems } from "./table-sort";
import type { LancamentoRow } from "./installments";
import type { Transaction } from "./types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Compra parcelada",
    amountCents: 10_000,
    date: "2026-03-01",
    competenceMonth: "2026-03",
    category: "Compras",
    status: "pending",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  };
}

describe("lancamentos projected rows", () => {
  it("supports search and sorting with projected rows", () => {
    const rows: LancamentoRow[] = [
      { rowKind: "transaction", data: tx({ id: "real", description: "Mercado" }) },
      {
        rowKind: "projected",
        data: {
          id: "projected:src:4",
          sourceTransactionId: "src",
          competenceMonth: "2026-03",
          description: "Notebook futuro",
          amountCents: 12_000,
          category: "Eletrônicos",
          cardId: "card-1",
          installment: { current: 4, total: 6 },
          projected: true,
        },
      },
    ];

    const filtered = applyLancamentoFilters(rows, {
      search: "notebook",
      kind: "all",
      status: "all",
    });
    const sorted = sortTableItems(
      filtered,
      { column: "amount", direction: "asc" },
      lancamentosRowSortAccessors,
    );

    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.rowKind).toBe("projected");
  });

  it("keeps legacy transaction filter behavior for real items", () => {
    const items = [
      tx({ id: "a", description: "Alpha" }),
      tx({ id: "b", description: "Beta", status: "settled" }),
    ];
    const filtered = applyFilters(items, { search: "Alpha", kind: "all", status: "all" });
    expect(filtered.map((item) => item.id)).toEqual(["a"]);
  });

  it("renders projected rows without edit or delete actions", () => {
    const html = renderProjectedInstallmentRow({
      id: "projected:src:3",
      sourceTransactionId: "src",
      competenceMonth: "2026-04",
      description: "Eletrônicos parcelado demo",
      amountCents: 15_000,
      category: "Eletrônicos",
      cardId: "card-1",
      installment: { current: 3, total: 6 },
      projected: true,
    });

    expect(html).toContain("PROJETADA");
    expect(html).not.toContain("data-row-actions");
    expect(html).toContain("3/6");
  });
});
