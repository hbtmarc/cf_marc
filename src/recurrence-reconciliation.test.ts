import { describe, expect, it } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import {
  compatibleTransactionsForRecurringOccurrence,
  recurringMatchId,
  recurringResolutionsForMonth,
  unmatchedRecurringOccurrencesForMonth,
  validateRecurringMatch,
} from "./recurrence-reconciliation";
import { recurringOccurrencesForMonth } from "./recurrences";
import { emptyAppData, parseAppDataJson, serializeAppData } from "./storage";
import type { AppData, RecurringMatch, RecurringRule, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id">): RecurringRule {
  return {
    kind: "expense",
    description: "Internet",
    amountCents: 12_000,
    category: "Moradia",
    dayOfMonth: 10,
    startMonth: "2026-07",
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
    description: "Lançamento",
    amountCents: 10_000,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Moradia",
    status: "settled",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...partial,
  };
}

function matchFor(
  ruleId: string,
  competenceMonth: string,
  transactionId: string,
): RecurringMatch {
  return {
    id: recurringMatchId(ruleId, competenceMonth),
    ruleId,
    competenceMonth,
    transactionId,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function baseData(options: {
  rules?: RecurringRule[];
  matches?: RecurringMatch[];
  transactions?: Transaction[];
  invoices?: AppData["invoices"];
  cards?: AppData["cards"];
} = {}): AppData {
  return {
    ...emptyAppData(),
    cards: options.cards ?? [
      {
        id: "card-1",
        name: "Cartão Demo",
        closingDay: 10,
        dueDay: 20,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    invoices: options.invoices ?? [],
    transactions: options.transactions ?? [],
    recurringRules: options.rules ?? [],
    recurringMatches: options.matches ?? [],
  };
}

describe("recurring match validation", () => {
  it("accepts a valid direct income match", () => {
    const incomeRule = rule({
      id: "rule_salary",
      kind: "income",
      description: "Salário",
      billingMode: "direct",
    });
    const incomeTx = tx({
      id: "tx-income",
      kind: "income",
      description: "Salário",
      amountCents: 500_000,
    });
    const data = baseData({
      rules: [incomeRule],
      transactions: [incomeTx],
    });
    const match = matchFor("rule_salary", "2026-07", "tx-income");

    expect(validateRecurringMatch(match, data)).toEqual({});
  });

  it("accepts a valid direct expense match", () => {
    const expenseRule = rule({ id: "rule_rent", description: "Aluguel" });
    const expenseTx = tx({ id: "tx-rent", description: "Aluguel", amountCents: 12_000 });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
    });
    const match = matchFor("rule_rent", "2026-07", "tx-rent");

    expect(validateRecurringMatch(match, data)).toEqual({});
  });

  it("accepts a valid card expense match", () => {
    const cardRule = rule({
      id: "rule_streaming",
      description: "Streaming",
      billingMode: "card",
      cardId: "card-1",
    });
    const cardTx = tx({
      id: "tx-streaming",
      ledgerStatus: "in_invoice",
      cardId: "card-1",
      invoiceId: "inv-1",
    });
    const data = baseData({
      rules: [cardRule],
      transactions: [cardTx],
      invoices: [
        {
          id: "inv-1",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 5000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const match = matchFor("rule_streaming", "2026-07", "tx-streaming");

    expect(validateRecurringMatch(match, data)).toEqual({});
  });

  it("rejects a match when competence differs from the transaction", () => {
    const expenseRule = rule({ id: "rule_rent" });
    const expenseTx = tx({ id: "tx-rent", competenceMonth: "2026-08" });
    const data = baseData({ rules: [expenseRule], transactions: [expenseTx] });
    const match = matchFor("rule_rent", "2026-07", "tx-rent");

    expect(validateRecurringMatch(match, data).competenceMonth).toBe(
      "Competência da transação difere da competência do match.",
    );
  });

  it("rejects a match when kinds are incompatible", () => {
    const incomeRule = rule({
      id: "rule_salary",
      kind: "income",
      billingMode: "direct",
    });
    const expenseTx = tx({ id: "tx-wrong-kind" });
    const data = baseData({ rules: [incomeRule], transactions: [expenseTx] });
    const match = matchFor("rule_salary", "2026-07", "tx-wrong-kind");

    expect(validateRecurringMatch(match, data).transactionId).toBe(
      "Transação incompatível com a ocorrência recorrente.",
    );
  });

  it("rejects a card match when cardId differs", () => {
    const cardRule = rule({
      id: "rule_card",
      billingMode: "card",
      cardId: "card-1",
    });
    const cardTx = tx({
      id: "tx-other-card",
      ledgerStatus: "in_invoice",
      cardId: "card-2",
      invoiceId: "inv-1",
    });
    const data = baseData({
      rules: [cardRule],
      transactions: [cardTx],
      cards: [
        {
          id: "card-1",
          name: "Cartão 1",
          closingDay: 10,
          dueDay: 20,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        {
          id: "card-2",
          name: "Cartão 2",
          closingDay: 10,
          dueDay: 20,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const match = matchFor("rule_card", "2026-07", "tx-other-card");

    expect(validateRecurringMatch(match, data).transactionId).toBe(
      "Transação incompatível com a ocorrência recorrente.",
    );
  });

  it("rejects a direct expense linked to an invoice", () => {
    const directRule = rule({ id: "rule_direct" });
    const invoiceTx = tx({
      id: "tx-invoice",
      invoiceId: "inv-1",
      ledgerStatus: "in_invoice",
      cardId: "card-1",
    });
    const data = baseData({ rules: [directRule], transactions: [invoiceTx] });
    const match = matchFor("rule_direct", "2026-07", "tx-invoice");

    expect(validateRecurringMatch(match, data).transactionId).toBe(
      "Transação incompatível com a ocorrência recorrente.",
    );
  });

  it("rejects duplicate rule and competence matches", () => {
    const expenseRule = rule({ id: "rule_dup" });
    const firstTx = tx({ id: "tx-1" });
    const secondTx = tx({ id: "tx-2" });
    const existing = matchFor("rule_dup", "2026-07", "tx-1");
    const data = baseData({
      rules: [expenseRule],
      transactions: [firstTx, secondTx],
      matches: [existing],
    });
    const duplicate = matchFor("rule_dup", "2026-07", "tx-2");

    expect(validateRecurringMatch(duplicate, data).ruleId).toBe(
      "Já existe match para esta regra e competência.",
    );
  });

  it("rejects reusing the same transaction in two matches", () => {
    const firstRule = rule({ id: "rule_a" });
    const secondRule = rule({ id: "rule_b", description: "Energia" });
    const sharedTx = tx({ id: "tx-shared" });
    const existing = matchFor("rule_a", "2026-07", "tx-shared");
    const data = baseData({
      rules: [firstRule, secondRule],
      transactions: [sharedTx],
      matches: [existing],
    });
    const duplicate = matchFor("rule_b", "2026-07", "tx-shared");

    expect(validateRecurringMatch(duplicate, data).transactionId).toBe(
      "Transação já vinculada a outra ocorrência recorrente.",
    );
  });

  it("accepts matches when actual amount differs from expected", () => {
    const expenseRule = rule({ id: "rule_amount", amountCents: 12_000 });
    const expenseTx = tx({ id: "tx-amount", amountCents: 13_500 });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
    });
    const match = matchFor("rule_amount", "2026-07", "tx-amount");

    expect(validateRecurringMatch(match, data)).toEqual({});
  });

  it("rejects matches for paused rules", () => {
    const pausedRule = rule({ id: "rule_paused", status: "paused" });
    const expenseTx = tx({ id: "tx-paused" });
    const data = baseData({
      rules: [pausedRule],
      transactions: [expenseTx],
    });
    const match = matchFor("rule_paused", "2026-07", "tx-paused");

    expect(validateRecurringMatch(match, data).ruleId).toBe(
      "Regra pausada não aceita match.",
    );
  });

  it("rejects matches before rule startMonth", () => {
    const expenseRule = rule({ id: "rule_start", startMonth: "2026-08" });
    const expenseTx = tx({ id: "tx-early", competenceMonth: "2026-07" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
    });
    const match = matchFor("rule_start", "2026-07", "tx-early");

    expect(validateRecurringMatch(match, data).competenceMonth).toBe(
      "Competência anterior ao início da regra.",
    );
  });

  it("rejects matches after rule endMonth", () => {
    const expenseRule = rule({
      id: "rule_end",
      startMonth: "2026-06",
      endMonth: "2026-07",
    });
    const expenseTx = tx({ id: "tx-late", competenceMonth: "2026-08" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
    });
    const match = matchFor("rule_end", "2026-08", "tx-late");

    expect(validateRecurringMatch(match, data).competenceMonth).toBe(
      "Competência posterior ao fim da regra.",
    );
  });

  it("rejects direct expense fee transactions", () => {
    const expenseRule = rule({ id: "rule_fee" });
    const feeTx = tx({ id: "tx-fee", expenseKind: "fee" });
    const data = baseData({ rules: [expenseRule], transactions: [feeTx] });
    const match = matchFor("rule_fee", "2026-07", "tx-fee");

    expect(validateRecurringMatch(match, data).transactionId).toBe(
      "Transação incompatível com a ocorrência recorrente.",
    );
  });

  it("rejects direct expense refund transactions", () => {
    const expenseRule = rule({ id: "rule_refund" });
    const refundTx = tx({ id: "tx-refund", expenseKind: "refund" });
    const data = baseData({ rules: [expenseRule], transactions: [refundTx] });
    const match = matchFor("rule_refund", "2026-07", "tx-refund");

    expect(validateRecurringMatch(match, data).transactionId).toBe(
      "Transação incompatível com a ocorrência recorrente.",
    );
  });

  it("rejects card expense fee transactions", () => {
    const cardRule = rule({
      id: "rule_card_fee",
      billingMode: "card",
      cardId: "card-1",
    });
    const feeTx = tx({
      id: "tx-card-fee",
      expenseKind: "fee",
      ledgerStatus: "in_invoice",
      cardId: "card-1",
      invoiceId: "inv-1",
    });
    const data = baseData({ rules: [cardRule], transactions: [feeTx] });
    const match = matchFor("rule_card_fee", "2026-07", "tx-card-fee");

    expect(validateRecurringMatch(match, data).transactionId).toBe(
      "Transação incompatível com a ocorrência recorrente.",
    );
  });
});

describe("recurring occurrence resolution", () => {
  it("calculates differenceCents as actual minus expected", () => {
    const expenseRule = rule({ id: "rule_diff", amountCents: 12_000 });
    const expenseTx = tx({ id: "tx-diff", amountCents: 10_500 });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
      matches: [matchFor("rule_diff", "2026-07", "tx-diff")],
    });

    const [resolution] = recurringResolutionsForMonth(data, "2026-07");

    expect(resolution?.state).toBe("matched");
    expect(resolution?.expectedAmountCents).toBe(12_000);
    expect(resolution?.actualAmountCents).toBe(10_500);
    expect(resolution?.differenceCents).toBe(-1500);
  });

  it("calculates zero and positive differenceCents for matched occurrences", () => {
    const expenseRule = rule({ id: "rule_zero", amountCents: 12_000 });
    const exactTx = tx({ id: "tx-zero", amountCents: 12_000 });
    const higherRule = rule({ id: "rule_positive", amountCents: 10_000 });
    const higherTx = tx({ id: "tx-positive", amountCents: 11_000 });
    const data = baseData({
      rules: [expenseRule, higherRule],
      transactions: [exactTx, higherTx],
      matches: [
        matchFor("rule_zero", "2026-07", "tx-zero"),
        matchFor("rule_positive", "2026-07", "tx-positive"),
      ],
    });

    const resolutions = recurringResolutionsForMonth(data, "2026-07");
    const zero = resolutions.find((item) => item.occurrence.ruleId === "rule_zero");
    const positive = resolutions.find(
      (item) => item.occurrence.ruleId === "rule_positive",
    );

    expect(zero?.differenceCents).toBe(0);
    expect(positive?.differenceCents).toBe(1000);
  });

  it("prefers matched over covered_by_invoice when both exist", () => {
    const cardRule = rule({
      id: "rule_precedence",
      billingMode: "card",
      cardId: "card-1",
    });
    const cardTx = tx({
      id: "tx-precedence",
      ledgerStatus: "in_invoice",
      cardId: "card-1",
      invoiceId: "inv-precedence",
    });
    const data = baseData({
      rules: [cardRule],
      transactions: [cardTx],
      matches: [matchFor("rule_precedence", "2026-07", "tx-precedence")],
      invoices: [
        {
          id: "inv-precedence",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 8000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    const [resolution] = recurringResolutionsForMonth(data, "2026-07");

    expect(resolution?.state).toBe("matched");
    expect(resolution?.transactionId).toBe("tx-precedence");
  });

  it("covers two card rules with the same invoice without creating matches", () => {
    const firstRule = rule({
      id: "rule_card_a",
      description: "Streaming",
      billingMode: "card",
      cardId: "card-1",
    });
    const secondRule = rule({
      id: "rule_card_b",
      description: "Academia",
      billingMode: "card",
      cardId: "card-1",
    });
    const data = baseData({
      rules: [firstRule, secondRule],
      invoices: [
        {
          id: "inv-shared",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 15_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    const resolutions = recurringResolutionsForMonth(data, "2026-07");

    expect(resolutions).toHaveLength(2);
    expect(resolutions.every((item) => item.state === "covered_by_invoice")).toBe(true);
    expect(data.recurringMatches).toEqual([]);
  });

  it("falls back to projected when an orphan match is invalid", () => {
    const expenseRule = rule({ id: "rule_orphan" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [],
      matches: [matchFor("rule_orphan", "2026-07", "missing-tx")],
    });

    expect(() => recurringResolutionsForMonth(data, "2026-07")).not.toThrow();
    const [resolution] = recurringResolutionsForMonth(data, "2026-07");
    expect(resolution?.state).toBe("projected");
  });

  it("keeps occurrences without a match as projected", () => {
    const data = baseData({ rules: [rule({ id: "rule_open" })] });
    const [resolution] = recurringResolutionsForMonth(data, "2026-07");

    expect(resolution?.state).toBe("projected");
    expect(resolution?.matchId).toBeUndefined();
    expect(resolution?.actualAmountCents).toBeUndefined();
  });

  it("marks occurrences with a valid match as matched", () => {
    const expenseRule = rule({ id: "rule_matched" });
    const expenseTx = tx({ id: "tx-matched" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
      matches: [matchFor("rule_matched", "2026-07", "tx-matched")],
    });

    const [resolution] = recurringResolutionsForMonth(data, "2026-07");

    expect(resolution?.state).toBe("matched");
    expect(resolution?.transactionId).toBe("tx-matched");
  });

  it("excludes matched occurrences from unmatched list", () => {
    const expenseRule = rule({ id: "rule_unmatched" });
    const expenseTx = tx({ id: "tx-matched-only" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
      matches: [matchFor("rule_unmatched", "2026-07", "tx-matched-only")],
    });

    expect(unmatchedRecurringOccurrencesForMonth(data, "2026-07")).toEqual([]);
  });

  it("marks card recurrences with a real invoice as covered_by_invoice", () => {
    const cardRule = rule({
      id: "rule_card_invoice",
      billingMode: "card",
      cardId: "card-1",
    });
    const data = baseData({
      rules: [cardRule],
      invoices: [
        {
          id: "inv-covered",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 8000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    const [resolution] = recurringResolutionsForMonth(data, "2026-07");

    expect(resolution?.state).toBe("covered_by_invoice");
    expect(resolution?.actualAmountCents).toBeUndefined();
    expect(resolution?.differenceCents).toBeUndefined();
  });

  it("excludes covered_by_invoice from unmatched projections", () => {
    const cardRule = rule({
      id: "rule_card_covered",
      billingMode: "card",
      cardId: "card-1",
    });
    const data = baseData({
      rules: [cardRule],
      invoices: [
        {
          id: "inv-covered-2",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 8000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    expect(unmatchedRecurringOccurrencesForMonth(data, "2026-07")).toEqual([]);
  });

  it("keeps card recurrences without invoice as projected", () => {
    const cardRule = rule({
      id: "rule_card_open",
      billingMode: "card",
      cardId: "card-1",
    });
    const data = baseData({ rules: [cardRule] });

    const [resolution] = recurringResolutionsForMonth(data, "2026-07");

    expect(resolution?.state).toBe("projected");
    expect(unmatchedRecurringOccurrencesForMonth(data, "2026-07")).toHaveLength(1);
  });
});

describe("compatible transactions for recurring occurrence", () => {
  it("returns structurally compatible candidates without creating a match", () => {
    const expenseRule = rule({ id: "rule_candidates" });
    const compatible = tx({ id: "tx-compatible", description: "Internet" });
    const incompatible = tx({
      id: "tx-invoice",
      invoiceId: "inv-1",
      ledgerStatus: "in_invoice",
      cardId: "card-1",
    });
    const data = baseData({
      rules: [expenseRule],
      transactions: [compatible, incompatible],
    });
    const [occurrence] = recurringOccurrencesForMonth(data, "2026-07");

    const candidates = compatibleTransactionsForRecurringOccurrence(data, occurrence!);

    expect(candidates.map((item) => item.id)).toEqual(["tx-compatible"]);
    expect(data.recurringMatches).toEqual([]);
  });

  it("excludes transactions already linked to another match", () => {
    const firstRule = rule({ id: "rule_linked" });
    const secondRule = rule({ id: "rule_other", description: "Outra" });
    const linkedTx = tx({ id: "tx-linked" });
    const freeTx = tx({ id: "tx-free", description: "Livre" });
    const data = baseData({
      rules: [firstRule, secondRule],
      transactions: [linkedTx, freeTx],
      matches: [matchFor("rule_linked", "2026-07", "tx-linked")],
    });
    const [occurrence] = recurringOccurrencesForMonth(data, "2026-07").filter(
      (item) => item.ruleId === "rule_other",
    );

    const candidates = compatibleTransactionsForRecurringOccurrence(data, occurrence!);

    expect(candidates.map((item) => item.id)).toEqual(["tx-free"]);
    expect(candidates.some((item) => item.id === "tx-linked")).toBe(false);
  });

  it("excludes fee and refund transactions from compatible candidates", () => {
    const expenseRule = rule({ id: "rule_candidates_fee" });
    const compatible = tx({ id: "tx-compatible", description: "Internet" });
    const fee = tx({ id: "tx-fee", expenseKind: "fee" });
    const refund = tx({ id: "tx-refund", expenseKind: "refund" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [compatible, fee, refund],
    });
    const [occurrence] = recurringOccurrencesForMonth(data, "2026-07");

    const candidates = compatibleTransactionsForRecurringOccurrence(data, occurrence!);

    expect(candidates.map((item) => item.id)).toEqual(["tx-compatible"]);
  });

  it("returns deterministic candidate ordering without mutating AppData", () => {
    const expenseRule = rule({ id: "rule_deterministic" });
    const first = tx({ id: "tx-a", description: "A" });
    const second = tx({ id: "tx-b", description: "B" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [first, second],
    });
    const [occurrence] = recurringOccurrencesForMonth(data, "2026-07");
    const snapshot = serializeAppData(data);

    const firstRun = compatibleTransactionsForRecurringOccurrence(data, occurrence!);
    const secondRun = compatibleTransactionsForRecurringOccurrence(data, occurrence!);

    expect(firstRun.map((item) => item.id)).toEqual(["tx-a", "tx-b"]);
    expect(secondRun.map((item) => item.id)).toEqual(["tx-a", "tx-b"]);
    expect(serializeAppData(data)).toBe(snapshot);
    expect(data.recurringMatches).toEqual([]);
  });
});

describe("recurring reconciliation storage and import", () => {
  it("initializes recurringMatches as empty for legacy data", () => {
    const legacy = {
      schemaVersion: "cfm.local.v2",
      selectedCompetenceMonth: "2026-07",
      transactions: [],
      cards: [],
      invoices: [],
      recurringRules: [rule({ id: "rule_legacy" })],
    };

    const loaded = parseAppDataJson(JSON.stringify(legacy));

    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.recurringMatches).toEqual([]);
      expect(loaded.data.recurringRules).toHaveLength(1);
    }
  });

  it("does not mutate AppData when building resolutions", () => {
    const expenseRule = rule({ id: "rule_immutable" });
    const data = baseData({ rules: [expenseRule] });
    const snapshot = serializeAppData(data);

    recurringResolutionsForMonth(data, "2026-07");

    expect(serializeAppData(data)).toBe(snapshot);
  });

  it("does not persist derived resolutions in storage", () => {
    const expenseRule = rule({ id: "rule_storage" });
    const expenseTx = tx({ id: "tx-storage" });
    const data = baseData({
      rules: [expenseRule],
      transactions: [expenseTx],
      matches: [matchFor("rule_storage", "2026-07", "tx-storage")],
    });

    recurringResolutionsForMonth(data, "2026-07");
    const raw = serializeAppData(data);

    expect(raw).not.toContain("recurringResolutions");
    expect(raw).not.toContain('"state":"matched"');
  });

  it("preserves recurringRules and recurringMatches during reimport", () => {
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    if (!parsed.ok) {
      throw new Error(parsed.message);
    }
    const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
    if (!validated.ok) {
      throw new Error(validated.summary.errors.join("; "));
    }

    const plan = buildImportPlan(emptyAppData(), validated.payload, validated.summary);
    const recurringRule = rule({ id: "rule_preserved", description: "Preservada" });
    const recurringMatch = matchFor("rule_preserved", "2026-07", "tx-preserved");
    const data = baseData({
      rules: [recurringRule],
      matches: [recurringMatch],
      transactions: [tx({ id: "tx-preserved" })],
    });

    const result = applyImportPlan(data, plan);

    expect(result.errors).toEqual([]);
    expect(data.recurringRules).toHaveLength(1);
    expect(data.recurringRules?.[0]?.id).toBe("rule_preserved");
    expect(data.recurringMatches).toHaveLength(1);
    expect(data.recurringMatches?.[0]?.transactionId).toBe("tx-preserved");
  });

  it("does not duplicate recurringRules or recurringMatches on reimport", () => {
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    if (!parsed.ok) {
      throw new Error(parsed.message);
    }
    const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
    if (!validated.ok) {
      throw new Error(validated.summary.errors.join("; "));
    }

    const recurringRule = rule({ id: "rule_preserved", description: "Preservada" });
    const recurringMatch = matchFor("rule_preserved", "2026-07", "tx-preserved");
    const data = baseData({
      rules: [recurringRule],
      matches: [recurringMatch],
      transactions: [tx({ id: "tx-preserved" })],
    });

    const firstPlan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, firstPlan);
    const secondPlan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, secondPlan);

    expect(data.recurringRules).toHaveLength(1);
    expect(data.recurringMatches).toHaveLength(1);
  });
});
