import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import type { AppMutations } from "./forms";
import {
  compatibleTransactionsForRecurringOccurrence,
  recurringMatchId,
  recurringResolutionsForMonth,
} from "./recurrence-reconciliation";
import {
  createRecurringMatch,
  createRecurringRule,
  endRecurringRule,
  pauseRecurringRule,
  removeRecurringMatch,
  removeRecurringMatchById,
  resumeRecurringRule,
  updateRecurringRule,
  validateRecurringRuleDraft,
} from "./recurring-operations";
import {
  formatRecurringDifferenceLabel,
  buildPlanejamentoSummary,
  resolutionStateLabel,
} from "./planejamento-presentation";
import {
  renderPlanejamento,
  renderPlanejamentoHeaderActions,
  resetPlanejamentoUiStateForTests,
} from "./pages/planejamento";
import { normalizeRoute, ROUTE_LABELS } from "./router";
import { emptyAppData, serializeAppData } from "./storage";
import type { AppData, RecurringRule, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id">): RecurringRule {
  return {
    kind: "expense",
    description: "Internet",
    amountCents: 12_990,
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
    description: "Internet paga",
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
        name: "Cartão Demo",
        closingDay: 10,
        dueDay: 20,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    ...options,
  };
}

const mutations: AppMutations = {
  update(mutator) {
    mutator(dataRef);
  },
};

let dataRef = baseData();

describe("planejamento route and page", () => {
  beforeEach(() => {
    resetPlanejamentoUiStateForTests();
    dataRef = baseData();
  });

  afterEach(() => {
    resetPlanejamentoUiStateForTests();
  });

  it("registers the Planejamento route", () => {
    expect(normalizeRoute("#/planejamento")).toBe("/planejamento");
    expect(ROUTE_LABELS["/planejamento"]).toBe("Planejamento");
  });

  it("renders summary, suggestions, occurrences and rules sections", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-1" })] });
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});

    expect(host.querySelector("#planejamento-summary-host")).not.toBeNull();
    expect(host.querySelector("#planejamento-suggestions-host")).not.toBeNull();
    expect(host.querySelector("#planejamento-occurrences-host")).not.toBeNull();
    expect(host.querySelector("#planejamento-rules-host")).not.toBeNull();
    expect(host.textContent).toContain("Resumo da competência");
    expect(host.textContent).toContain("Sugestões encontradas");
    expect(host.textContent).toContain("Ocorrências do mês");
    expect(host.textContent).toContain("Regras mensais");
  });

  it("orders page sections with manual form after rules", () => {
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    const page = host.querySelector(".planejamento-page");
    const ids = Array.from(page?.children ?? [])
      .map((node) => (node as HTMLElement).id)
      .filter(Boolean);
    expect(ids.indexOf("planejamento-summary-host")).toBeLessThan(
      ids.indexOf("planejamento-suggestions-host"),
    );
    expect(ids.indexOf("planejamento-suggestions-host")).toBeLessThan(
      ids.indexOf("planejamento-occurrences-host"),
    );
    expect(ids.indexOf("planejamento-occurrences-host")).toBeLessThan(
      ids.indexOf("planejamento-rules-host"),
    );
    expect(ids.indexOf("planejamento-rules-host")).toBeLessThan(
      ids.indexOf("planejamento-form-host"),
    );
  });

  it("shows suggestion actions and keeps Nova regra secondary", () => {
    dataRef = baseData({
      transactions: [
        tx({ id: "tx-1", competenceMonth: "2026-06", date: "2026-06-10" }),
        tx({ id: "tx-2", competenceMonth: "2026-07", date: "2026-07-10" }),
      ],
    });
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    const headerActions = document.createElement("div");
    renderPlanejamentoHeaderActions(headerActions);
    expect(host.querySelector("[data-action='confirm-suggestion']")).not.toBeNull();
    expect(host.querySelector("[data-action='ignore-suggestion']")).not.toBeNull();
    expect(headerActions.querySelector("[data-action='new-rule']")?.className).toContain(
      "btn--secondary",
    );
    expect(host.querySelector(".planejamento-suggestion-group")).not.toBeNull();
    expect(
      host.querySelector(".segmented-control, .planejamento-suggestion-row__class-badge"),
    ).not.toBeNull();
  });

  it("keeps manual form hidden until Nova regra is triggered", () => {
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    const formHost = host.querySelector<HTMLElement>("#planejamento-form-host");
    expect(formHost?.hidden).toBe(true);
    document.dispatchEvent(new CustomEvent("cfm:planejamento-new-rule"));
    renderPlanejamento(host, dataRef, mutations, () => {});
    expect(host.querySelector<HTMLElement>("#planejamento-form-host")?.hidden).toBe(false);
  });

  it("exposes segmented rule filters and occurrence states", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-1" })],
    });
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    expect(host.querySelector(".segmented-control--rules")).not.toBeNull();
    expect(host.querySelector(".cfm-table--planejamento-occurrences")).not.toBeNull();
    expect(host.textContent).toContain("PREVISTA");
  });
});

describe("recurring rule operations", () => {
  beforeEach(() => {
    dataRef = baseData();
  });

  it("creates a direct income rule", () => {
    const errors = createRecurringRule(dataRef, {
      kind: "income",
      description: "Salário",
      amountInput: "5000,00",
      category: "Trabalho",
      dayOfMonth: "5",
      startMonth: "2026-07",
      endMonth: "",
      billingMode: "direct",
      cardId: "",
    });
    expect(errors).toEqual({});
    expect(dataRef.recurringRules?.[0]?.kind).toBe("income");
    expect(dataRef.recurringRules?.[0]?.billingMode).toBe("direct");
  });

  it("creates a direct expense rule", () => {
    const errors = createRecurringRule(dataRef, {
      kind: "expense",
      description: "Aluguel",
      amountInput: "1200,00",
      category: "Moradia",
      dayOfMonth: "10",
      startMonth: "2026-07",
      endMonth: "",
      billingMode: "direct",
      cardId: "",
    });
    expect(errors).toEqual({});
    expect(dataRef.recurringRules?.[0]?.billingMode).toBe("direct");
  });

  it("creates a card expense rule", () => {
    const errors = createRecurringRule(dataRef, {
      kind: "expense",
      description: "Streaming",
      amountInput: "49,90",
      category: "Lazer",
      dayOfMonth: "15",
      startMonth: "2026-07",
      endMonth: "",
      billingMode: "card",
      cardId: "card-1",
    });
    expect(errors).toEqual({});
    expect(dataRef.recurringRules?.[0]?.cardId).toBe("card-1");
  });

  it("validates the recurring rule form draft", () => {
    const errors = validateRecurringRuleDraft(
      {
        kind: "income",
        description: "",
        amountInput: "0",
        category: "",
        dayOfMonth: "0",
        startMonth: "",
        endMonth: "2026-06",
        billingMode: "card",
        cardId: "",
      },
      ["card-1"],
    );
    expect(errors.description).toBeDefined();
    expect(errors.amount).toBeDefined();
    expect(errors.category).toBeDefined();
    expect(errors.dayOfMonth).toBeDefined();
  });

  it("updates, pauses, resumes and ends a rule preserving history", () => {
    createRecurringRule(dataRef, {
      kind: "expense",
      description: "Internet",
      amountInput: "129,90",
      category: "Casa",
      dayOfMonth: "10",
      startMonth: "2026-06",
      endMonth: "",
      billingMode: "direct",
      cardId: "",
    });
    const created = dataRef.recurringRules?.[0];
    expect(created).toBeDefined();

    const updateErrors = updateRecurringRule(dataRef, created!.id, {
      kind: "expense",
      description: "Internet fibra",
      amountInput: "139,90",
      category: "Casa",
      dayOfMonth: "12",
      startMonth: "2026-06",
      endMonth: "",
      billingMode: "direct",
      cardId: "",
    });
    expect(updateErrors).toEqual({});
    expect(dataRef.recurringRules?.[0]?.description).toBe("Internet fibra");

    pauseRecurringRule(dataRef, created!.id, "2026-08");
    expect(dataRef.recurringRules?.[0]?.status).toBe("paused");
    expect(dataRef.recurringRules?.[0]?.pausedFromMonth).toBe("2026-08");

    resumeRecurringRule(dataRef, created!.id, "2026-08");
    expect(dataRef.recurringRules?.[0]?.status).toBe("active");
    expect(dataRef.recurringRules?.[0]?.resumedFromMonth).toBe("2026-08");
    expect(dataRef.recurringRules?.[0]?.pausedFromMonth).toBe("2026-08");

    endRecurringRule(dataRef, created!.id, "2026-08");
    expect(dataRef.recurringRules?.[0]?.endMonth).toBe("2026-08");
    expect(dataRef.recurringRules?.[0]?.startMonth).toBe("2026-06");
  });
});

describe("planejamento occurrences and reconciliation", () => {
  beforeEach(() => {
    resetPlanejamentoUiStateForTests();
    dataRef = baseData();
  });

  it("keeps january and february visible when paused from march", () => {
    dataRef = baseData({
      recurringRules: [
        rule({ id: "rule-pause", startMonth: "2026-01", status: "active" }),
      ],
    });
    pauseRecurringRule(dataRef, "rule-pause", "2026-03");

    expect(recurringResolutionsForMonth(dataRef, "2026-01")).toHaveLength(1);
    expect(recurringResolutionsForMonth(dataRef, "2026-02")).toHaveLength(1);
    expect(recurringResolutionsForMonth(dataRef, "2026-03")).toHaveLength(0);
    expect(recurringResolutionsForMonth(dataRef, "2026-04")).toHaveLength(0);
  });

  it("keeps historical matches visible when rule is paused", () => {
    dataRef = baseData({
      recurringRules: [
        rule({
          id: "rule-pause-match",
          startMonth: "2026-01",
          status: "paused",
          pausedFromMonth: "2026-03",
        }),
      ],
      transactions: [tx({ id: "tx-feb", competenceMonth: "2026-02", date: "2026-02-10" })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-pause-match", "2026-02"),
          ruleId: "rule-pause-match",
          competenceMonth: "2026-02",
          transactionId: "tx-feb",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const [resolution] = recurringResolutionsForMonth(dataRef, "2026-02");
    expect(resolution?.state).toBe("matched");
  });

  it("resumes future projections after reactivating a paused rule", () => {
    dataRef = baseData({
      recurringRules: [
        rule({
          id: "rule-resume",
          startMonth: "2026-01",
          status: "paused",
          pausedFromMonth: "2026-03",
        }),
      ],
    });
    resumeRecurringRule(dataRef, "rule-resume", "2026-06");
    expect(recurringResolutionsForMonth(dataRef, "2026-03")).toHaveLength(0);
    expect(recurringResolutionsForMonth(dataRef, "2026-04")).toHaveLength(0);
    expect(recurringResolutionsForMonth(dataRef, "2026-06")).toHaveLength(1);
  });

  it("ends a rule inclusively at endMonth without dropping prior months", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-end", startMonth: "2026-01" })],
    });
    endRecurringRule(dataRef, "rule-end", "2026-03");
    expect(recurringResolutionsForMonth(dataRef, "2026-02")).toHaveLength(1);
    expect(recurringResolutionsForMonth(dataRef, "2026-03")).toHaveLength(1);
    expect(recurringResolutionsForMonth(dataRef, "2026-04")).toHaveLength(0);
  });

  it("counts summary metrics without double counting matched or covered states", () => {
    dataRef = baseData({
      recurringRules: [
        rule({ id: "rule-income", kind: "income", description: "Salário", amountCents: 500_000 }),
        rule({ id: "rule-matched", amountCents: 10_000 }),
        rule({ id: "rule-covered", billingMode: "card", cardId: "card-1", amountCents: 20_000 }),
      ],
      transactions: [tx({ id: "tx-matched", amountCents: 10_000 })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-matched", "2026-07"),
          ruleId: "rule-matched",
          competenceMonth: "2026-07",
          transactionId: "tx-matched",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      invoices: [
        {
          id: "inv-covered",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 20_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = buildPlanejamentoSummary(dataRef, "2026-07");
    expect(summary.incomeProjectedCents).toBe(500_000);
    expect(summary.expenseProjectedCents).toBe(0);
    expect(summary.projectedCount).toBe(1);
    expect(summary.matchedCount).toBe(1);
    expect(summary.coveredCount).toBe(1);
  });

  it("removes invalid match while preserving rule and transactions", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-invalid-remove" })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-invalid-remove", "2026-07"),
          ruleId: "rule-invalid-remove",
          competenceMonth: "2026-07",
          transactionId: "missing-tx",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    removeRecurringMatchById(dataRef, recurringMatchId("rule-invalid-remove", "2026-07"));
    expect(dataRef.recurringMatches).toEqual([]);
    expect(dataRef.recurringRules).toHaveLength(1);
  });

  it("closes the candidate panel when competence changes", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-panel" })] });
    const host = document.createElement("div");
    const rerender = (): void => {
      renderPlanejamento(host, dataRef, mutations, rerender);
    };
    rerender();
    host.querySelector<HTMLButtonElement>("[data-action='toggle-link-panel']")?.click();
    expect(host.querySelector("[data-action='toggle-link-panel']")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    dataRef.selectedCompetenceMonth = "2026-08";
    rerender();
    expect(host.querySelector("[data-action='toggle-link-panel']")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("shows projected occurrence state", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-projected" })] });
    const [resolution] = recurringResolutionsForMonth(dataRef, "2026-07");
    expect(resolution?.state).toBe("projected");
    expect(resolutionStateLabel(resolution!.state)).toBe("PREVISTA");
  });

  it("shows matched occurrence state", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-matched" })],
      transactions: [tx({ id: "tx-1" })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-matched", "2026-07"),
          ruleId: "rule-matched",
          competenceMonth: "2026-07",
          transactionId: "tx-1",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const [resolution] = recurringResolutionsForMonth(dataRef, "2026-07");
    expect(resolution?.state).toBe("matched");
    expect(resolutionStateLabel(resolution!.state)).toBe("CONCILIADA");
  });

  it("shows covered_by_invoice without calling it conciliated", () => {
    dataRef = baseData({
      recurringRules: [
        rule({ id: "rule-card", billingMode: "card", cardId: "card-1" }),
      ],
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
    const [resolution] = recurringResolutionsForMonth(dataRef, "2026-07");
    expect(resolution?.state).toBe("covered_by_invoice");
    expect(resolutionStateLabel(resolution!.state)).toBe("COBERTA PELA FATURA");
    expect(resolutionStateLabel(resolution!.state)).not.toBe("CONCILIADA");
  });

  it("lists compatible candidates without creating a match", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-candidates" })],
      transactions: [tx({ id: "tx-compatible" }), tx({ id: "tx-fee", expenseKind: "fee" })],
    });
    const [occurrence] = recurringResolutionsForMonth(dataRef, "2026-07").map(
      (item) => item.occurrence,
    );
    const candidates = compatibleTransactionsForRecurringOccurrence(dataRef, occurrence!);
    expect(candidates.map((item) => item.id)).toEqual(["tx-compatible"]);
    expect(dataRef.recurringMatches).toEqual([]);
  });

  it("creates a deterministic match when linking", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-link" })],
      transactions: [tx({ id: "tx-link" })],
    });
    const errors = createRecurringMatch(dataRef, "rule-link", "2026-07", "tx-link");
    expect(errors).toEqual({});
    expect(dataRef.recurringMatches?.[0]?.id).toBe("recurring-match:rule-link:2026-07");
  });

  it("removes only the match when unlinking", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-unlink" })],
      transactions: [tx({ id: "tx-unlink" })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-unlink", "2026-07"),
          ruleId: "rule-unlink",
          competenceMonth: "2026-07",
          transactionId: "tx-unlink",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    removeRecurringMatch(dataRef, "rule-unlink", "2026-07");
    expect(dataRef.recurringMatches).toEqual([]);
    expect(dataRef.transactions).toHaveLength(1);
    expect(dataRef.recurringRules).toHaveLength(1);
  });

  it("formats positive, negative and zero differences neutrally", () => {
    expect(formatRecurringDifferenceLabel(500)).toContain("acima do previsto");
    expect(formatRecurringDifferenceLabel(-500)).toContain("abaixo do previsto");
    expect(formatRecurringDifferenceLabel(0)).toBe("Conforme previsto");
  });

  it("shows invalid matches for review", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-invalid" })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-invalid", "2026-07"),
          ruleId: "rule-invalid",
          competenceMonth: "2026-07",
          transactionId: "missing-tx",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    expect(host.textContent).toContain("Vínculos que precisam de revisão");
    expect(host.querySelector("[data-action='remove-invalid-match']")).not.toBeNull();
  });

  it("updates occurrences when competence changes", () => {
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-month", startMonth: "2026-06" })],
      selectedCompetenceMonth: "2026-06",
    });
    expect(recurringResolutionsForMonth(dataRef, "2026-06")).toHaveLength(1);
    dataRef.selectedCompetenceMonth = "2026-08";
    expect(recurringResolutionsForMonth(dataRef, "2026-08")).toHaveLength(1);
  });

  it("does not persist derived occurrences", () => {
    dataRef = baseData({ recurringRules: [rule({ id: "rule-storage" })] });
    recurringResolutionsForMonth(dataRef, "2026-07");
    const raw = serializeAppData(dataRef);
    expect(raw).not.toContain('"state":"matched"');
    expect(raw).not.toContain("recurringResolutions");
  });

  it("preserves recurring rules and matches on reimport", () => {
    const parsed = parseImportJson(JSON.stringify(fixtureDocument));
    if (!parsed.ok) {
      throw new Error(parsed.message);
    }
    const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
    if (!validated.ok) {
      throw new Error(validated.summary.errors.join("; "));
    }
    dataRef = baseData({
      recurringRules: [rule({ id: "rule-preserved" })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-preserved", "2026-07"),
          ruleId: "rule-preserved",
          competenceMonth: "2026-07",
          transactionId: "tx-preserved",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
      transactions: [tx({ id: "tx-preserved" })],
    });
    const plan = buildImportPlan(dataRef, validated.payload, validated.summary);
    applyImportPlan(dataRef, plan);
    expect(dataRef.recurringRules).toHaveLength(1);
    expect(dataRef.recurringMatches).toHaveLength(1);
  });
});

describe("planejamento accessibility and focus", () => {
  beforeEach(() => {
    resetPlanejamentoUiStateForTests();
    dataRef = baseData({ recurringRules: [rule({ id: "rule-a11y" })] });
  });

  it("exposes keyboard and aria attributes on link toggle", () => {
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    const toggle = host.querySelector<HTMLButtonElement>("[data-action='toggle-link-panel']");
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBeTruthy();
  });

  it("keeps form input node while typing description", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const rerender = (): void => {
      renderPlanejamento(host, dataRef, mutations, rerender);
    };
    rerender();
    document.dispatchEvent(new CustomEvent("cfm:planejamento-new-rule"));
    rerender();
    const description = host.querySelector<HTMLInputElement>("#rule-description");
    expect(description).not.toBeNull();
    const inputRef = description!;
    description!.focus();
    description!.value = "Plano";
    description!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host.querySelector("#rule-description")).toBe(inputRef);
    vi.useRealTimers();
  });

  it("uses mobile-friendly single-column layout hooks", () => {
    const host = document.createElement("div");
    renderPlanejamento(host, dataRef, mutations, () => {});
    document.dispatchEvent(new CustomEvent("cfm:planejamento-new-rule"));
    renderPlanejamento(host, dataRef, mutations, () => {});
    expect(host.querySelector(".planejamento-page")).not.toBeNull();
    expect(host.querySelector(".planejamento-summary__strip")).not.toBeNull();
    expect(host.querySelector(".planejamento-form-panel")).not.toBeNull();
    expect(host.querySelector(".choice-chip")).not.toBeNull();
    expect(host.querySelector(".planejamento-suggestion-group, .empty-state")).not.toBeNull();
    expect(host.querySelector(".cfm-table--planejamento-occurrences")).not.toBeNull();
  });
});
