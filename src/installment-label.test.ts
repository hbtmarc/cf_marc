import { describe, expect, it } from "vitest";
import { CASH_INSTALLMENT_LABEL, installmentDisplayLabel, installmentSortValue } from "./installment-label";
import { renderInvoiceTransactionRow } from "./presentation";
import { sortTableItems } from "./table-sort";
import { invoiceDetailSortAccessors } from "./pages/faturas";
import { emptyAppData } from "./storage";
import type { Transaction } from "./types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Compra",
    amountCents: 10_000,
    date: "2026-07-01",
    competenceMonth: "2026-07",
    category: "Compras",
    status: "settled",
    ledgerStatus: "in_invoice",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("invoice installment labels", () => {
  it('shows "À vista" for purchases without installment metadata', () => {
    const html = renderInvoiceTransactionRow(emptyAppData(), tx({ id: "cash" }));
    expect(html).toContain(CASH_INSTALLMENT_LABEL);
    expect(html).not.toContain("—");
  });

  it("keeps N/T display for installment purchases", () => {
    const html = renderInvoiceTransactionRow(
      emptyAppData(),
      tx({ id: "installment", installment: { current: 2, total: 6 } }),
    );
    expect(html).toContain("2/6");
  });

  it("sorts cash and installment rows deterministically", () => {
    const items = [
      tx({ id: "cash", description: "À vista compra" }),
      tx({ id: "installment", description: "Parcelada", installment: { current: 2, total: 6 } }),
    ];
    const sorted = sortTableItems(
      items,
      { column: "installment", direction: "asc" },
      invoiceDetailSortAccessors,
    );
    expect(sorted.map((item) => item.id)).toEqual(["cash", "installment"]);
    expect(installmentSortValue(items[0]!)).toEqual({ current: 0, total: 0 });
    expect(installmentDisplayLabel(items[0]!)).toBe("À vista");
  });
});
