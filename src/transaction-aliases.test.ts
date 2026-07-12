import { describe, expect, it } from "vitest";
import { applyImportPlan, buildImportPlan, cloneAppData } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import { renderDashboardRecentRow } from "./presentation";
import { getDashboardRecentSortAccessors } from "./pages/dashboard";
import { getExpenseSortAccessors } from "./pages/lancamentos";
import { filterDirectExpenseTransactions, buildDirectExpenseTransactions } from "./lancamentos-sections";
import { confirmRecurringSuggestion } from "./recurring-suggestions";
import { suggestionToRuleDraft } from "./recurring-suggestions";
import { buildRecurringSuggestions } from "./recurring-suggestions";
import { emptyAppData, parseAppDataJson, serializeAppData } from "./storage";
import { sortTableItems } from "./table-sort";
import {
  findTransactionDescriptionAlias,
  normalizeTransactionDescription,
  removeTransactionDescriptionAlias,
  transactionDescriptionAliasId,
  transactionDisplayDescription,
  transactionDisplayDescriptionForSource,
  upsertTransactionDescriptionAlias,
  validateTransactionDescriptionAliasDisplayName,
} from "./transaction-aliases";
import type { AppData, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";
const SOURCE = "BMI Serviços Digitais";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: SOURCE,
    amountCents: 9990,
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
    ...options,
  };
}

function importPayloadWithBmi() {
  const payload = {
    schemaVersion: "cfm.import.v1",
    generatedAt: TIMESTAMP,
    currency: "BRL",
    incomes: [],
    expenses: [
      {
        id: "import-bmi-1",
        competenceMonth: "2026-07",
        date: "2026-07-10",
        description: SOURCE,
        amountCents: 9990,
        category: "Moradia",
        kind: "expense",
        status: "paid",
        canonicalFingerprint: "fp-bmi-services",
        sourceType: "bank_transfer",
        paymentMethod: "pix",
        paymentLabel: "PIX",
      },
    ],
    cards: [],
    invoices: [],
  };
  const raw = JSON.stringify(payload);
  const parsed = parseImportJson(raw);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  const validated = validateImportDocument(parsed.value, "bmi.json");
  if (!validated.ok) {
    throw new Error(validated.summary.errors.join("; "));
  }
  return validated;
}

describe("transaction description aliases", () => {
  it("without alias, shows original description", () => {
    const data = baseData({ transactions: [tx({ id: "tx-1" })] });
    expect(transactionDisplayDescription(data, data.transactions[0]!)).toBe(SOURCE);
  });

  it("creates alias with deterministic id", () => {
    const data = baseData();
    const result = upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    expect(result.errors).toEqual({});
    const normalized = normalizeTransactionDescription(SOURCE);
    expect(data.transactionDescriptionAliases?.[0]).toMatchObject({
      id: transactionDescriptionAliasId(normalized),
      sourceDescriptionNormalized: normalized,
      sourceDescriptionSample: SOURCE,
      displayName: "Internet",
    });
  });

  it("updates existing alias", () => {
    const data = baseData({
      transactionDescriptionAliases: [
        {
          id: transactionDescriptionAliasId(normalizeTransactionDescription(SOURCE)),
          sourceDescriptionNormalized: normalizeTransactionDescription(SOURCE),
          sourceDescriptionSample: SOURCE,
          displayName: "Internet",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    upsertTransactionDescriptionAlias(data, SOURCE, "Fibra");
    expect(data.transactionDescriptionAliases?.[0]?.displayName).toBe("Fibra");
    expect(data.transactionDescriptionAliases).toHaveLength(1);
  });

  it("removes alias without touching transactions", () => {
    const data = baseData({
      transactions: [tx({ id: "tx-1" })],
      transactionDescriptionAliases: [
        {
          id: transactionDescriptionAliasId(normalizeTransactionDescription(SOURCE)),
          sourceDescriptionNormalized: normalizeTransactionDescription(SOURCE),
          sourceDescriptionSample: SOURCE,
          displayName: "Internet",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    removeTransactionDescriptionAlias(data, SOURCE);
    expect(data.transactionDescriptionAliases).toHaveLength(0);
    expect(data.transactions[0]?.description).toBe(SOURCE);
  });

  it("trims and validates display name", () => {
    const data = baseData();
    expect(validateTransactionDescriptionAliasDisplayName("   ")).toBe(
      "Informe um nome exibido.",
    );
    upsertTransactionDescriptionAlias(data, SOURCE, "  Internet  ");
    expect(findTransactionDescriptionAlias(data, SOURCE)?.displayName).toBe("Internet");
    expect(
      upsertTransactionDescriptionAlias(data, SOURCE, "   ").errors.displayName,
    ).toBeTruthy();
  });

  it("does not mutate the original transaction", () => {
    const data = baseData({ transactions: [tx({ id: "tx-1" })] });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    expect(data.transactions[0]?.description).toBe(SOURCE);
  });

  it("applies alias to multiple transactions with same source", () => {
    const data = baseData({
      transactions: [
        tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
        tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
      ],
    });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    expect(transactionDisplayDescription(data, data.transactions[0]!)).toBe("Internet");
    expect(transactionDisplayDescription(data, data.transactions[1]!)).toBe("Internet");
  });

  it("applies alias to future imports with same description", () => {
    let data = baseData({ transactions: [tx({ id: "tx-1" })] });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const validated = importPayloadWithBmi();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    const result = applyImportPlan(data, plan);
    expect(result.created).toBe(1);
    const imported = data.transactions.find((item) => item.canonicalFingerprint === "fp-bmi-services");
    expect(imported?.description).toBe(SOURCE);
    expect(transactionDisplayDescription(data, imported!)).toBe("Internet");
  });

  it("reimport does not duplicate transactions or aliases", () => {
    let data = baseData();
    const validated = importPayloadWithBmi();
    const plan1 = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan1);
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const beforeCount = data.transactions.length;

    const plan2 = buildImportPlan(data, validated.payload, validated.summary);
    const reimportTarget = cloneAppData(data);
    const result2 = applyImportPlan(reimportTarget, plan2);
    expect(result2.created).toBe(0);
    expect(reimportTarget.transactions).toHaveLength(beforeCount);
    expect(reimportTarget.transactionDescriptionAliases).toHaveLength(1);
    expect(
      reimportTarget.transactions.filter((item) => item.description === SOURCE),
    ).toHaveLength(1);
    expect(transactionDisplayDescription(reimportTarget, reimportTarget.transactions[0]!)).toBe(
      "Internet",
    );
  });

  it("search finds alias and original description", () => {
    const data = baseData({
      transactions: [tx({ id: "tx-1" })],
    });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const filteredAlias = filterDirectExpenseTransactions(
      buildDirectExpenseTransactions(data, "2026-07"),
      { search: "internet", kind: "all", status: "all" },
      data,
    );
    const filteredOriginal = filterDirectExpenseTransactions(
      buildDirectExpenseTransactions(data, "2026-07"),
      { search: "bmi", kind: "all", status: "all" },
      data,
    );
    expect(filteredAlias).toHaveLength(1);
    expect(filteredOriginal).toHaveLength(1);
  });

  it("sort uses displayed description", () => {
    const data = baseData({
      transactions: [
        tx({ id: "tx-1", description: "Zeta Original" }),
        tx({ id: "tx-2", description: SOURCE }),
      ],
    });
    upsertTransactionDescriptionAlias(data, SOURCE, "Alpha Alias");
    const sorted = sortTableItems(
      data.transactions,
      { column: "description", direction: "asc" },
      getExpenseSortAccessors(data),
    );
    expect(sorted[0]?.id).toBe("tx-2");
  });

  it("dashboard recent row uses alias", () => {
    const data = baseData({ transactions: [tx({ id: "tx-1" })] });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const html = renderDashboardRecentRow(data, data.transactions[0]!);
    expect(html).toContain("Internet");
    expect(html).toContain('data-table__primary" title="BMI Serviços Digitais">Internet');
  });

  it("dashboard sort accessor uses alias", () => {
    const data = baseData({ transactions: [tx({ id: "tx-1" })] });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const accessor = getDashboardRecentSortAccessors(data).description;
    expect(accessor.getValue(data.transactions[0]!)).toBe("Internet");
  });

  it("planning suggestion uses alias for display only", () => {
    const data = baseData({
      transactions: [
        tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
        tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
      ],
    });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const suggestion = buildRecurringSuggestions(data)[0];
    expect(suggestion?.description).toBe(SOURCE);
    expect(transactionDisplayDescriptionForSource(data, suggestion!.description)).toBe("Internet");
    const draft = suggestionToRuleDraft(data, suggestion!);
    expect(draft.description).toBe("Internet");
    confirmRecurringSuggestion(data, suggestion!.id, {
      recurrenceClass: suggestion!.proposedRecurrenceClass,
      selectedCompetenceMonth: "2026-07",
    });
    expect(data.recurringRules?.[0]?.description).toBe("Internet");
    expect(suggestion?.normalizedDescription).toBe(normalizeTransactionDescription(SOURCE));
  });

  it("manual recurring rule is not overwritten by alias", () => {
    const data = baseData({
      recurringRules: [
        {
          id: "rule-manual",
          kind: "expense",
          description: "Meu plano",
          amountCents: 9990,
          category: "Moradia",
          dayOfMonth: 10,
          startMonth: "2026-07",
          status: "active",
          billingMode: "direct",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      transactions: [tx({ id: "tx-1", description: SOURCE })],
    });
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    expect(data.recurringRules?.[0]?.description).toBe("Meu plano");
  });

  it("legacy data loads with empty aliases", () => {
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
      expect(parsed.data.transactionDescriptionAliases).toEqual([]);
    }
  });

  it("applyImportPlan preserves aliases", () => {
    const data = baseData({
      transactionDescriptionAliases: [
        {
          id: transactionDescriptionAliasId(normalizeTransactionDescription(SOURCE)),
          sourceDescriptionNormalized: normalizeTransactionDescription(SOURCE),
          sourceDescriptionSample: SOURCE,
          displayName: "Internet",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const validated = importPayloadWithBmi();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    expect(data.transactionDescriptionAliases).toHaveLength(1);
    expect(data.transactionDescriptionAliases?.[0]?.displayName).toBe("Internet");
  });

  it("serialization and reload preserve aliases", () => {
    const data = baseData();
    upsertTransactionDescriptionAlias(data, SOURCE, "Internet");
    const raw = serializeAppData(data);
    const loaded = parseAppDataJson(raw);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.transactionDescriptionAliases?.[0]?.displayName).toBe("Internet");
      expect(transactionDisplayDescriptionForSource(loaded.data, SOURCE)).toBe("Internet");
    }
  });
});
