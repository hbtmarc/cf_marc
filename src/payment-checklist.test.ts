import { describe, expect, it } from "vitest";
import { buildPaymentChecklist } from "./payment-checklist";
import { emptyAppData } from "./storage";
import { upsertTransactionDescriptionAlias } from "./transaction-aliases";
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
        id: "internet",
        kind: "expense",
        description: "Internet",
        amountCents: 12_990,
        date: "2026-07-10",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "settled",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "boleto",
        kind: "expense",
        description: "Boleto avulso",
        amountCents: 20_000,
        date: "2026-07-12",
        competenceMonth: "2026-07",
        category: "Casa",
        status: "pending",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    recurringRules: [
      {
        id: "rule-internet",
        kind: "expense",
        description: "Internet",
        amountCents: 12_990,
        category: "Casa",
        dayOfMonth: 10,
        startMonth: "2026-01",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "rule-rent",
        kind: "expense",
        description: "Aluguel",
        amountCents: 100_000,
        category: "Casa",
        dayOfMonth: 8,
        startMonth: "2026-01",
        status: "active",
        billingMode: "direct",
        recurrenceClass: "fixed_bill",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    recurringMatches: [
      {
        id: "recurring-match:rule-internet:2026-07",
        ruleId: "rule-internet",
        competenceMonth: "2026-07",
        transactionId: "internet",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    cards: [
      {
        id: "card",
        name: "Nubank",
        closingDay: 20,
        dueDay: 5,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    invoices: [
      {
        id: "invoice",
        cardId: "card",
        competenceMonth: "2026-07",
        amountCents: 80_000,
        amountDueCents: 80_000,
        amountPaidCents: 0,
        dueDate: "2026-07-15",
        status: "open",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  };
}

describe("payment checklist", () => {
  it("builds a one-way operational mirror from fixed bills, invoices and pending expenses", () => {
    const data = baseData();
    const checklist = buildPaymentChecklist(data, "2026-07");

    expect(checklist.items).toHaveLength(4);
    expect(checklist.items.map((item) => item.kind)).toEqual([
      "fixed_bill",
      "fixed_bill",
      "invoice",
      "other",
    ]);
    expect(checklist.checkedCount).toBe(0);
    expect(checklist.sourceOutstandingCents).toBe(200_000);
    expect(checklist.currentBalanceCents).toBe(487_010);
    expect(checklist.estimatedBalanceAfterCommitmentsCents).toBe(287_010);
  });

  it("does not auto-check items paid in the system", () => {
    const data = baseData();
    const checklist = buildPaymentChecklist(data, "2026-07");
    const internet = checklist.items.find((item) => item.id === "fixed:recurring:rule-internet:2026-07");

    expect(internet?.sourceChecked).toBe(true);
    expect(internet?.checked).toBe(false);
    expect(internet?.checkable).toBe(true);
  });

  it("applies display aliases to matched fixed bills", () => {
    const data = baseData();
    upsertTransactionDescriptionAlias(data, "Internet", "Fibra");
    const checklist = buildPaymentChecklist(data, "2026-07");
    const internet = checklist.items.find((item) => item.id === "fixed:recurring:rule-internet:2026-07");

    expect(internet?.title).toBe("Fibra");
  });

  it("applies manual checks without changing source financial status", () => {
    const data = baseData();
    data.monthlyBalances = [
      {
        id: "monthly-balance:2026-07",
        competenceMonth: "2026-07",
        incomeCents: 0,
        expenseCents: 0,
        balanceCents: 0,
        projectedBalanceCents: 0,
        fixedBillsCents: 0,
        invoicesCents: 0,
        checkedItemIds: [
          "fixed:recurring:rule-internet:2026-07",
          "fixed:recurring:rule-rent:2026-07",
          "invoice:invoice",
          "expense:boleto",
        ],
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ];

    const checklist = buildPaymentChecklist(data, "2026-07");
    expect(checklist.allChecked).toBe(true);
    expect(checklist.checklistRemainingCents).toBe(0);
    expect(data.transactions.find((item) => item.id === "boleto")?.status).toBe("pending");
    expect(data.invoices[0]?.status).toBe("open");
  });
});
