import { describe, expect, it } from "vitest";
import {
  buildInstallmentProjections,
  isInstallmentProjectionCandidate,
  projectedInstallmentCentsForMonth,
  projectedInstallmentId,
  projectedInstallmentsForMonth,
  projectInstallmentsFromSource,
  selectInstallmentProjectionSources,
} from "./installments";
import { calculateCompetenceSummary } from "./finance";
import type { AppData, Transaction } from "./types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Compra parcelada",
    amountCents: 10_000,
    date: "2026-01-15",
    competenceMonth: "2026-01",
    category: "Compras",
    status: "settled",
    ledgerStatus: "in_invoice",
    cardId: "card-1",
    createdAt: "2026-01-15T12:00:00.000Z",
    updatedAt: "2026-01-15T12:00:00.000Z",
    ...partial,
  };
}

function baseData(transactions: Transaction[], invoices: AppData["invoices"] = []): AppData {
  return {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-01",
    transactions,
    cards: [
      {
        id: "card-1",
        name: "Cartão Demo",
        closingDay: 10,
        dueDay: 20,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    invoices,
  };
}

describe("installment projection engine", () => {
  it("generates exactly four future installments from 2/6", () => {
    const source = tx({
      id: "src-2-6",
      installment: { current: 2, total: 6 },
      competenceMonth: "2026-01",
    });
    const projections = projectInstallmentsFromSource(source);

    expect(projections).toHaveLength(4);
    expect(projections.map((item) => item.installment.current)).toEqual([3, 4, 5, 6]);
    expect(projections.map((item) => item.competenceMonth)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });

  it("does not generate projections from 6/6", () => {
    const source = tx({
      id: "src-6-6",
      installment: { current: 6, total: 6 },
    });
    expect(projectInstallmentsFromSource(source)).toEqual([]);
    expect(isInstallmentProjectionCandidate(source)).toBe(false);
  });

  it("handles year rollover from 2026-12 to 2027-01", () => {
    const source = tx({
      id: "src-dec",
      installment: { current: 1, total: 3 },
      competenceMonth: "2026-12",
    });
    const projections = projectInstallmentsFromSource(source);
    expect(projections.map((item) => item.competenceMonth)).toEqual(["2027-01", "2027-02"]);
  });

  it("preserves description, amount, category and card", () => {
    const source = tx({
      id: "src-meta",
      description: "Notebook Pro",
      amountCents: 25_000,
      category: "Eletrônicos",
      cardId: "card-1",
      installment: { current: 1, total: 4 },
    });
    const projection = projectInstallmentsFromSource(source)[0];
    expect(projection).toMatchObject({
      description: "Notebook Pro",
      amountCents: 25_000,
      category: "Eletrônicos",
      cardId: "card-1",
      sourceTransactionId: "src-meta",
      projected: true,
    });
  });

  it("uses deterministic projected ids", () => {
    expect(projectedInstallmentId("tx-abc", 4)).toBe("projected:tx-abc:4");
    const source = tx({ id: "tx-abc", installment: { current: 3, total: 5 } });
    expect(projectInstallmentsFromSource(source)[0]?.id).toBe("projected:tx-abc:4");
  });

  it("does not duplicate projections when 5/12 and 6/12 are both observed", () => {
    const data = baseData([
      tx({
        id: "jun-5-12",
        competenceMonth: "2026-06",
        installment: { current: 5, total: 12 },
        canonicalFingerprint: "fp-a",
      }),
      tx({
        id: "jul-6-12",
        competenceMonth: "2026-07",
        installment: { current: 6, total: 12 },
        canonicalFingerprint: "fp-a",
      }),
    ]);
    const projections = buildInstallmentProjections(data);
    const august = projections.filter((item) => item.competenceMonth === "2026-08");

    expect(august).toHaveLength(1);
    expect(august[0]?.installment.current).toBe(7);
    expect(august[0]?.sourceTransactionId).toBe("jul-6-12");
  });

  it("preserves two distinct purchases in the latest competence", () => {
    const data = baseData([
      tx({
        id: "purchase-a",
        competenceMonth: "2026-07",
        installment: { current: 2, total: 6 },
        canonicalFingerprint: "fp-a",
      }),
      tx({
        id: "purchase-b",
        competenceMonth: "2026-07",
        description: "Compra parcelada",
        installment: { current: 1, total: 6 },
        canonicalFingerprint: "fp-b",
      }),
    ]);

    const sources = selectInstallmentProjectionSources(data.transactions);
    expect(sources.map((item) => item.id).sort()).toEqual(["purchase-a", "purchase-b"]);
    expect(sources[0]?.canonicalFingerprint).not.toBe(sources[1]?.canonicalFingerprint);
  });

  it("does not project refund or fee", () => {
    expect(
      isInstallmentProjectionCandidate(
        tx({ id: "refund", expenseKind: "refund", installment: { current: 1, total: 3 } }),
      ),
    ).toBe(false);
    expect(
      isInstallmentProjectionCandidate(
        tx({ id: "fee", expenseKind: "fee", installment: { current: 1, total: 3 } }),
      ),
    ).toBe(false);
  });

  it("prevents double counting when a real invoice exists for the card and month", () => {
    const data = baseData(
      [
        tx({
          id: "src-2-3",
          installment: { current: 2, total: 3 },
          competenceMonth: "2026-01",
        }),
      ],
      [
        {
          id: "inv-feb",
          cardId: "card-1",
          competenceMonth: "2026-02",
          amountCents: 10_000,
          amountDueCents: 10_000,
          dueDate: "2026-02-20",
          status: "open",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    );

    expect(projectedInstallmentsForMonth(data, "2026-02")).toHaveLength(0);
    expect(projectedInstallmentCentsForMonth(data, "2026-02")).toBe(0);
  });

  it("includes projections in committed totals when there is no invoice", () => {
    const data = baseData([
      tx({
        id: "src-2-3",
        installment: { current: 2, total: 3 },
        competenceMonth: "2026-01",
        amountCents: 8_000,
      }),
    ]);
    const summary = calculateCompetenceSummary(data, "2026-02");

    expect(projectedInstallmentCentsForMonth(data, "2026-02")).toBe(8_000);
    expect(summary.expensePendingCents).toBe(8_000);
    expect(summary.expensePlannedCents).toBe(8_000);
    expect(summary.balancePlannedCents).toBe(-8_000);
  });

  it("does not change realized totals with projections", () => {
    const data = baseData([
      tx({
        id: "src-2-6",
        installment: { current: 2, total: 6 },
        competenceMonth: "2026-01",
      }),
    ]);
    const withoutView = calculateCompetenceSummary(data, "2026-01");
    const withFutureView = calculateCompetenceSummary(data, "2026-03");

    expect(withFutureView.balanceRealizedCents).toBe(0);
    expect(withFutureView.expensePaidCents).toBe(0);
    expect(withoutView.balanceRealizedCents).toBe(withFutureView.balanceRealizedCents);
  });

  it("does not mutate source data when building projections", () => {
    const data = baseData([
      tx({
        id: "src-2-4",
        installment: { current: 1, total: 4 },
      }),
    ]);
    const snapshot = structuredClone(data);
    buildInstallmentProjections(data);
    expect(data).toEqual(snapshot);
  });
});
