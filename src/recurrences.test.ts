import { describe, expect, it } from "vitest";
import {
  buildRecurringOccurrences,
  isValidRecurringRule,
  recurringOccurrenceDate,
  recurringOccurrenceId,
  recurringOccurrencesForMonth,
  validateRecurringRule,
} from "./recurrences";
import { emptyAppData, parseAppDataJson, serializeAppData } from "./storage";
import type { AppData, RecurringRule } from "./types";

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

function baseData(rules: RecurringRule[], cards: AppData["cards"] = []): AppData {
  return {
    ...emptyAppData(),
    cards,
    recurringRules: rules,
  };
}

describe("recurring occurrence engine", () => {
  it("generates one occurrence per competence for a monthly rule", () => {
    const activeRule = rule({ id: "rule_internet", startMonth: "2026-08" });
    const occurrences = buildRecurringOccurrences([activeRule], "2026-08", "2026-08");

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.competenceMonth).toBe("2026-08");
    expect(occurrences[0]?.amountCents).toBe(12_000);
  });

  it("generates three occurrences across a three-month interval", () => {
    const activeRule = rule({ id: "rule_internet", startMonth: "2026-07" });
    const occurrences = buildRecurringOccurrences([activeRule], "2026-07", "2026-09");

    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((item) => item.competenceMonth)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("treats startMonth as inclusive", () => {
    const activeRule = rule({ id: "rule_start", startMonth: "2026-08" });
    const occurrences = buildRecurringOccurrences([activeRule], "2026-07", "2026-08");

    expect(occurrences.map((item) => item.competenceMonth)).toEqual(["2026-08"]);
  });

  it("treats endMonth as inclusive", () => {
    const activeRule = rule({
      id: "rule_end",
      startMonth: "2026-06",
      endMonth: "2026-08",
    });
    const occurrences = buildRecurringOccurrences([activeRule], "2026-07", "2026-12");

    expect(occurrences.map((item) => item.competenceMonth)).toEqual([
      "2026-07",
      "2026-08",
    ]);
  });

  it("generates historical occurrences before pausedFromMonth", () => {
    const pausedRule = rule({
      id: "rule_paused",
      status: "paused",
      startMonth: "2026-01",
      pausedFromMonth: "2026-03",
    });
    const occurrences = buildRecurringOccurrences([pausedRule], "2026-01", "2026-04");

    expect(occurrences.map((item) => item.competenceMonth)).toEqual([
      "2026-01",
      "2026-02",
    ]);
  });

  it("does not generate occurrences from pausedFromMonth onward", () => {
    const pausedRule = rule({
      id: "rule_paused",
      status: "paused",
      startMonth: "2026-01",
      pausedFromMonth: "2026-03",
    });
    const occurrences = buildRecurringOccurrences([pausedRule], "2026-03", "2026-05");

    expect(occurrences).toEqual([]);
  });

  it("does not generate occurrences for legacy paused rules without pausedFromMonth", () => {
    const pausedRule = rule({ id: "rule_paused", status: "paused" });
    const occurrences = buildRecurringOccurrences([pausedRule], "2026-07", "2026-09");

    expect(occurrences).toEqual([]);
  });

  it("adjusts day 31 to the last valid day in February", () => {
    expect(recurringOccurrenceDate("2026-02", 31)).toBe("2026-02-28");
  });

  it("limits day 31 to 30 in April", () => {
    expect(recurringOccurrenceDate("2026-04", 31)).toBe("2026-04-30");
  });

  it("handles December to January year rollover", () => {
    const activeRule = rule({
      id: "rule_rollover",
      startMonth: "2026-12",
      dayOfMonth: 15,
    });
    const occurrences = buildRecurringOccurrences([activeRule], "2026-12", "2027-01");

    expect(occurrences.map((item) => item.competenceMonth)).toEqual([
      "2026-12",
      "2027-01",
    ]);
    expect(occurrences[0]?.expectedDate).toBe("2026-12-15");
    expect(occurrences[1]?.expectedDate).toBe("2027-01-15");
  });

  it("uses deterministic occurrence ids", () => {
    expect(recurringOccurrenceId("rule_internet", "2026-08")).toBe(
      "recurring:rule_internet:2026-08",
    );

    const activeRule = rule({ id: "rule_internet", startMonth: "2026-08" });
    const occurrences = buildRecurringOccurrences([activeRule], "2026-08", "2026-08");

    expect(occurrences[0]?.id).toBe("recurring:rule_internet:2026-08");
  });

  it("does not mutate rules or AppData when building occurrences", () => {
    const activeRule = rule({
      id: "rule_immutable",
      description: "Aluguel",
      amountCents: 50_000,
    });
    const rulesSnapshot = JSON.stringify([activeRule]);
    const data = baseData([activeRule]);
    const dataSnapshot = JSON.stringify(data);

    const occurrences = recurringOccurrencesForMonth(data, "2026-07");

    expect(JSON.stringify([activeRule])).toBe(rulesSnapshot);
    expect(JSON.stringify(data)).toBe(dataSnapshot);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.projected).toBe(true);
  });
});

describe("recurring rule validation", () => {
  it("accepts income only with direct billing mode", () => {
    const incomeRule = rule({
      id: "income_salary",
      kind: "income",
      description: "Salário",
      billingMode: "direct",
    });

    expect(validateRecurringRule(incomeRule)).toEqual({});
    expect(isValidRecurringRule(incomeRule)).toBe(true);

    const invalidIncome = rule({
      id: "income_card",
      kind: "income",
      billingMode: "card",
      cardId: "card-1",
    });
    expect(validateRecurringRule(invalidIncome).billingMode).toBe(
      "Receitas devem usar modo de cobrança direto.",
    );
  });

  it("requires a valid cardId for card expenses", () => {
    const missingCard = rule({
      id: "expense_card_missing",
      billingMode: "card",
    });
    expect(validateRecurringRule(missingCard).cardId).toBe(
      "Cartão é obrigatório para cobrança no cartão.",
    );

    const unknownCard = rule({
      id: "expense_card_unknown",
      billingMode: "card",
      cardId: "missing-card",
    });
    expect(
      validateRecurringRule(unknownCard, { cardIds: ["card-1"] }).cardId,
    ).toBe("Cartão inexistente.");

    const validCard = rule({
      id: "expense_card_valid",
      billingMode: "card",
      cardId: "card-1",
    });
    expect(validateRecurringRule(validCard, { cardIds: ["card-1"] })).toEqual({});
  });

  it("rejects cardId when billing mode is direct", () => {
    const directWithCard = rule({
      id: "expense_direct_card",
      billingMode: "direct",
      cardId: "card-1",
    });
    expect(validateRecurringRule(directWithCard).cardId).toBe(
      "Cartão não deve ser informado para cobrança direta.",
    );
  });

  it("rejects invalid amountCents", () => {
    const zeroAmount = rule({ id: "zero", amountCents: 0 });
    expect(validateRecurringRule(zeroAmount).amountCents).toBe(
      "Valor deve ser um inteiro maior que zero.",
    );

    const negativeAmount = rule({ id: "negative", amountCents: -100 });
    expect(validateRecurringRule(negativeAmount).amountCents).toBe(
      "Valor deve ser um inteiro maior que zero.",
    );
  });

  it("rejects inverted periods", () => {
    const inverted = rule({
      id: "inverted",
      startMonth: "2026-09",
      endMonth: "2026-07",
    });
    expect(validateRecurringRule(inverted).endMonth).toBe(
      "Competência final não pode ser anterior à inicial.",
    );
  });
});

describe("recurring storage compatibility", () => {
  it("loads legacy data without recurringRules", () => {
    const legacy = {
      schemaVersion: "cfm.local.v2",
      selectedCompetenceMonth: "2026-07",
      transactions: [],
      cards: [],
      invoices: [],
    };

    const loaded = parseAppDataJson(JSON.stringify(legacy));

    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.recurringRules).toEqual([]);
    }
  });

  it("does not persist derived occurrences in storage", () => {
    const data = baseData([
      rule({ id: "rule_storage", startMonth: "2026-07" }),
    ]);
    recurringOccurrencesForMonth(data, "2026-07");

    const raw = serializeAppData(data);
    expect(raw).not.toContain("projected");
    expect(raw).not.toContain("recurring:rule_storage");

    const loaded = parseAppDataJson(raw);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.recurringRules).toHaveLength(1);
      expect(
        (loaded.data as unknown as Record<string, unknown>).projectedRecurringOccurrences,
      ).toBeUndefined();
    }
  });
});
