import { describe, expect, it } from "vitest";
import {
  calculateCompetenceSummary,
  filterInvoicesByCompetence,
  filterTransactionsByCompetence,
  formatCentsToBRL,
  parseMoneyToCents,
  validateCardForm,
  validateInvoiceForm,
  validateTransactionForm,
} from "./finance";
import type { AppData } from "./types";

function sampleData(): AppData {
  return {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-07",
    transactions: [
      {
        id: "income-1",
        kind: "income",
        description: "Salário",
        amountCents: 500000,
        date: "2026-07-05",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "settled",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "income-2",
        kind: "income",
        description: "Freela",
        amountCents: 100000,
        date: "2026-07-10",
        competenceMonth: "2026-07",
        category: "Trabalho",
        status: "pending",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "expense-1",
        kind: "expense",
        description: "Aluguel",
        amountCents: 150000,
        date: "2026-07-08",
        competenceMonth: "2026-07",
        category: "Moradia",
        status: "settled",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "expense-2",
        kind: "expense",
        description: "Mercado",
        amountCents: 40000,
        date: "2026-07-12",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "pending",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "expense-other-month",
        kind: "expense",
        description: "Outro mês",
        amountCents: 99900,
        date: "2026-06-12",
        competenceMonth: "2026-06",
        category: "Casa",
        status: "pending",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    cards: [
      {
        id: "card-1",
        name: "Nubank",
        closingDay: 1,
        dueDay: 8,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    invoices: [
      {
        id: "invoice-open",
        cardId: "card-1",
        competenceMonth: "2026-07",
        amountCents: 80000,
        amountDueCents: 80000,
        dueDate: "2026-07-08",
        status: "open",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "invoice-paid",
        cardId: "card-1",
        competenceMonth: "2026-07",
        amountCents: 20000,
        amountPaidCents: 20000,
        amountDueCents: 0,
        dueDate: "2026-07-08",
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  };
}

describe("finance calculations", () => {
  it("formats zero without negative sign", () => {
    expect(formatCentsToBRL(0)).toBe("R$\u00a00,00");
    expect(formatCentsToBRL(-0)).toBe("R$\u00a00,00");
  });

  it("calculates planned and settled income", () => {
    const summary = calculateCompetenceSummary(sampleData(), "2026-07");
    expect(summary.incomePlannedCents).toBe(600000);
    expect(summary.incomeSettledCents).toBe(500000);
    expect(summary.incomePendingCents).toBe(100000);
  });

  it("calculates planned and paid expenses including invoices", () => {
    const summary = calculateCompetenceSummary(sampleData(), "2026-07");
    expect(summary.expensePlannedCents).toBe(290000);
    expect(summary.expensePaidCents).toBe(170000);
    expect(summary.expensePendingCents).toBe(120000);
  });

  it("calculates planned and realized balances", () => {
    const summary = calculateCompetenceSummary(sampleData(), "2026-07");
    expect(summary.balancePlannedCents).toBe(310000);
    expect(summary.balanceRealizedCents).toBe(330000);
  });

  it("filters by competence without mixing months", () => {
    const data = sampleData();
    const transactions = filterTransactionsByCompetence(data.transactions, "2026-07");
    const invoices = filterInvoicesByCompetence(data.invoices, "2026-07");

    expect(transactions).toHaveLength(4);
    expect(invoices).toHaveLength(2);
    expect(
      transactions.every((item) => item.competenceMonth === "2026-07"),
    ).toBe(true);
  });

  it("does not double count in_invoice purchases in paid or committed totals", () => {
    const data = sampleData();
    const summary = calculateCompetenceSummary(data, "2026-07");
    const ledgerExpenses = filterTransactionsByCompetence(data.transactions, "2026-07")
      .filter((item) => item.kind === "expense")
      .reduce((total, item) => total + item.amountCents, 0);

    expect(summary.expensePaidCents).toBe(170000);
    expect(summary.expensePendingCents).toBe(120000);
    expect(summary.expensePlannedCents).toBe(290000);
    expect(ledgerExpenses).toBe(190000);
  });
});

describe("monetary validations", () => {
  it("parses valid BRL input to cents", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 10,50")).toBe(1050);
  });

  it("rejects invalid transaction values", () => {
    const result = validateTransactionForm({
      description: "",
      amountInput: "0",
      date: "2026-13-40",
      competenceMonth: "2026-07",
      category: "",
    });

    expect(result.amountCents).toBeNull();
    expect(result.errors.description).toBeDefined();
    expect(result.errors.amount).toBeDefined();
    expect(result.errors.date).toBeDefined();
    expect(result.errors.category).toBeDefined();
  });

  it("validates card optional days", () => {
    const result = validateCardForm({
      name: "Cartão",
      closingDay: "32",
      dueDay: "",
    });

    expect(result.errors.closingDay).toBeDefined();
    expect(result.dueDay).toBeNull();
  });

  it("validates invoice requirements", () => {
    const result = validateInvoiceForm({
      cardId: "",
      competenceMonth: "2026-07",
      amountInput: "abc",
      dueDate: "2026-07-10",
    });

    expect(result.errors.cardId).toBeDefined();
    expect(result.errors.amount).toBeDefined();
  });
});
