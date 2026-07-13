import { describe, expect, it, vi } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import {
  buildMonthlyBalanceSnapshot,
  completeMonthlyBalanceChecklist,
  getMonthlyBalanceByCompetence,
  reopenMonthlyBalanceChecklist,
  setMonthlyBalanceChecklistItem,
} from "./monthly-balance";
import { buildPaymentChecklist } from "./payment-checklist";
import { emptyAppData, parseAppDataJson } from "./storage";
import type { AppData } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function baseData(): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-07",
    transactions: [
      {
        id: "income",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        date: "2026-07-05",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "pending",
        kind: "expense",
        description: "Boleto",
        amountCents: 50_000,
        date: "2026-07-10",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "pending",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  };
}

describe("monthly payment balance", () => {
  it("creates checklist state without changing financial source records", () => {
    const data = baseData();
    setMonthlyBalanceChecklistItem(data, "2026-07", "expense:pending", true);

    const balance = getMonthlyBalanceByCompetence(data, "2026-07");
    expect(balance?.checkedItemIds).toEqual(["expense:pending"]);
    expect(data.transactions.find((item) => item.id === "pending")?.status).toBe("pending");
  });

  it("captures the exact financial snapshot when the checklist is completed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T15:00:00.000Z"));
    const data = baseData();
    setMonthlyBalanceChecklistItem(data, "2026-07", "expense:pending", true);
    const checklist = buildPaymentChecklist(data, "2026-07");

    const completed = completeMonthlyBalanceChecklist(data, "2026-07", checklist);
    const snapshot = buildMonthlyBalanceSnapshot(data, "2026-07");

    expect(completed.settledAt).toBe("2026-07-12T15:00:00.000Z");
    expect(completed.balanceCents).toBe(snapshot.balanceCents);
    expect(completed.checklistTotalCount).toBe(1);
    expect(completed.checklistRemainingCents).toBe(0);
    expect(completed.sourceOutstandingCents).toBe(50_000);
    expect(completed.estimatedBalanceAfterCommitmentsCents).toBe(450_000);
    vi.useRealTimers();
  });

  it("does not complete while items remain unchecked", () => {
    const data = baseData();
    const checklist = buildPaymentChecklist(data, "2026-07");
    expect(() =>
      completeMonthlyBalanceChecklist(data, "2026-07", checklist),
    ).toThrow(/Conclua todos/);
  });

  it("reopens a completed checklist and preserves manual checks", () => {
    const data = baseData();
    setMonthlyBalanceChecklistItem(data, "2026-07", "expense:pending", true);
    completeMonthlyBalanceChecklist(
      data,
      "2026-07",
      buildPaymentChecklist(data, "2026-07"),
    );

    const reopened = reopenMonthlyBalanceChecklist(data, "2026-07");
    expect(reopened?.settledAt).toBeUndefined();
    expect(reopened?.checkedItemIds).toEqual(["expense:pending"]);
  });

  it("loads legacy data without checklist fields", () => {
    const legacy = {
      schemaVersion: "cfm.local.v2",
      selectedCompetenceMonth: "2026-07",
      transactions: [],
      cards: [],
      invoices: [],
      monthlyBalances: [
        {
          id: "monthly-balance:2026-07",
          competenceMonth: "2026-07",
          incomeCents: 0,
          expenseCents: 0,
          balanceCents: 0,
          projectedBalanceCents: 0,
          fixedBillsCents: 0,
          invoicesCents: 0,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    };
    const parsed = parseAppDataJson(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
  });

  it("preserves checklist records on reimport", () => {
    const data = baseData();
    setMonthlyBalanceChecklistItem(data, "2026-07", "expense:pending", true);
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const validated = validateImportDocument(parsed.value, "fixture.json");
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const result = applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    expect(result.errors).toHaveLength(0);
    expect(getMonthlyBalanceByCompetence(data, "2026-07")?.checkedItemIds).toEqual([
      "expense:pending",
    ]);
  });
});
