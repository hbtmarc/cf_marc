import { describe, expect, it } from "vitest";
import {
  renderLancamentosTableHead,
  renderTransactionTableRow,
} from "./presentation";
import {
  renderMobileSortControl,
  TABLE_IDS,
  tableColumnHeaderId,
} from "./table-ui";
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

describe("table-ui mobile accessibility", () => {
  it("exposes mobile sort control with label, column and direction", () => {
    const html = renderMobileSortControl(
      [
        { id: "date", label: "Data" },
        { id: "amount", label: "Valor" },
      ],
      { column: "amount", direction: "desc" },
      "lancamentos-mobile-sort",
    );

    expect(html).toContain('for="lancamentos-mobile-sort"');
    expect(html).toContain("Ordenar por");
    expect(html).toContain('aria-label="Ordenar por: Valor, decrescente"');
    expect(html).toContain("Valor (decrescente)");
  });

  it("associates table cells with column headers programmatically", () => {
    const item = tx({ id: "a", description: "Mercado" });
    const row = renderTransactionTableRow(item);
    const amountHeaderId = tableColumnHeaderId(TABLE_IDS.lancamentos, "amount");

    expect(row).toContain(`headers="${amountHeaderId}"`);
    expect(renderLancamentosTableHead([{ id: "amount", label: "Valor" }], {
      column: "amount",
      direction: "asc",
    })).toContain(`id="${amountHeaderId}"`);
  });

  it("renders native table structure with scope on headers", () => {
    const head = renderLancamentosTableHead(
      [
        { id: "date", label: "Data" },
        { id: "amount", label: "Valor" },
      ],
      { column: "date", direction: "asc" },
    );

    expect(head).toContain("<thead>");
    expect(head).toContain('scope="col"');
  });
});
