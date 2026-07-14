import { beforeEach, describe, expect, it } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import { calculateCompetenceSummary } from "./finance";
import { buildPlanejamentoSummary } from "./planejamento-presentation";
import {
  buildRecurringSuggestions,
  confirmRecurringSuggestion,
  ignoreRecurringSuggestion,
  restoreIgnoredRecurringSuggestion,
  recurringSuggestionEvidenceFingerprint,
  recurringSuggestionSignature,
} from "./recurring-suggestions";
import { emptyAppData } from "./storage";
import type { AppData, RecurringRule, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id">): RecurringRule {
  return {
    kind: "expense",
    description: "Internet",
    amountCents: 12_990,
    category: "Moradia",
    dayOfMonth: 10,
    startMonth: "2026-06",
    status: "active",
    billingMode: "direct",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...partial,
  };
}

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Internet",
    amountCents: 12_990,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Moradia",
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
    cards: [
      {
        id: "card-1",
        name: "Cartão A",
        closingDay: 10,
        dueDay: 20,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "card-2",
        name: "Cartão B",
        closingDay: 12,
        dueDay: 22,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    ...options,
  };
}

describe("recurring suggestions engine", () => {
  let data: AppData;

  beforeEach(() => {
    data = baseData();
  });

  it("suggests the same direct expense in two months", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    expect(suggestion).toBeDefined();
    expect(suggestion?.kind).toBe("expense");
    expect(suggestion?.billingMode).toBe("direct");
    expect(suggestion?.competenceMonths).toEqual(["2026-06", "2026-07"]);
    expect(suggestion?.dayOfMonth).toBe(10);
    expect(suggestion?.startMonth).toBe("2026-06");
  });

  it("suggests the same income in two months", () => {
    data.transactions = [
      tx({
        id: "tx-income-1",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        category: "Trabalho",
        competenceMonth: "2026-06",
        date: "2026-06-05",
      }),
      tx({
        id: "tx-income-2",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        category: "Trabalho",
        competenceMonth: "2026-07",
        date: "2026-07-05",
      }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    expect(suggestion?.kind).toBe("income");
    expect(suggestion?.billingMode).toBe("direct");
  });

  it("creates different suggestions for the same name on different cards", () => {
    data.transactions = [
      tx({
        id: "tx-card-a-1",
        description: "Streaming",
        amountCents: 4990,
        ledgerStatus: "in_invoice",
        cardId: "card-1",
        invoiceId: "inv-a",
        competenceMonth: "2026-06",
        date: "2026-06-12",
      }),
      tx({
        id: "tx-card-a-2",
        description: "Streaming",
        amountCents: 4990,
        ledgerStatus: "in_invoice",
        cardId: "card-1",
        invoiceId: "inv-a-2",
        competenceMonth: "2026-07",
        date: "2026-07-12",
      }),
      tx({
        id: "tx-card-b-1",
        description: "Streaming",
        amountCents: 4990,
        ledgerStatus: "in_invoice",
        cardId: "card-2",
        invoiceId: "inv-b",
        competenceMonth: "2026-06",
        date: "2026-06-14",
      }),
      tx({
        id: "tx-card-b-2",
        description: "Streaming",
        amountCents: 4990,
        ledgerStatus: "in_invoice",
        cardId: "card-2",
        invoiceId: "inv-b-2",
        competenceMonth: "2026-07",
        date: "2026-07-14",
      }),
    ];
    const suggestions = buildRecurringSuggestions(data);
    expect(suggestions).toHaveLength(2);
    expect(new Set(suggestions.map((item) => item.cardId))).toEqual(
      new Set(["card-1", "card-2"]),
    );
  });

  it("does not suggest when only two occurrences share the same month", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-07", date: "2026-07-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-20" }),
    ];
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("does not suggest installment transactions", () => {
    data.transactions = [
      tx({
        id: "tx-inst-1",
        installment: { current: 1, total: 12 },
        competenceMonth: "2026-06",
        date: "2026-06-10",
      }),
      tx({
        id: "tx-inst-2",
        installment: { current: 2, total: 12 },
        competenceMonth: "2026-07",
        date: "2026-07-10",
      }),
    ];
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("does not suggest fee transactions", () => {
    data.transactions = [
      tx({
        id: "tx-fee-1",
        expenseKind: "fee",
        competenceMonth: "2026-06",
        date: "2026-06-10",
      }),
      tx({
        id: "tx-fee-2",
        expenseKind: "fee",
        competenceMonth: "2026-07",
        date: "2026-07-10",
      }),
    ];
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("does not suggest refund transactions", () => {
    data.transactions = [
      tx({
        id: "tx-refund-1",
        expenseKind: "refund",
        competenceMonth: "2026-06",
        date: "2026-06-10",
      }),
      tx({
        id: "tx-refund-2",
        expenseKind: "refund",
        competenceMonth: "2026-07",
        date: "2026-07-10",
      }),
    ];
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("removes suggestions equivalent to an existing rule", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    data.recurringRules = [rule({ id: "rule-existing", description: "Internet" })];
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("creates exactly one rule when confirming a suggestion", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-12" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    const errors = confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "fixed_bill",
      selectedCompetenceMonth: "2026-07",
    });
    expect(errors.errors).toEqual({});
    expect(data.recurringRules).toHaveLength(1);
    expect(data.recurringRules?.[0]?.description).toBe("Internet");
    expect(data.recurringRules?.[0]?.dayOfMonth).toBe(12);
    expect(data.recurringRules?.[0]?.startMonth).toBe("2026-06");
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("does not create rules automatically from suggestions", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    buildRecurringSuggestions(data);
    expect(data.recurringRules).toEqual([]);
  });

  it("persists ignored suggestion signatures", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    expect(ignoreRecurringSuggestion(data, suggestion!.id)).toBe(true);
    expect(data.ignoredRecurringSuggestions).toHaveLength(1);
    expect(data.ignoredRecurringSuggestions?.[0]?.signature).toBe(suggestion?.signature);
    expect(data.ignoredRecurringSuggestions?.[0]?.evidenceFingerprint).toBe(
      suggestion?.evidenceFingerprint,
    );
  });

  it("restores ignored suggestions for undo", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    ignoreRecurringSuggestion(data, suggestion!.id);
    const snapshot = data.ignoredRecurringSuggestions?.[0];
    expect(snapshot).toBeDefined();
    restoreIgnoredRecurringSuggestion(data, snapshot!);
    expect(buildRecurringSuggestions(data)).toHaveLength(1);
  });

  it("does not resurface ignored suggestions with unchanged evidence", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    ignoreRecurringSuggestion(data, suggestion!.id);
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("allows a new suggestion after relevant evidence changes", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    ignoreRecurringSuggestion(data, suggestion!.id);
    data.transactions.push(
      tx({ id: "tx-3", competenceMonth: "2026-08", date: "2026-08-10" }),
    );
    const next = buildRecurringSuggestions(data);
    expect(next).toHaveLength(1);
    expect(next[0]?.evidenceFingerprint).not.toBe(suggestion?.evidenceFingerprint);
  });

  it("preserves rules, matches and ignored suggestions on reimport", () => {
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    if (!parsed.ok) {
      throw new Error(parsed.message);
    }
    const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
    if (!validated.ok) {
      throw new Error(validated.summary.errors.join("; "));
    }

    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    data.recurringRules = [rule({ id: "rule-preserved" })];
    data.recurringMatches = [
      {
        id: "recurring-match:rule-preserved:2026-07",
        ruleId: "rule-preserved",
        competenceMonth: "2026-07",
        transactionId: "tx-2",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ];
    data.ignoredRecurringSuggestions = [
      {
        signature: recurringSuggestionSignature({
          normalizedDescription: "internet",
          kind: "expense",
          billingMode: "direct",
          amountCents: 12_990,
        }),
        evidenceFingerprint: "2026-06,2026-07|tx-1,tx-2",
        ignoredAt: TIMESTAMP,
      },
    ];

    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    expect(data.recurringRules).toHaveLength(1);
    expect(data.recurringMatches).toHaveLength(1);
    expect(data.ignoredRecurringSuggestions).toHaveLength(1);
  });

  it("does not alter calculateCompetenceSummary", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const before = calculateCompetenceSummary(data, "2026-07");
    buildRecurringSuggestions(data);
    const after = calculateCompetenceSummary(data, "2026-07");
    expect(after).toEqual(before);
  });

  it("does not alter dashboard context", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const before = calculateCompetenceSummary(data, "2026-07");
    buildRecurringSuggestions(data);
    const after = calculateCompetenceSummary(data, "2026-07");
    expect(after).toEqual(before);
  });

  it("keeps empty month neutral in planejamento summary", () => {
    const summary = buildPlanejamentoSummary(data, "2026-07");
    expect(summary.incomeProjectedCents).toBe(0);
    expect(summary.expenseProjectedCents).toBe(0);
    expect(summary.projectedCount).toBe(0);
    expect(summary.matchedCount).toBe(0);
    expect(summary.coveredCount).toBe(0);
    expect(summary.pendingSuggestionCount).toBe(0);
    expect(summary.pendingSuggestionIncomeCents).toBe(0);
    expect(summary.pendingSuggestionExpenseCents).toBe(0);
  });

  it("builds deterministic signatures and evidence fingerprints", () => {
    const signature = recurringSuggestionSignature({
      normalizedDescription: "internet",
      kind: "expense",
      billingMode: "direct",
      amountCents: 12_990,
    });
    const fingerprint = recurringSuggestionEvidenceFingerprint(
      [
        { transactionId: "tx-b", competenceMonth: "2026-07", date: "2026-07-10" },
        { transactionId: "tx-a", competenceMonth: "2026-06", date: "2026-06-10" },
      ],
      ["2026-07", "2026-06"],
    );
    expect(signature).toContain("recurring-suggestion:expense:direct:");
    expect(fingerprint).toBe("2026-06,2026-07|tx-a,tx-b");
  });
});

describe("etapa 8.4.1 math regression with suggestions present", () => {
  function integratedAuditData(): AppData {
    return baseData({
      cards: [
        {
          id: "card-invoice",
          name: "Cartão Fatura",
          closingDay: 10,
          dueDay: 20,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        {
          id: "card-install",
          name: "Cartão Parcela",
          closingDay: 5,
          dueDay: 15,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      transactions: [
        {
          id: "income-received",
          kind: "income",
          description: "Receita recebida",
          amountCents: 500_000,
          date: "2026-07-05",
          competenceMonth: "2026-07",
          category: "Trabalho",
          status: "settled",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        tx({ id: "expense-paid", description: "Despesa direta paga", amountCents: 50_000 }),
        tx({ id: "expense-matched", description: "Despesa conciliada", amountCents: 15_000 }),
        tx({
          id: "installment-src",
          ledgerStatus: "in_invoice",
          cardId: "card-install",
          amountCents: 30_000,
          competenceMonth: "2026-06",
          date: "2026-06-12",
          installment: { current: 2, total: 4 },
        }),
        tx({
          id: "suggest-1",
          description: "Academia",
          amountCents: 9900,
          category: "Saúde",
          competenceMonth: "2026-05",
          date: "2026-05-20",
        }),
        tx({
          id: "suggest-2",
          description: "Academia",
          amountCents: 9900,
          category: "Saúde",
          competenceMonth: "2026-06",
          date: "2026-06-20",
        }),
      ],
      invoices: [
        {
          id: "inv-open",
          cardId: "card-invoice",
          competenceMonth: "2026-07",
          amountCents: 80_000,
          amountDueCents: 80_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      recurringRules: [
        rule({
          id: "income-recurring",
          kind: "income",
          description: "Receita recorrente",
          amountCents: 100_000,
          startMonth: "2026-07",
        }),
        rule({
          id: "expense-direct-recurring",
          description: "Despesa recorrente direta",
          amountCents: 20_000,
          startMonth: "2026-07",
        }),
        rule({
          id: "expense-card-covered",
          description: "Streaming coberto",
          amountCents: 10_000,
          billingMode: "card",
          cardId: "card-invoice",
          startMonth: "2026-07",
        }),
        rule({
          id: "expense-matched-recurring",
          description: "Internet conciliada",
          amountCents: 15_000,
          startMonth: "2026-07",
        }),
      ],
      recurringMatches: [
        {
          id: "recurring-match:expense-matched-recurring:2026-07",
          ruleId: "expense-matched-recurring",
          competenceMonth: "2026-07",
          transactionId: "expense-matched",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
  }

  it("keeps integrated audit totals unchanged when suggestions exist", () => {
    const data = integratedAuditData();
    expect(buildRecurringSuggestions(data).some((item) => item.description === "Academia")).toBe(
      true,
    );

    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.balanceRealizedCents).toBe(435_000);
    expect(summary.expensePendingCents).toBe(130_000);
    expect(summary.balancePlannedCents).toBe(405_000);
    expect(summary.recurringIncomeProjectedCents).toBe(100_000);
    expect(summary.recurringExpenseProjectedCents).toBe(20_000);

    buildRecurringSuggestions(data);
    expect(calculateCompetenceSummary(data, "2026-07")).toEqual(summary);
  });
});
