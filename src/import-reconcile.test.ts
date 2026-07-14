import { describe, expect, it } from "vitest";
import {
  amountsApproximatelyEqual,
  categoriesHarmonize,
  descriptionsHarmonize,
  findHarmonizedExpenseMatch,
  installmentSeriesHarmonize,
} from "./import-reconcile";
import type { Transaction } from "./types";

function expense(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Pix no crédito para terceiro",
    amountCents: 4888,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Financeiro",
    status: "settled",
    ledgerStatus: "in_invoice",
    expenseKind: "expense",
    cardId: "card-nubank",
    installment: { current: 1, total: 12 },
    sourceImportId: "exp-old",
    canonicalFingerprint: "fp-old",
    createdAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
    ...partial,
  };
}

describe("import reconcile helpers", () => {
  it("accepts approximate amounts within tolerance", () => {
    expect(amountsApproximatelyEqual(4888, 4890)).toBe(true);
    expect(amountsApproximatelyEqual(4888, 4900)).toBe(false);
  });

  it("harmonizes normalized descriptions and categories", () => {
    expect(descriptionsHarmonize("  Pix   No Crédito ", "pix no crédito")).toBe(true);
    expect(categoriesHarmonize("Financeiro", "financeiro")).toBe(true);
    expect(installmentSeriesHarmonize({ current: 1, total: 12 }, { current: 1, total: 12 })).toBe(
      true,
    );
    expect(installmentSeriesHarmonize({ current: 1, total: 12 }, { current: 2, total: 10 })).toBe(
      false,
    );
  });

  it("matches reimported expense by harmony when fingerprint changes", () => {
    const existing = expense({ id: "tx-1", amountCents: 4888 });
    const mapped = {
      kind: "expense" as const,
      description: "Pix no crédito para terceiro",
      amountCents: 4890,
      date: "2026-07-10",
      competenceMonth: "2026-07",
      category: "Financeiro",
      status: "settled" as const,
      ledgerStatus: "in_invoice" as const,
      expenseKind: "expense" as const,
      cardId: "card-nubank",
      installment: { current: 1, total: 12 },
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
      sourceImportId: "exp-new",
      canonicalFingerprint: "fp-new",
    };

    const match = findHarmonizedExpenseMatch(
      {
        schemaVersion: "cfm.local.v2",
        selectedCompetenceMonth: "2026-07",
        transactions: [existing],
        cards: [],
        invoices: [],
      },
      mapped,
    );

    expect(match?.id).toBe("tx-1");
  });

  it("does not match manual expenses", () => {
    const existing = expense({ id: "tx-manual" });
    delete (existing as { sourceImportId?: string }).sourceImportId;
    const mapped: Omit<Transaction, "id"> = {
      kind: "expense",
      description: existing.description,
      amountCents: existing.amountCents,
      date: existing.date,
      competenceMonth: existing.competenceMonth,
      category: existing.category,
      status: existing.status,
      ledgerStatus: "in_invoice",
      expenseKind: "expense",
      cardId: "card-nubank",
      installment: { current: 1, total: 12 },
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      sourceImportId: "exp-new",
      canonicalFingerprint: "fp-new",
    };

    expect(
      findHarmonizedExpenseMatch(
        {
          schemaVersion: "cfm.local.v2",
          selectedCompetenceMonth: "2026-07",
          transactions: [existing],
          cards: [],
          invoices: [],
        },
        mapped,
      ),
    ).toBeUndefined();
  });
});
