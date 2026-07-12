import { beforeEach, describe, expect, it } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import { buildDashboardContext } from "./presentation";
import { calculateCompetenceSummary } from "./finance";
import { renderIncomeTransactionTableRow, renderTransactionTableRow } from "./presentation";
import {
  annualCycleEndMonth,
  compareCompetenceMonths,
  isRenewalExpired,
  renewRuleForTwelveMonths,
  shiftCompetenceMonth,
} from "./recurrence-renewal";
import {
  inferRecurrenceClassFromRule,
  normalizeLegacyRecurringRule,
} from "./recurrence-class";
import {
  findAmountMismatchReviews,
  findExactAutoMatchCandidates,
  runAutoReconciliation,
  transactionHasValidRecurringMatch,
} from "./recurrence-auto-match";
import { recurringResolutionsForMonth } from "./recurrence-reconciliation";
import { buildRecurringOccurrences } from "./recurrences";
import { renewRecurringRule } from "./recurring-operations";
import {
  confirmRecurringSuggestion,
  buildRecurringSuggestions,
} from "./recurring-suggestions";
import { updateRecurringRuleAmountFromMonth } from "./recurrence-versioning";
import { emptyAppData } from "./storage";
import type { AppData, RecurringRule, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id">): RecurringRule {
  return normalizeLegacyRecurringRule({
    kind: "expense",
    description: "Internet",
    amountCents: 12_990,
    category: "Moradia",
    dayOfMonth: 10,
    startMonth: "2026-06",
    status: "active",
    billingMode: "direct",
    recurrenceClass: "fixed_bill",
    renewalPolicy: "none",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...partial,
  });
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
    ],
    ...options,
  };
}

describe("recurrence extended etapa 8.4.2", () => {
  let data: AppData;

  beforeEach(() => {
    data = baseData();
  });

  it("confirms card recurring as subscription", () => {
    data.transactions = [
      tx({
        id: "tx-1",
        description: "Streaming",
        amountCents: 4990,
        ledgerStatus: "in_invoice",
        cardId: "card-1",
        invoiceId: "inv-1",
        competenceMonth: "2026-06",
        date: "2026-06-12",
      }),
      tx({
        id: "tx-2",
        description: "Streaming",
        amountCents: 4990,
        ledgerStatus: "in_invoice",
        cardId: "card-1",
        invoiceId: "inv-2",
        competenceMonth: "2026-07",
        date: "2026-07-12",
      }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    const result = confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "card_subscription",
      selectedCompetenceMonth: "2026-07",
    });
    expect(result.errors).toEqual({});
    expect(data.recurringRules?.[0]?.recurrenceClass).toBe("card_subscription");
    expect(data.recurringRules?.[0]?.renewalPolicy).toBe("manual_annual");
  });

  it("confirms direct expense as fixed bill", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "fixed_bill",
      selectedCompetenceMonth: "2026-07",
    });
    expect(data.recurringRules?.[0]?.recurrenceClass).toBe("fixed_bill");
  });

  it("confirms income as recurring income", () => {
    data.transactions = [
      tx({
        id: "tx-1",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        category: "Trabalho",
        competenceMonth: "2026-06",
        date: "2026-06-05",
      }),
      tx({
        id: "tx-2",
        kind: "income",
        description: "Salário",
        amountCents: 500_000,
        category: "Trabalho",
        competenceMonth: "2026-07",
        date: "2026-07-05",
      }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "income",
      selectedCompetenceMonth: "2026-07",
    });
    expect(data.recurringRules?.[0]?.recurrenceClass).toBe("income");
  });

  it("uses first observed charge as startMonth", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-05", date: "2026-05-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "fixed_bill",
      selectedCompetenceMonth: "2026-07",
    });
    expect(data.recurringRules?.[0]?.startMonth).toBe("2026-05");
  });

  it("still excludes installment transactions", () => {
    data.transactions = [
      tx({ id: "tx-1", installment: { current: 1, total: 6 }, competenceMonth: "2026-06" }),
      tx({ id: "tx-2", installment: { current: 2, total: 6 }, competenceMonth: "2026-07" }),
    ];
    expect(buildRecurringSuggestions(data)).toEqual([]);
  });

  it("creates rule and evidence matches on confirm", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    const result = confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "fixed_bill",
      selectedCompetenceMonth: "2026-07",
    });
    expect(result.matchesCreated).toBe(2);
    expect(data.recurringMatches).toHaveLength(2);
  });

  it("confirm is idempotent for equivalent rule", () => {
    data.transactions = [
      tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
      tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
    ];
    const [suggestion] = buildRecurringSuggestions(data);
    confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "fixed_bill",
      selectedCompetenceMonth: "2026-07",
    });
    const second = confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: "fixed_bill",
      selectedCompetenceMonth: "2026-07",
    });
    expect(second.errors).toEqual({});
    expect(data.recurringRules).toHaveLength(1);
  });

  it("shows recurring icon for matched transaction", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1" })],
      transactions: [tx({ id: "tx-1" })],
      recurringMatches: [
        {
          id: "recurring-match:rule-1:2026-07",
          ruleId: "rule-1",
          competenceMonth: "2026-07",
          transactionId: "tx-1",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const html = renderTransactionTableRow(data.transactions[0]!, "lancamentos-expense", {
      showRecurringIcon: transactionHasValidRecurringMatch(data, "tx-1"),
    });
    expect(html).toContain("recurring-indicator");
    expect(html).toContain("Lançamento recorrente");
  });

  it("does not show recurring icon without match", () => {
    data.transactions = [tx({ id: "tx-1" })];
    const html = renderIncomeTransactionTableRow(data.transactions[0]!, "lancamentos-income", {
      showRecurringIcon: transactionHasValidRecurringMatch(data, "tx-1"),
    });
    expect(html).not.toContain("recurring-indicator");
  });

  it("recurring icon has accessible semantics", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1" })],
      transactions: [tx({ id: "tx-1" })],
      recurringMatches: [
        {
          id: "recurring-match:rule-1:2026-07",
          ruleId: "rule-1",
          competenceMonth: "2026-07",
          transactionId: "tx-1",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const html = renderTransactionTableRow(data.transactions[0]!, "lancamentos-expense", {
      showRecurringIcon: true,
    });
    expect(html).toContain('title="Recorrente"');
    expect(html).toContain('class="sr-only"');
  });

  it("sets renewedThroughMonth for subscription cycle", () => {
    expect(annualCycleEndMonth("2026-06", "2026-07")).toBe("2027-05");
    expect(annualCycleEndMonth("2024-01", "2026-07")).toBe("2026-12");
  });

  it("annual cycle crosses december and january", () => {
    expect(annualCycleEndMonth("2025-11", "2026-01")).toBe("2026-10");
  });

  it("does not project subscription after renewedThroughMonth", () => {
    const subscription = rule({
      id: "sub-1",
      billingMode: "card",
      cardId: "card-1",
      recurrenceClass: "card_subscription",
      renewalPolicy: "manual_annual",
      renewedThroughMonth: "2026-06",
      startMonth: "2025-07",
    });
    const occurrences = buildRecurringOccurrences([subscription], "2026-07", "2026-07");
    expect(occurrences).toHaveLength(0);
  });

  it("renew extends exactly twelve months", () => {
    const subscription = rule({
      id: "sub-1",
      recurrenceClass: "card_subscription",
      renewalPolicy: "manual_annual",
      renewedThroughMonth: "2027-05",
    });
    renewRuleForTwelveMonths(subscription, "2026-08");
    expect(subscription.renewedThroughMonth).toBe("2028-05");
  });

  it("renewal does not recreate historical matches", () => {
    data = baseData({
      recurringRules: [
        rule({
          id: "sub-1",
          recurrenceClass: "card_subscription",
          renewalPolicy: "manual_annual",
          renewedThroughMonth: "2026-06",
          billingMode: "card",
          cardId: "card-1",
        }),
      ],
      recurringMatches: [
        {
          id: "recurring-match:sub-1:2026-06",
          ruleId: "sub-1",
          competenceMonth: "2026-06",
          transactionId: "tx-old",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    renewRecurringRule(data, "sub-1", "2026-07");
    expect(data.recurringMatches).toHaveLength(1);
    expect(data.recurringRules?.[0]?.renewedThroughMonth).toBe("2027-06");
  });

  it("fixed bill without deadline keeps projecting", () => {
    data.recurringRules = [rule({ id: "fixed-1", recurrenceClass: "fixed_bill" })];
    expect(buildRecurringOccurrences(data.recurringRules, "2026-07", "2026-07")).toHaveLength(1);
  });

  it("value change creates a new version", () => {
    data.recurringRules = [rule({ id: "fixed-1", startMonth: "2026-06" })];
    const errors = updateRecurringRuleAmountFromMonth(data, "fixed-1", "2026-08", 15_990);
    expect(errors).toEqual({});
    expect(data.recurringRules).toHaveLength(2);
  });

  it("previous version ends before effective month", () => {
    data.recurringRules = [rule({ id: "fixed-1", startMonth: "2026-06" })];
    updateRecurringRuleAmountFromMonth(data, "fixed-1", "2026-08", 15_990);
    expect(data.recurringRules?.[0]?.endMonth).toBe("2026-07");
  });

  it("versions share seriesId", () => {
    data.recurringRules = [rule({ id: "fixed-1", seriesId: "series-a", startMonth: "2026-06" })];
    updateRecurringRuleAmountFromMonth(data, "fixed-1", "2026-08", 15_990);
    const seriesIds = new Set(data.recurringRules?.map((item) => item.seriesId));
    expect(seriesIds).toEqual(new Set(["series-a"]));
  });

  it("past keeps old amount after version split", () => {
    data.recurringRules = [rule({ id: "fixed-1", amountCents: 10_000, startMonth: "2026-06" })];
    updateRecurringRuleAmountFromMonth(data, "fixed-1", "2026-08", 15_990);
    expect(data.recurringRules?.[0]?.amountCents).toBe(10_000);
    expect(data.recurringRules?.[1]?.amountCents).toBe(15_990);
  });

  it("future uses new amount after version split", () => {
    data.recurringRules = [rule({ id: "fixed-1", amountCents: 10_000, startMonth: "2026-06" })];
    updateRecurringRuleAmountFromMonth(data, "fixed-1", "2026-08", 15_990);
    const future = buildRecurringOccurrences(data.recurringRules ?? [], "2026-09", "2026-09");
    expect(future[0]?.amountCents).toBe(15_990);
  });

  it("avoids unnecessary version when changing at startMonth without history", () => {
    data.recurringRules = [rule({ id: "fixed-1", amountCents: 10_000, startMonth: "2026-07" })];
    updateRecurringRuleAmountFromMonth(data, "fixed-1", "2026-07", 15_990);
    expect(data.recurringRules).toHaveLength(1);
    expect(data.recurringRules?.[0]?.amountCents).toBe(15_990);
  });

  it("prevents overlapping series versions", () => {
    data.recurringRules = [
      rule({ id: "v1", seriesId: "series-a", startMonth: "2026-06" }),
      rule({ id: "v2", seriesId: "series-a", startMonth: "2026-08", amountCents: 15_990 }),
    ];
    const errors = updateRecurringRuleAmountFromMonth(data, "v1", "2026-08", 18_000);
    expect(errors.series).toBeTruthy();
  });

  it("auto-matches a single exact candidate", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", startMonth: "2026-07" })],
      transactions: [tx({ id: "tx-1", description: "Internet" })],
    });
    const result = runAutoReconciliation(data, "2026-07");
    expect(result.created).toBe(1);
    expect(data.recurringMatches).toHaveLength(1);
  });

  it("repeated auto-match does not duplicate", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", startMonth: "2026-07" })],
      transactions: [tx({ id: "tx-1" })],
    });
    runAutoReconciliation(data, "2026-07");
    const second = runAutoReconciliation(data, "2026-07");
    expect(second.created).toBe(0);
    expect(data.recurringMatches).toHaveLength(1);
  });

  it("zero candidates keeps projected", () => {
    data.recurringRules = [rule({ id: "rule-1", startMonth: "2026-07" })];
    const [resolution] = recurringResolutionsForMonth(data, "2026-07");
    expect(resolution?.state).toBe("projected");
  });

  it("two exact candidates are not auto-selected", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", startMonth: "2026-07" })],
      transactions: [
        tx({ id: "tx-1", description: "Internet" }),
        tx({ id: "tx-2", description: "Internet", date: "2026-07-15" }),
      ],
    });
    const occurrence = buildRecurringOccurrences(data.recurringRules!, "2026-07", "2026-07")[0]!;
    expect(findExactAutoMatchCandidates(data, occurrence)).toHaveLength(2);
    const result = runAutoReconciliation(data, "2026-07");
    expect(result.skippedAmbiguous).toBe(1);
    expect(data.recurringMatches ?? []).toHaveLength(0);
  });

  it("different amount does not auto-update rule", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", amountCents: 12_990, startMonth: "2026-07" })],
      transactions: [tx({ id: "tx-1", amountCents: 14_990 })],
    });
    runAutoReconciliation(data, "2026-07");
    expect(data.recurringRules?.[0]?.amountCents).toBe(12_990);
    expect(findAmountMismatchReviews(data, "2026-07")).toHaveLength(1);
  });

  it("amount mismatch appears for review", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", startMonth: "2026-07" })],
      transactions: [tx({ id: "tx-1", amountCents: 14_990 })],
    });
    const reviews = findAmountMismatchReviews(data, "2026-07");
    expect(reviews[0]?.differenceCents).toBe(14_990 - 12_990);
  });

  it("reimport preserves series rules matches and renewals", () => {
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    if (!parsed.ok) throw new Error(parsed.message);
    const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
    if (!validated.ok) throw new Error(validated.summary.errors.join("; "));

    data = baseData({
      recurringRules: [
        rule({
          id: "rule-1",
          seriesId: "series-1",
          recurrenceClass: "card_subscription",
          renewalPolicy: "manual_annual",
          renewedThroughMonth: "2027-05",
          billingMode: "card",
          cardId: "card-1",
        }),
      ],
      recurringMatches: [
        {
          id: "recurring-match:rule-1:2026-07",
          ruleId: "rule-1",
          competenceMonth: "2026-07",
          transactionId: "tx-1",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      ignoredRecurringSuggestions: [
        {
          signature: "ignored",
          evidenceFingerprint: "fp",
          ignoredAt: TIMESTAMP,
        },
      ],
    });
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    expect(data.recurringRules?.[0]?.seriesId).toBe("series-1");
    expect(data.recurringRules?.[0]?.renewedThroughMonth).toBe("2027-05");
    expect(data.recurringMatches).toHaveLength(1);
    expect(data.ignoredRecurringSuggestions).toHaveLength(1);
  });

  it("dashboard does not duplicate values with auto-match", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", startMonth: "2026-07" })],
      transactions: [tx({ id: "tx-1" })],
    });
    runAutoReconciliation(data, "2026-07");
    const ctx = buildDashboardContext(data, "2026-07");
    expect(ctx.summary.expensePaidCents).toBe(12_990);
    expect(recurringResolutionsForMonth(data, "2026-07")[0]?.state).toBe("matched");
  });

  it("calculateCompetenceSummary does not duplicate matched recurring", () => {
    data = baseData({
      recurringRules: [rule({ id: "rule-1", startMonth: "2026-07" })],
      transactions: [tx({ id: "tx-1" })],
      recurringMatches: [
        {
          id: "recurring-match:rule-1:2026-07",
          ruleId: "rule-1",
          competenceMonth: "2026-07",
          transactionId: "tx-1",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(summary.expensePaidCents).toBe(12_990);
  });

  it("expired subscription leaves financial projection", () => {
    data.recurringRules = [
      rule({
        id: "sub-1",
        recurrenceClass: "card_subscription",
        renewalPolicy: "manual_annual",
        renewedThroughMonth: "2026-06",
        billingMode: "card",
        cardId: "card-1",
        startMonth: "2025-07",
      }),
    ];
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(isRenewalExpired(data.recurringRules![0]!, "2026-07")).toBe(true);
  });

  it("empty month stays neutral", () => {
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.balancePlannedCents).toBe(0);
    expect(summary.recurringProjectedCount).toBe(0);
  });

  it("legacy rules normalize classes and series", () => {
    const legacy: RecurringRule = {
      id: "legacy-1",
      kind: "expense",
      description: "Luz",
      amountCents: 8000,
      category: "Casa",
      dayOfMonth: 5,
      startMonth: "2026-01",
      status: "active",
      billingMode: "direct",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    normalizeLegacyRecurringRule(legacy);
    expect(legacy.recurrenceClass).toBe("fixed_bill");
    expect(legacy.seriesId).toBe("legacy-1");
    expect(legacy.renewalPolicy).toBe("none");
    expect(inferRecurrenceClassFromRule(legacy)).toBe("fixed_bill");
  });

  it("shift and compare competence months stay deterministic", () => {
    expect(shiftCompetenceMonth("2026-12", 1)).toBe("2027-01");
    expect(compareCompetenceMonths("2026-06", "2026-07")).toBeLessThan(0);
  });
});
