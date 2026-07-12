import { describe, expect, it } from "vitest";
import {
  buildDashboardCardSummary,
  buildDashboardRecurringSummary,
} from "./dashboard-executive";
import { calculateCompetenceSummary } from "./finance";
import {
  buildDashboardContext,
  renderCardSummaryPanel,
  renderProjectionPanel,
  renderRecurringSummaryPanel,
} from "./presentation";
import { renderDashboard } from "./pages/dashboard";
import {
  pauseRecurringRule,
  resumeRecurringRule,
} from "./recurring-operations";
import { hasInvoiceForCardMonth, projectedInstallmentCentsForMonth } from "./installments";
import { recurringMatchId, recurringResolutionsForMonth } from "./recurrence-reconciliation";
import { serializeAppData } from "./storage";
import type { AppData, RecurringRule, Transaction } from "./types";

const TIMESTAMP = "2026-07-01T00:00:00.000Z";

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id">): RecurringRule {
  return {
    kind: "expense",
    description: "Internet",
    amountCents: 12_990,
    category: "Moradia",
    dayOfMonth: 10,
    startMonth: "2026-01",
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
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-07",
    transactions: [],
    cards: [
      {
        id: "card-1",
        name: "Cartão Demo",
        closingDay: 10,
        dueDay: 20,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
      {
        id: "card-idle",
        name: "Cartão Ocioso",
        closingDay: 5,
        dueDay: 15,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
    invoices: [],
    recurringRules: [],
    recurringMatches: [],
    ...options,
  };
}

describe("dashboard executive integration", () => {
  it("adds projected recurring income only to planned totals", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "income-rule", kind: "income", description: "Salário", amountCents: 500_000 }),
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringIncomeProjectedCents).toBe(500_000);
    expect(summary.incomePlannedCents).toBe(500_000);
    expect(summary.incomeSettledCents).toBe(0);
    expect(summary.incomePendingCents).toBe(500_000);
  });

  it("adds projected recurring expense only to committed totals", () => {
    const data = baseData({
      recurringRules: [rule({ id: "expense-rule", amountCents: 80_000 })],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(80_000);
    expect(summary.expensePaidCents).toBe(0);
    expect(summary.expensePendingCents).toBe(80_000);
    expect(summary.expensePlannedCents).toBe(80_000);
  });

  it("does not duplicate matched recurring transactions", () => {
    const data = baseData({
      recurringRules: [rule({ id: "matched-rule", amountCents: 50_000 })],
      transactions: [tx({ id: "tx-match", amountCents: 50_000 })],
      recurringMatches: [
        {
          id: recurringMatchId("matched-rule", "2026-07"),
          ruleId: "matched-rule",
          competenceMonth: "2026-07",
          transactionId: "tx-match",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringProjectedCount).toBe(0);
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(summary.expensePaidCents).toBe(50_000);
    expect(summary.expensePlannedCents).toBe(50_000);
  });

  it("does not duplicate covered_by_invoice recurring obligations", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "card-rule", billingMode: "card", cardId: "card-1", amountCents: 30_000 }),
      ],
      invoices: [
        {
          id: "inv-1",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 30_000,
          amountDueCents: 30_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(summary.expensePendingCents).toBe(30_000);
  });

  it("includes card recurring without invoice in projected expense", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "card-rec", billingMode: "card", cardId: "card-1", amountCents: 25_000 }),
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(25_000);
    const cardSummary = buildDashboardCardSummary(data, "2026-07");
    expect(cardSummary?.cards[0]?.mode).toBe("projected");
    expect(cardSummary?.cards[0]?.totalCents).toBe(25_000);
  });

  it("uses real invoice totals instead of card recurring projection", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "card-rec", billingMode: "card", cardId: "card-1", amountCents: 25_000 }),
      ],
      invoices: [
        {
          id: "inv-real",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 90_000,
          amountDueCents: 90_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(summary.expensePendingCents).toBe(90_000);
    const cardSummary = buildDashboardCardSummary(data, "2026-07");
    expect(cardSummary?.cards[0]?.mode).toBe("real");
    expect(cardSummary?.cards[0]?.totalCents).toBe(90_000);
  });

  it("sums distinct installment and recurring projections without duplicity", () => {
    const data = baseData({
      transactions: [
        tx({
          id: "installment-src",
          ledgerStatus: "in_invoice",
          cardId: "card-1",
          installment: { current: 2, total: 4 },
          competenceMonth: "2026-06",
          date: "2026-06-15",
        }),
      ],
      recurringRules: [
        rule({ id: "card-rec", billingMode: "card", cardId: "card-1", amountCents: 15_000 }),
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(15_000);
    expect(summary.expensePendingCents).toBe(25_000);
    const cardSummary = buildDashboardCardSummary(data, "2026-07");
    expect(cardSummary?.cards[0]?.totalCents).toBe(25_000);
  });

  it("reconciles projected breakdown lines with balancePlannedCents", () => {
    const data = baseData({
      transactions: [
        {
          id: "income-pending",
          kind: "income",
          description: "Freela",
          amountCents: 100_000,
          date: "2026-07-05",
          competenceMonth: "2026-07",
          category: "Trabalho",
          status: "pending",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        tx({ id: "expense-pending", status: "pending", amountCents: 40_000 }),
      ],
      recurringRules: [
        rule({ id: "income-rec", kind: "income", description: "Salário", amountCents: 200_000 }),
        rule({ id: "expense-rec", amountCents: 30_000 }),
      ],
      invoices: [
        {
          id: "inv-open",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 50_000,
          amountDueCents: 50_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const ctx = buildDashboardContext(data, "2026-07");
    const breakdownTotal =
      ctx.projection.realizedCents +
      ctx.projection.pendingIncomeCents +
      ctx.projection.recurringIncomeProjectedCents -
      ctx.projection.pendingExpenseTxCents -
      ctx.projection.openInvoicesCents -
      ctx.projection.projectedInstallmentsCents -
      ctx.projection.recurringExpenseProjectedCents;
    expect(breakdownTotal).toBe(ctx.projection.projectedCents);
    expect(renderProjectionPanel(ctx)).toContain("Recorrências projetadas");
  });

  it("shows projected, matched and covered states in recurring panel", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "rule-projected" }),
        rule({ id: "rule-matched", description: "Luz" }),
        rule({ id: "rule-covered", billingMode: "card", cardId: "card-1", description: "Streaming" }),
      ],
      transactions: [tx({ id: "tx-matched", description: "Luz paga" })],
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
          amountCents: 12_990,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const recurring = buildDashboardRecurringSummary(data, "2026-07");
    expect(recurring?.projectedCount).toBe(1);
    expect(recurring?.matchedCount).toBe(1);
    expect(recurring?.coveredCount).toBe(1);
    const html = renderRecurringSummaryPanel(recurring);
    expect(html).toContain("PREVISTA");
    expect(html).toContain("CONCILIADA");
    expect(html).toContain("COBERTA PELA FATURA");
  });

  it("uses official invoice totals when a real invoice exists", () => {
    const data = baseData({
      invoices: [
        {
          id: "inv-official",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 120_000,
          amountPaidCents: 20_000,
          amountDueCents: 100_000,
          dueDate: "2026-07-20",
          status: "partial",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const html = renderCardSummaryPanel(buildDashboardCardSummary(data, "2026-07"));
    expect(html).toContain("Cartão Demo");
    expect(html.replace(/\u00a0/g, " ")).toContain("R$ 1.200,00");
    expect(html).not.toContain("PROJETADA");
  });

  it("uses projected totals when no real invoice exists", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "card-rec", billingMode: "card", cardId: "card-1", amountCents: 45_000 }),
      ],
    });
    const html = renderCardSummaryPanel(buildDashboardCardSummary(data, "2026-07"));
    expect(html).toContain("PROJETADA");
    expect(html).toContain("Fatura projetada");
    expect(html.replace(/\u00a0/g, " ")).toContain("R$ 450,00");
  });

  it("omits cards without movement in the competence", () => {
    const data = baseData({
      recurringRules: [rule({ id: "card-rec", billingMode: "card", cardId: "card-1" })],
    });
    const cardSummary = buildDashboardCardSummary(data, "2026-07");
    expect(cardSummary?.cards.some((item) => item.cardId === "card-idle")).toBe(false);
  });

  it("does not recreate paused months after reactivation in june", () => {
    const data = baseData({
      recurringRules: [
        rule({
          id: "pause-gap",
          startMonth: "2026-01",
          status: "paused",
          pausedFromMonth: "2026-03",
        }),
      ],
    });
    pauseRecurringRule(data, "pause-gap", "2026-03");
    resumeRecurringRule(data, "pause-gap", "2026-06");
    expect(recurringResolutionsForMonth(data, "2026-01")).toHaveLength(1);
    expect(recurringResolutionsForMonth(data, "2026-02")).toHaveLength(1);
    expect(recurringResolutionsForMonth(data, "2026-03")).toHaveLength(0);
    expect(recurringResolutionsForMonth(data, "2026-05")).toHaveLength(0);
    expect(recurringResolutionsForMonth(data, "2026-06")).toHaveLength(1);
  });

  it("updates dashboard panels when competence changes", () => {
    const data = baseData({
      selectedCompetenceMonth: "2026-07",
      recurringRules: [rule({ id: "month-rule", startMonth: "2026-06" })],
    });
    const july = buildDashboardRecurringSummary(data, "2026-07");
    const june = buildDashboardRecurringSummary(data, "2026-06");
    expect(july?.projectedCount).toBe(1);
    expect(june?.projectedCount).toBe(1);
    data.selectedCompetenceMonth = "2026-08";
    expect(buildDashboardRecurringSummary(data, "2026-08")?.projectedCount).toBe(1);
  });

  it("does not persist derived recurring summaries", () => {
    const data = baseData({
      recurringRules: [rule({ id: "persist-rule" })],
    });
    buildDashboardRecurringSummary(data, "2026-07");
    calculateCompetenceSummary(data, "2026-07");
    const raw = serializeAppData(data);
    expect(raw).not.toContain("recurringIncomeProjectedCents");
    expect(raw).not.toContain("recurringProjectedCount");
    expect(raw).not.toContain("dashboardSummary");
  });

  it("links recurring and card panels to Planejamento and Faturas", () => {
    const data = baseData({
      recurringRules: [rule({ id: "link-rule" })],
      invoices: [
        {
          id: "inv-link",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 10_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const host = document.createElement("div");
    renderDashboard(host, data, { update() {} }, () => {});
    expect(host.innerHTML).toContain('href="#/planejamento"');
    expect(host.innerHTML).toContain('href="#/faturas"');
  });

  it("keeps mobile layout hooks and bottom spacing", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "mobile-rule" }),
        rule({ id: "mobile-card", billingMode: "card", cardId: "card-1" }),
      ],
    });
    const host = document.createElement("div");
    renderDashboard(host, data, { update() {} }, () => {});
    expect(host.querySelector(".panel--dashboard-recurring")).not.toBeNull();
    expect(host.querySelector(".panel--dashboard-cards")).not.toBeNull();
    expect(host.querySelector(".dashboard-grid")).not.toBeNull();
  });

  it("preserves baseline finance calculations without recurring rules", () => {
    const data = baseData({
      transactions: [
        {
          id: "income-1",
          kind: "income",
          description: "Salário",
          amountCents: 300_000,
          date: "2026-07-05",
          competenceMonth: "2026-07",
          category: "Trabalho",
          status: "settled",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        tx({ id: "expense-1", amountCents: 100_000 }),
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.incomePlannedCents).toBe(300_000);
    expect(summary.expensePaidCents).toBe(100_000);
    expect(summary.balanceRealizedCents).toBe(200_000);
    expect(summary.recurringIncomeProjectedCents).toBe(0);
    expect(summary.recurringExpenseProjectedCents).toBe(0);
  });
});

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
      tx({
        id: "expense-paid",
        description: "Despesa direta paga",
        amountCents: 50_000,
      }),
      tx({
        id: "expense-matched",
        description: "Despesa conciliada",
        amountCents: 15_000,
      }),
      tx({
        id: "installment-src",
        ledgerStatus: "in_invoice",
        cardId: "card-install",
        amountCents: 30_000,
        competenceMonth: "2026-06",
        date: "2026-06-12",
        installment: { current: 2, total: 4 },
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
        id: recurringMatchId("expense-matched-recurring", "2026-07"),
        ruleId: "expense-matched-recurring",
        competenceMonth: "2026-07",
        transactionId: "expense-matched",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ],
  });
}

describe("etapa 8.4.1 integrated closing audit", () => {
  it("counts each integrated value exactly once in the mandatory scenario", () => {
    const data = integratedAuditData();
    const summary = calculateCompetenceSummary(data, "2026-07");
    const ctx = buildDashboardContext(data, "2026-07");

    expect(summary.incomeSettledCents).toBe(500_000);
    expect(summary.expensePaidCents).toBe(65_000);
    expect(summary.balanceRealizedCents).toBe(435_000);

    expect(summary.recurringIncomeProjectedCents).toBe(100_000);
    expect(summary.recurringExpenseProjectedCents).toBe(20_000);
    expect(summary.recurringProjectedCount).toBe(2);

    expect(summary.expensePendingCents).toBe(130_000);
    expect(summary.incomePlannedCents).toBe(600_000);
    expect(summary.expensePlannedCents).toBe(195_000);
    expect(summary.balancePlannedCents).toBe(405_000);

    expect(ctx.projection.openInvoicesCents).toBe(80_000);
    expect(ctx.projection.projectedInstallmentsCents).toBe(30_000);
    expect(ctx.projection.pendingExpenseTxCents).toBe(0);
    expect(ctx.projection.pendingIncomeCents).toBe(0);

    const breakdown =
      ctx.projection.realizedCents +
      ctx.projection.pendingIncomeCents +
      ctx.projection.recurringIncomeProjectedCents -
      ctx.projection.pendingExpenseTxCents -
      ctx.projection.openInvoicesCents -
      ctx.projection.projectedInstallmentsCents -
      ctx.projection.recurringExpenseProjectedCents;
    expect(breakdown).toBe(405_000);
    expect(ctx.projection.projectedCents).toBe(405_000);

    const resolutions = recurringResolutionsForMonth(data, "2026-07");
    expect(resolutions.find((item) => item.occurrence.ruleId === "expense-matched-recurring")?.state).toBe(
      "matched",
    );
    expect(resolutions.find((item) => item.occurrence.ruleId === "expense-card-covered")?.state).toBe(
      "covered_by_invoice",
    );
    expect(
      resolutions.filter((item) => item.state === "projected").map((item) => item.occurrence.ruleId).sort(),
    ).toEqual(["expense-direct-recurring", "income-recurring"]);
  });
});

describe("etapa 8.4.1 precedence audit", () => {
  it("keeps explicit match over projection", () => {
    const data = baseData({
      recurringRules: [rule({ id: "matched-rule", amountCents: 15_000 })],
      transactions: [tx({ id: "tx-match", amountCents: 15_000 })],
      recurringMatches: [
        {
          id: recurringMatchId("matched-rule", "2026-07"),
          ruleId: "matched-rule",
          competenceMonth: "2026-07",
          transactionId: "tx-match",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(summary.expensePaidCents).toBe(15_000);
  });

  it("suppresses card recurring projection when a real invoice exists", () => {
    const data = integratedAuditData();
    expect(calculateCompetenceSummary(data, "2026-07").recurringExpenseProjectedCents).toBe(20_000);
  });

  it("suppresses installment projection when a real invoice exists for the card", () => {
    const data = baseData({
      transactions: [
        tx({
          id: "installment-src",
          ledgerStatus: "in_invoice",
          cardId: "card-1",
          installment: { current: 2, total: 4 },
          competenceMonth: "2026-06",
          date: "2026-06-12",
        }),
      ],
      invoices: [
        {
          id: "inv-real",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 50_000,
          amountDueCents: 50_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.expensePendingCents).toBe(50_000);
    expect(projectedInstallmentCentsForMonth(data, "2026-07")).toBe(0);
    expect(hasInvoiceForCardMonth(data, "card-1", "2026-07")).toBe(true);
  });

  it("does not treat credit balance as open expense", () => {
    const data = baseData({
      invoices: [
        {
          id: "inv-credit",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 0,
          amountDueCents: 0,
          creditBalanceCents: 25_000,
          dueDate: "2026-07-20",
          status: "paid",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    const cardSummary = buildDashboardCardSummary(data, "2026-07");
    expect(summary.expensePendingCents).toBe(0);
    expect(cardSummary?.cards[0]?.statusLabel).toBe("Credora");
    expect(cardSummary?.cards[0]?.openCents).toBe(0);
  });

  it("does not duplicate invoice purchases when the invoice is paid", () => {
    const data = baseData({
      transactions: [
        tx({
          id: "purchase-in-invoice",
          ledgerStatus: "in_invoice",
          cardId: "card-1",
          invoiceId: "inv-paid",
          amountCents: 40_000,
        }),
      ],
      invoices: [
        {
          id: "inv-paid",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 40_000,
          amountPaidCents: 40_000,
          amountDueCents: 0,
          dueDate: "2026-07-20",
          status: "paid",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    expect(summary.expensePaidCents).toBe(40_000);
    expect(summary.expensePendingCents).toBe(0);
  });

  it("keeps an empty competence neutral at zero", () => {
    const summary = calculateCompetenceSummary(baseData(), "2026-08");
    expect(summary.balanceRealizedCents).toBe(0);
    expect(summary.balancePlannedCents).toBe(0);
    expect(summary.recurringIncomeProjectedCents).toBe(0);
    expect(summary.recurringExpenseProjectedCents).toBe(0);
    expect(buildDashboardRecurringSummary(baseData(), "2026-08")).toBeNull();
    expect(buildDashboardCardSummary(baseData(), "2026-08")).toBeNull();
  });
});

describe("etapa 8.4.1 card summary audit", () => {
  function card(id: string, name: string) {
    return {
      id,
      name,
      closingDay: 10,
      dueDay: 20,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
  }

  it("shows a single paid-invoice summary per card", () => {
    const data = baseData({
      cards: [card("card-paid", "Pago")],
      invoices: [
        {
          id: "inv-paid",
          cardId: "card-paid",
          competenceMonth: "2026-07",
          amountCents: 60_000,
          amountPaidCents: 60_000,
          amountDueCents: 0,
          dueDate: "2026-07-20",
          status: "paid",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = buildDashboardCardSummary(data, "2026-07");
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.cards[0]?.mode).toBe("real");
    expect(summary?.cards[0]?.paidCents).toBe(60_000);
    expect(summary?.cards[0]?.openCents).toBe(0);
  });

  it("shows a single open-invoice summary per card", () => {
    const data = baseData({
      cards: [card("card-open", "Aberto")],
      invoices: [
        {
          id: "inv-open",
          cardId: "card-open",
          competenceMonth: "2026-07",
          amountCents: 80_000,
          amountDueCents: 80_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const summary = buildDashboardCardSummary(data, "2026-07");
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.cards[0]?.openCents).toBe(80_000);
  });

  it("shows projected installments only when no invoice exists", () => {
    const data = baseData({
      cards: [card("card-install", "Parcela")],
      transactions: [
        tx({
          id: "installment-src",
          ledgerStatus: "in_invoice",
          cardId: "card-install",
          amountCents: 30_000,
          competenceMonth: "2026-06",
          date: "2026-06-12",
          installment: { current: 2, total: 4 },
        }),
      ],
    });
    const summary = buildDashboardCardSummary(data, "2026-07");
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.cards[0]?.mode).toBe("projected");
    expect(summary?.cards[0]?.totalCents).toBe(30_000);
  });

  it("shows projected recurring only when no invoice exists", () => {
    const data = baseData({
      cards: [card("card-rec", "Recorrente")],
      recurringRules: [
        rule({
          id: "card-rec",
          billingMode: "card",
          cardId: "card-rec",
          amountCents: 45_000,
        }),
      ],
    });
    const summary = buildDashboardCardSummary(data, "2026-07");
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.cards[0]?.totalCents).toBe(45_000);
  });

  it("sums projected installments and recurring in one card summary", () => {
    const data = baseData({
      cards: [card("card-mix", "Misto")],
      transactions: [
        tx({
          id: "installment-src",
          ledgerStatus: "in_invoice",
          cardId: "card-mix",
          amountCents: 30_000,
          competenceMonth: "2026-06",
          date: "2026-06-12",
          installment: { current: 2, total: 4 },
        }),
      ],
      recurringRules: [
        rule({
          id: "card-rec",
          billingMode: "card",
          cardId: "card-mix",
          amountCents: 15_000,
        }),
      ],
    });
    const summary = buildDashboardCardSummary(data, "2026-07");
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.cards[0]?.totalCents).toBe(45_000);
  });

  it("replaces projected card summary when a real invoice appears later", () => {
    const projectedOnly = baseData({
      cards: [card("card-switch", "Alterna")],
      recurringRules: [
        rule({
          id: "card-rec",
          billingMode: "card",
          cardId: "card-switch",
          amountCents: 25_000,
        }),
      ],
    });
    expect(buildDashboardCardSummary(projectedOnly, "2026-07")?.cards[0]?.mode).toBe("projected");

    const withInvoice: AppData = {
      ...projectedOnly,
      invoices: [
        {
          id: "inv-real",
          cardId: "card-switch",
          competenceMonth: "2026-07",
          amountCents: 90_000,
          amountDueCents: 90_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    };
    const summary = buildDashboardCardSummary(withInvoice, "2026-07");
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.cards[0]?.mode).toBe("real");
    expect(summary?.cards[0]?.totalCents).toBe(90_000);
  });
});

describe("etapa 8.4.1 pause and dashboard audit", () => {
  it("preserves historical matches and avoids retroactive months after resume", () => {
    const data = baseData({
      recurringRules: [
        rule({
          id: "pause-gap",
          startMonth: "2026-01",
          status: "paused",
          pausedFromMonth: "2026-03",
        }),
      ],
      transactions: [tx({ id: "tx-feb", competenceMonth: "2026-02", date: "2026-02-10" })],
      recurringMatches: [
        {
          id: recurringMatchId("pause-gap", "2026-02"),
          ruleId: "pause-gap",
          competenceMonth: "2026-02",
          transactionId: "tx-feb",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    resumeRecurringRule(data, "pause-gap", "2026-06");
    expect(recurringResolutionsForMonth(data, "2026-02")[0]?.state).toBe("matched");
    expect(recurringResolutionsForMonth(data, "2026-04")).toHaveLength(0);
    expect(data.recurringRules?.[0]?.resumedFromMonth).toBe("2026-06");
  });

  it("hides empty dashboard panels and keeps realized separate from projected", () => {
    const emptyHost = document.createElement("div");
    renderDashboard(emptyHost, baseData(), { update() {} }, () => {});
    expect(emptyHost.querySelector(".panel--dashboard-recurring")).toBeNull();
    expect(emptyHost.querySelector(".panel--dashboard-cards")).toBeNull();
    expect(emptyHost.querySelector(".panel--projected-installments")).toBeNull();

    const data = integratedAuditData();
    const ctx = buildDashboardContext(data, "2026-07");
    expect(ctx.summary.balanceRealizedCents).toBe(435_000);
    expect(ctx.summary.balancePlannedCents).toBe(405_000);
    expect(renderProjectionPanel(ctx)).not.toContain("Receitas previstas");
    expect(renderProjectionPanel(ctx)).toContain("Recorrências de receita");
  });

  it("renders dashboard links and compact panels for mobile audit", () => {
    const host = document.createElement("div");
    renderDashboard(host, integratedAuditData(), { update() {} }, () => {});
    expect(host.innerHTML).toContain('href="#/planejamento"');
    expect(host.innerHTML).toContain('href="#/faturas"');
    expect(host.querySelector(".panel--dashboard-recurring")).not.toBeNull();
    expect(host.querySelector(".panel--dashboard-cards")).not.toBeNull();
  });
});
