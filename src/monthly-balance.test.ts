import { describe, expect, it, vi } from "vitest";
import { calculateCompetenceSummary } from "./finance";
import {
  buildDashboardFixedBills,
  buildDashboardInvoicesSubtotalCents,
} from "./dashboard-executive";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import {
  buildMonthlyBalanceSnapshot,
  getMonthlyBalanceByCompetence,
  listMonthlyBalances,
  monthlyBalanceId,
  registerMonthlyBalance,
  updateMonthlyBalance,
} from "./monthly-balance";
import { emptyAppData, parseAppDataJson } from "./storage";
import type { AppData, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Despesa",
    amountCents: 10_000,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Casa",
    status: "settled",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...partial,
  };
}

function baseData(options: Partial<AppData> = {}): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-07",
    transactions: [
      tx({ id: "tx-income", kind: "income", amountCents: 500_000, status: "settled" }),
      tx({ id: "tx-expense", amountCents: 150_000, status: "settled" }),
    ],
    recurringRules: [
      {
        id: "rule-fixed",
        kind: "expense",
        description: "Internet",
        amountCents: 12_990,
        category: "Casa",
        dayOfMonth: 10,
        startMonth: "2026-07",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    cards: [
      {
        id: "card-1",
        name: "Cartão Demo",
        closingDay: 10,
        dueDay: 20,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    invoices: [
      {
        id: "inv-1",
        cardId: "card-1",
        competenceMonth: "2026-07",
        amountCents: 80_000,
        dueDate: "2026-07-20",
        status: "open",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    ...options,
  };
}

describe("monthly balance operations", () => {
  it("builds snapshot from calculateCompetenceSummary and dashboard builders", () => {
    const data = baseData();
    const summary = calculateCompetenceSummary(data, "2026-07");
    const fixed = buildDashboardFixedBills(data, "2026-07");
    const invoices = buildDashboardInvoicesSubtotalCents(data, "2026-07");
    const snapshot = buildMonthlyBalanceSnapshot(data, "2026-07");

    expect(snapshot.incomeCents).toBe(summary.incomeSettledCents);
    expect(snapshot.expenseCents).toBe(summary.expensePaidCents);
    expect(snapshot.balanceCents).toBe(summary.balanceRealizedCents);
    expect(snapshot.projectedBalanceCents).toBe(summary.balancePlannedCents);
    expect(snapshot.fixedBillsCents).toBe(fixed.subtotalCents);
    expect(snapshot.invoicesCents).toBe(invoices);
  });

  it("creates a single balance with deterministic id and optional note", () => {
    const data = baseData();
    const balance = registerMonthlyBalance(data, "2026-07", "Fechamento parcial");

    expect(balance.id).toBe(monthlyBalanceId("2026-07"));
    expect(balance.note).toBe("Fechamento parcial");
    expect(data.monthlyBalances).toHaveLength(1);
    expect(() => registerMonthlyBalance(data, "2026-07")).toThrow();
  });

  it("omits note when empty", () => {
    const data = baseData();
    const balance = registerMonthlyBalance(data, "2026-07", "   ");
    expect(balance.note).toBeUndefined();
  });

  it("keeps registered values after transactions change", () => {
    const data = baseData();
    registerMonthlyBalance(data, "2026-07");
    const registered = getMonthlyBalanceByCompetence(data, "2026-07")!;
    data.transactions.push(
      tx({ id: "tx-extra", amountCents: 99_000, status: "settled" }),
    );

    const current = buildMonthlyBalanceSnapshot(data, "2026-07");
    expect(current.expenseCents).not.toBe(registered.expenseCents);
    expect(registered.expenseCents).toBe(150_000);
  });

  it("updates balance without duplicating and preserves createdAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    const data = baseData();
    registerMonthlyBalance(data, "2026-07");
    const createdAt = getMonthlyBalanceByCompetence(data, "2026-07")!.createdAt;

    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    data.transactions.push(
      tx({ id: "tx-more", amountCents: 20_000, status: "settled" }),
    );
    const updated = updateMonthlyBalance(data, "2026-07", "Revisado")!;

    expect(data.monthlyBalances).toHaveLength(1);
    expect(updated.createdAt).toBe(createdAt);
    expect(updated.updatedAt).not.toBe(createdAt);
    expect(updated.note).toBe("Revisado");
    expect(updated.expenseCents).toBe(170_000);
    vi.useRealTimers();
  });

  it("lists balances by competence descending", () => {
    const data = baseData({ selectedCompetenceMonth: "2026-08" });
    registerMonthlyBalance(data, "2026-06");
    registerMonthlyBalance(data, "2026-08");
    registerMonthlyBalance(data, "2026-07");

    expect(listMonthlyBalances(data).map((item) => item.competenceMonth)).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
  });

  it("loads legacy projects without monthlyBalances", () => {
    const legacy = {
      schemaVersion: "cfm.local.v2",
      selectedCompetenceMonth: "2026-07",
      transactions: [],
      cards: [],
      invoices: [],
    };
    const parsed = parseAppDataJson(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.monthlyBalances).toEqual([]);
    }
  });

  it("preserves balances on reimport", () => {
    const data = baseData();
    registerMonthlyBalance(data, "2026-07", "Mantido");
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    const result = applyImportPlan(data, plan);
    expect(result.errors).toHaveLength(0);
    expect(getMonthlyBalanceByCompetence(data, "2026-07")?.note).toBe("Mantido");
  });
});
