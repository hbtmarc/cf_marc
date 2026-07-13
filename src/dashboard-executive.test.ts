import { describe, expect, it, vi } from "vitest";
import {
  buildDashboardCardSummary,
  buildDashboardFixedBills,
  invoiceDashboardSortGroup,
  sortDashboardInvoiceLines,
  type DashboardInvoiceLine,
} from "./dashboard-executive";
import { calculateCompetenceSummary } from "./finance";
import {
  renderDashboardFixedBillsPanel,
  renderDashboardInvoicesPanel,
  renderDashboardSituationPanel,
} from "./presentation";
import { renderDashboard } from "./pages/dashboard";
import * as router from "./router";
import { pauseRecurringRule } from "./recurring-operations";
import { recurringMatchId } from "./recurrence-reconciliation";
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

describe("dashboard executivo", () => {
  it("renders four KPIs from calculateCompetenceSummary fields only", () => {
    const data = baseData({
      transactions: [
        tx({ id: "tx-income", kind: "income", amountCents: 500_000, status: "settled" }),
        tx({ id: "tx-expense", amountCents: 150_000, status: "settled" }),
      ],
    });
    const summary = calculateCompetenceSummary(data, "2026-07");
    const html = renderDashboardSituationPanel(summary);

    expect(html).toContain("Situação financeira");
    expect(html).toContain("Receitas");
    expect(html).toContain("Despesas");
    expect(html).toContain("Saldo projetado");
    expect(html).toContain("dashboard-kpi-grid");
    expect(html).toContain(formatCents(summary.incomeSettledCents));
    expect(html).toContain(formatCents(summary.expensePaidCents));
    expect(html).toContain(formatCents(summary.balanceRealizedCents));
    expect(html).toContain(formatCents(summary.balancePlannedCents));
    expect(html).not.toContain("Saldo positivo, porém comprometido");
    expect(html).not.toContain("metric-dominant");
  });

  it("does not recalculate metrics in presentation", () => {
    const summary = calculateCompetenceSummary(baseData(), "2026-07");
    const html = renderDashboardSituationPanel(summary);
    expect(html.match(/dashboard-kpi__value/g)?.length).toBe(4);
    expect(html).not.toContain("incomePendingCents");
    expect(html).not.toContain("recurringExpenseProjectedCents");
  });

  it("includes projected fixed bill once in subtotal", () => {
    const data = baseData({
      recurringRules: [rule({ id: "rule-fixed", recurrenceClass: "fixed_bill" })],
    });
    const fixed = buildDashboardFixedBills(data, "2026-07");
    expect(fixed.lines).toHaveLength(1);
    expect(fixed.lines[0]?.statusLabel).toBe("PREVISTA");
    expect(fixed.subtotalCents).toBe(12_990);
  });

  it("replaces projected fixed bill with matched transaction value", () => {
    const data = baseData({
      recurringRules: [rule({ id: "rule-fixed", recurrenceClass: "fixed_bill", amountCents: 12_990 })],
      transactions: [tx({ id: "tx-fixed", amountCents: 11_500 })],
      recurringMatches: [
        {
          id: recurringMatchId("rule-fixed", "2026-07"),
          ruleId: "rule-fixed",
          competenceMonth: "2026-07",
          transactionId: "tx-fixed",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const fixed = buildDashboardFixedBills(data, "2026-07");
    expect(fixed.lines).toHaveLength(1);
    expect(fixed.lines[0]?.amountCents).toBe(11_500);
    expect(fixed.lines[0]?.statusLabel).toBe("PAGA");
    expect(fixed.subtotalCents).toBe(11_500);
  });

  it("excludes recurring income from fixed bills", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "rule-income", kind: "income", recurrenceClass: "income", description: "Salário" }),
      ],
    });
    expect(buildDashboardFixedBills(data, "2026-07").lines).toHaveLength(0);
  });

  it("excludes card subscription from fixed bills", () => {
    const data = baseData({
      recurringRules: [
        rule({
          id: "rule-sub",
          recurrenceClass: "card_subscription",
          billingMode: "card",
          cardId: "card-1",
        }),
      ],
    });
    expect(buildDashboardFixedBills(data, "2026-07").lines).toHaveLength(0);
  });

  it("excludes paused or out-of-period fixed bills", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "rule-paused", recurrenceClass: "fixed_bill", status: "paused" }),
        rule({ id: "rule-future", recurrenceClass: "fixed_bill", startMonth: "2026-09" }),
      ],
    });
    pauseRecurringRule(data, "rule-paused", "2026-07");
    expect(buildDashboardFixedBills(data, "2026-07").lines).toHaveLength(0);
  });

  it("avoids double counting in fixed bills subtotal", () => {
    const data = baseData({
      recurringRules: [
        rule({ id: "rule-a", recurrenceClass: "fixed_bill", amountCents: 10_000 }),
        rule({ id: "rule-b", recurrenceClass: "fixed_bill", amountCents: 20_000, dayOfMonth: 15 }),
      ],
    });
    const fixed = buildDashboardFixedBills(data, "2026-07");
    expect(fixed.subtotalCents).toBe(30_000);
    expect(fixed.subtotalCents).toBe(
      fixed.lines.reduce((sum, line) => sum + line.amountCents, 0),
    );
  });

  it("orders invoices overdue before open before projected before paid", () => {
    const today = "2026-07-12";
    const lines: DashboardInvoiceLine[] = [
      line("paid", "Paga", "2026-07-01", 0, "real"),
      line("projected", "PROJETADA", "2026-07-25", 10_000, "projected"),
      line("open", "Aberta", "2026-07-20", 50_000, "real"),
      line("overdue", "Aberta", "2026-07-05", 30_000, "real"),
    ];
    const sorted = sortDashboardInvoiceLines(lines, today).map((item) => item.cardId);
    expect(sorted).toEqual(["overdue", "open", "projected", "paid"]);
  });

  it("orders invoices by due date within the same group", () => {
    const today = "2026-07-12";
    const lines: DashboardInvoiceLine[] = [
      line("open-b", "Aberta", "2026-07-25", 20_000, "real"),
      line("open-a", "Aberta", "2026-07-18", 10_000, "real"),
    ];
    const sorted = sortDashboardInvoiceLines(lines, today).map((item) => item.cardId);
    expect(sorted).toEqual(["open-a", "open-b"]);
  });

  it("prefers real invoice over projection for the same card", () => {
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
    const summary = buildDashboardCardSummary(data, "2026-07");
    expect(summary?.lines).toHaveLength(1);
    expect(summary?.lines[0]?.mode).toBe("real");
    expect(summary?.lines[0]?.totalCents).toBe(90_000);
    expect(summary?.lines[0]?.invoiceId).toBe("inv-real");
  });

  it("renders individual view-invoice action with invoice id", () => {
    const data = baseData({
      invoices: [
        {
          id: "inv-1",
          cardId: "card-1",
          competenceMonth: "2026-07",
          amountCents: 40_000,
          dueDate: "2026-07-20",
          status: "open",
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
      ],
    });
    const html = renderDashboardInvoicesPanel(buildDashboardCardSummary(data, "2026-07"));
    expect(html).toContain('data-action="view-invoice"');
    expect(html).toContain('data-invoice-id="inv-1"');
    expect(html).toContain("Ver fatura");
  });

  it("renders empty states for fixed bills and invoices", () => {
    expect(renderDashboardFixedBillsPanel(buildDashboardFixedBills(baseData(), "2026-07"))).toContain(
      "Nenhuma despesa fixa nesta competência.",
    );
    expect(renderDashboardInvoicesPanel(buildDashboardCardSummary(baseData(), "2026-07"))).toContain(
      "Nenhuma fatura ou projeção de cartão nesta competência.",
    );
  });

  it("renders executive layout without legacy blocks or side column", () => {
    const host = document.createElement("div");
    renderDashboard(host, baseData(), { update: () => {} }, () => {});

    expect(host.querySelector(".dashboard-page")).not.toBeNull();
    expect(host.querySelector(".dashboard-situation")).not.toBeNull();
    expect(host.querySelector(".dashboard-fixed-bills")).not.toBeNull();
    expect(host.querySelector(".dashboard-invoices")).not.toBeNull();
    expect(host.querySelector(".dashboard-grid")).toBeNull();
    expect(host.querySelector(".dashboard-grid__side")).toBeNull();
    expect(host.querySelector(".dashboard-recent")).toBeNull();
    expect(host.innerHTML).not.toContain("Ritmo do mês");
    expect(host.innerHTML).not.toContain("Recorrências do mês");
    expect(host.innerHTML).not.toContain("Novo lançamento");
    expect(host.innerHTML).not.toContain("Revisar faturas");
    expect(host.innerHTML).not.toContain("Ver lançamentos");
  });

  it("uses responsive KPI and list structure for mobile layout", () => {
    const html = renderDashboardSituationPanel(calculateCompetenceSummary(baseData(), "2026-07"));
    expect(html).toContain("dashboard-kpi-grid");
    expect(html).toContain("dashboard-kpi");
    expect(renderDashboardFixedBillsPanel(buildDashboardFixedBills(baseData(), "2026-07"))).toContain(
      "dashboard-list",
    );
  });

  it("navigates to faturas when view-invoice is clicked", () => {
    const host = document.createElement("div");
    const data = baseData({
      invoices: [
        {
          id: "inv-nav",
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
    const navigateSpy = vi.spyOn(router, "navigate");

    renderDashboard(host, data, { update: () => {} }, () => {});
    host.querySelector<HTMLButtonElement>('[data-invoice-id="inv-nav"]')?.click();

    expect(navigateSpy).toHaveBeenCalledWith("/faturas");
    navigateSpy.mockRestore();
  });
});

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function line(
  cardId: string,
  statusLabel: string,
  dueDateIso: string,
  openCents: number,
  mode: "real" | "projected",
): DashboardInvoiceLine {
  return {
    cardId,
    cardName: cardId,
    invoiceLabel: mode === "projected" ? "Fatura projetada" : "Fatura Jul/2026",
    competenceMonth: "2026-07",
    mode,
    statusLabel,
    totalCents: openCents,
    paidCents: 0,
    openCents,
    dueDate: dueDateIso,
    dueDateIso,
    sortGroup: invoiceDashboardSortGroup(
      { mode, statusLabel, openCents, dueDateIso },
      "2026-07-12",
    ),
  };
}
