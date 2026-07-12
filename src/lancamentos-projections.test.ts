import { describe, expect, it } from "vitest";
import {
  applyLancamentoFilters,
  applyFilters,
  getLancamentosRowSortAccessors,
  lancamentosRowSortAccessors,
} from "./pages/lancamentos";
import { renderProjectedInstallmentRow } from "./presentation";
import { sortTableItems } from "./table-sort";
import {
  projectedInstallmentDisplayDescription,
  upsertTransactionDescriptionAlias,
} from "./transaction-aliases";
import { emptyAppData } from "./storage";
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
    const data = {
      ...emptyAppData(),
      transactions: [tx({ id: "src", description: "Auto Pan" })],
      transactionDescriptionAliases: [],
    };
    upsertTransactionDescriptionAlias(data, "Auto Pan", "Moto");

    const rows: LancamentoRow[] = [
      { rowKind: "transaction", data: tx({ id: "real", description: "Mercado" }) },
      {
        rowKind: "projected",
        data: {
          id: "projected:src:4",
          sourceTransactionId: "src",
          competenceMonth: "2026-03",
          description: "Auto Pan",
          amountCents: 12_000,
          category: "Eletrônicos",
          cardId: "card-1",
          installment: { current: 4, total: 6 },
          projected: true as const,
        },
      },
    ];

    const filteredByAlias = applyLancamentoFilters(
      rows,
      { search: "moto", kind: "all", status: "all" },
      data,
    );
    const filteredByOriginal = applyLancamentoFilters(
      rows,
      { search: "auto pan", kind: "all", status: "all" },
      data,
    );
    const sorted = sortTableItems(
      filteredByAlias,
      { column: "amount", direction: "asc" },
      getLancamentosRowSortAccessors(data),
    );

    expect(filteredByAlias).toHaveLength(1);
    expect(filteredByOriginal).toHaveLength(1);
    expect(sorted[0]?.rowKind).toBe("projected");
    const projectedRow = rows[1];
    expect(projectedRow?.rowKind).toBe("projected");
    if (projectedRow?.rowKind === "projected") {
      expect(projectedInstallmentDisplayDescription(data, projectedRow.data)).toBe("Moto");
    }
  });

  it("keeps legacy transaction filter behavior for real items", () => {
    const items = [
      tx({ id: "a", description: "Alpha" }),
      tx({ id: "b", description: "Beta", status: "settled" }),
    ];
    const filtered = applyFilters(items, { search: "Alpha", kind: "all", status: "all" });
    expect(filtered.map((item) => item.id)).toEqual(["a"]);
  });

  it("renders projected rows with alias and without edit actions", () => {
    const data = {
      ...emptyAppData(),
      transactions: [tx({ id: "src", description: "Auto Pan" })],
    };
    upsertTransactionDescriptionAlias(data, "Auto Pan", "Moto");
    const item = {
      id: "projected:src:3",
      sourceTransactionId: "src",
      competenceMonth: "2026-04",
      description: "Auto Pan",
      amountCents: 15_000,
      category: "Eletrônicos",
      cardId: "card-1",
      installment: { current: 3, total: 6 },
      projected: true as const,
    };

    const html = renderProjectedInstallmentRow(data, item);

    expect(html).toContain("Moto");
    expect(html).toContain("PROJETADA");
    expect(html).not.toContain("data-row-actions");
    expect(html).toContain("3/6");
    expect(data.transactions[0]?.description).toBe("Auto Pan");
  });

  it("falls back to original description without alias", () => {
    const data = {
      ...emptyAppData(),
      transactions: [tx({ id: "src", description: "Notebook futuro" })],
    };
    const item = {
      id: "projected:src:3",
      sourceTransactionId: "src",
      competenceMonth: "2026-04",
      description: "Notebook futuro",
      amountCents: 15_000,
      category: "Eletrônicos",
      cardId: "card-1",
      installment: { current: 3, total: 6 },
      projected: true as const,
    };
    const html = renderProjectedInstallmentRow(data, item);
    expect(html).toContain("Notebook futuro");
  });

  it("uses legacy sort accessors without data for projected description field", () => {
    const rows: LancamentoRow[] = [
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
          projected: true as const,
        },
      },
    ];
    expect(lancamentosRowSortAccessors.description.getValue(rows[0]!)).toBe("Notebook futuro");
  });
});
