import { describe, expect, it, beforeEach } from "vitest";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import projectionsFixture from "./fixtures/cfm-import-v1-projections.json";
import { applyImportPlan, buildImportPlan } from "./import";
import { validateImportDocument } from "./import-validate";
import { calculateCompetenceSummary, invoiceTotalCentsValue, transactionsForInvoice } from "./finance";
import {
  buildDirectExpenseTransactions,
  buildIncomeTransactions,
  buildLedgerCardGroups,
  expenseSectionSubtotalCents,
  filterDirectExpenseTransactions,
  filterIncomeTransactions,
  filterLedgerCardGroups,
  groupDetailLines,
  isDirectLedgerExpense,
} from "./lancamentos-sections";
import {
  getExpandedLedgerKey,
  renderLancamentos,
  resetLancamentosUiStateForTests,
} from "./pages/lancamentos";
import { emptyAppData } from "./storage";
import type { AppData } from "./types";
import type { AppMutations } from "./forms";
import type { ImportPayload } from "./import-types";

const mutations: AppMutations = { update: () => {} };

function importFixture(payload: ImportPayload, fileName: string): AppData {
  const validated = validateImportDocument(payload, fileName);
  expect(validated.ok).toBe(true);
  if (!validated.ok) {
    throw new Error("invalid fixture");
  }
  const data = emptyAppData();
  applyImportPlan(
    data,
    buildImportPlan(data, validated.payload, { ...validated.summary, fileName }),
  );
  data.selectedCompetenceMonth = "2026-01";
  return data;
}

describe("lancamentos sections organization", () => {
  beforeEach(() => {
    resetLancamentosUiStateForTests();
  });

  it("separates income, direct expenses and invoice-linked purchases from fixture", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const incomes = buildIncomeTransactions(data, "2026-01");
    const expenses = buildDirectExpenseTransactions(data, "2026-01");
    const groups = buildLedgerCardGroups(data, "2026-01");

    expect(incomes).toHaveLength(1);
    expect(incomes[0]?.kind).toBe("income");
    expect(expenses).toHaveLength(2);
    expect(expenses.some((item) => item.expenseKind === "refund")).toBe(true);
    expect(expenses.every(isDirectLedgerExpense)).toBe(true);
    expect(groups.filter((item) => item.mode === "real")).toHaveLength(1);

    const invoiceGroup = groups.find((item) => item.mode === "real");
    const lines = invoiceGroup ? groupDetailLines(invoiceGroup, data) : [];
    expect(lines).toHaveLength(3);
    expect(lines.some((item) => item.description === "Compra sintética")).toBe(true);
    expect(lines.some((item) => item.description === "IOF sintético")).toBe(true);
    expect(lines.some((item) => item.description === "Parcela sintética")).toBe(true);
    expect(expenses.some((item) => item.description === "Compra sintética")).toBe(false);
  });

  it("uses official invoice total instead of summing line items", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const group = buildLedgerCardGroups(data, "2026-01").find((item) => item.mode === "real");
    expect(group?.invoice).toBeDefined();
    if (!group?.invoice) {
      return;
    }
    const lineSum = transactionsForInvoice(data.transactions, group.invoice.id).reduce(
      (total, item) => total + item.amountCents,
      0,
    );
    expect(lineSum).not.toBe(invoiceTotalCentsValue(group.invoice));
    expect(invoiceTotalCentsValue(group.invoice)).toBe(30000);
  });

  it("shows refund as positive value in expense subtotal", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const expenses = buildDirectExpenseTransactions(data, "2026-01");
    const subtotal = expenseSectionSubtotalCents(expenses);
    expect(subtotal).toBe(10000);
  });

  it("finds invoice line through search filters", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const groups = filterLedgerCardGroups(buildLedgerCardGroups(data, "2026-01"), {
      search: "iof",
      kind: "all",
      status: "all",
    }, data);
    expect(groups).toHaveLength(1);
  });

  it("shows projected card group when no real invoice exists for competence", () => {
    const data = importFixture(projectionsFixture as ImportPayload, "projections.json");
    data.selectedCompetenceMonth = "2026-07";
    const groups = buildLedgerCardGroups(data, "2026-07");
    expect(groups.some((item) => item.mode === "projected")).toBe(true);
    expect(groups.some((item) => item.mode === "real")).toBe(false);
  });

  it("real invoice blocks projected card group for same competence", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const groups = buildLedgerCardGroups(data, "2026-01");
    expect(groups.some((item) => item.mode === "projected")).toBe(false);
    expect(groups.some((item) => item.mode === "real")).toBe(true);
  });

  it("does not double count competence totals", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const summary = calculateCompetenceSummary(data, "2026-01");
    expect(summary.incomeSettledCents).toBe(500000);
    expect(summary.expensePaidCents).toBeGreaterThan(0);
  });

  it("renders three sections and toggles invoice detail aria-expanded", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const host = document.createElement("div");
    const rerender = (): void => {
      renderLancamentos(host, data, mutations, rerender);
    };
    rerender();

    expect(host.querySelector(".lancamentos-section--income")).not.toBeNull();
    expect(host.querySelector(".lancamentos-section--expense")).not.toBeNull();
    expect(host.querySelector(".lancamentos-section--cards")).not.toBeNull();

    const toggle = host.querySelector<HTMLButtonElement>("[data-ledger-toggle]");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.click();
    const expandedToggle = host.querySelector<HTMLButtonElement>("[data-ledger-toggle]");
    expect(expandedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".ledger-card-block__detail table")).not.toBeNull();

    const secondKey = host.querySelectorAll<HTMLButtonElement>("[data-ledger-toggle]")[0]?.dataset.ledgerToggle;
    expect(getExpandedLedgerKey()).toBe(secondKey ?? null);
  });

  it("closes expanded detail when competence changes", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const host = document.createElement("div");
    const rerender = (): void => {
      renderLancamentos(host, data, mutations, rerender);
    };
    rerender();
    host.querySelector<HTMLButtonElement>("[data-ledger-toggle]")?.click();
    expect(getExpandedLedgerKey()).not.toBeNull();

    data.selectedCompetenceMonth = "2026-02";
    rerender();
    expect(getExpandedLedgerKey()).toBeNull();
  });

  it("sorts income and expense sections independently", () => {
    const data = importFixture(fixtureDocument as ImportPayload, "fixture.json");
    const incomes = filterIncomeTransactions(buildIncomeTransactions(data, "2026-01"), {
      search: "",
      kind: "all",
      status: "all",
    }, data);
    const expenses = filterDirectExpenseTransactions(buildDirectExpenseTransactions(data, "2026-01"), {
      search: "",
      kind: "all",
      status: "all",
    }, data);
    expect(incomes).toHaveLength(1);
    expect(expenses).toHaveLength(2);
  });
});
