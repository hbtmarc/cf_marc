import { describe, expect, it } from "vitest";
import {
  balanceTone,
  renderCardPanel,
  renderDashboardSituationPanel,
  renderEmptyState,
  transactionTypeLabel,
} from "./presentation";
import { calculateCompetenceSummary } from "./finance";
import type { AppData } from "./types";

const sampleData: AppData = {
  schemaVersion: "cfm.local.v2",
  selectedCompetenceMonth: "2026-07",
  transactions: [
    {
      id: "tx-1",
      kind: "income",
      description: "Salário",
      amountCents: 500_000,
      date: "2026-07-05",
      competenceMonth: "2026-07",
      category: "Trabalho",
      status: "settled",
      createdAt: "2026-07-05T12:00:00.000Z",
      updatedAt: "2026-07-05T12:00:00.000Z",
    },
    {
      id: "tx-2",
      kind: "expense",
      description: "Aluguel",
      amountCents: 150_000,
      date: "2026-07-10",
      competenceMonth: "2026-07",
      category: "Moradia",
      status: "pending",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    },
  ],
  cards: [
    {
      id: "card-1",
      name: "Nubank",
      closingDay: 25,
      dueDay: 3,
      createdAt: "2026-07-01T12:00:00.000Z",
      updatedAt: "2026-07-01T12:00:00.000Z",
    },
  ],
  invoices: [
    {
      id: "inv-1",
      cardId: "card-1",
      competenceMonth: "2026-07",
      amountCents: 80_000,
      dueDate: "2026-08-03",
      status: "open",
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:00:00.000Z",
    },
  ],
};

describe("presentation", () => {
  it("classifies balance tone semantically", () => {
    expect(balanceTone(100)).toBe("positive");
    expect(balanceTone(-1)).toBe("negative");
    expect(balanceTone(0)).toBe("neutral");
  });

  it("renders dashboard situation panel from summary fields", () => {
    const summary = calculateCompetenceSummary(sampleData, "2026-07");
    const html = renderDashboardSituationPanel(summary);
    expect(html).toContain("dashboard-situation");
    expect(html).toContain("dashboard-kpi-grid");
    expect(html).not.toContain("panel--situation");
  });

  it("renders contextual empty states with optional CTA", () => {
    const html = renderEmptyState({
      title: "Sem dados",
      description: "Orientação.",
      ctaLabel: "Novo lançamento",
      ctaAction: "new-transaction",
    });
    expect(html).toContain("empty-state");
    expect(html).toContain('data-action="new-transaction"');
  });

  it("renders card panel with robust structure and pluralization", () => {
    const html = renderCardPanel({
      card: sampleData.cards[0]!,
      invoiceCount: 1,
      single: true,
      ...(sampleData.invoices[0] ? { invoice: sampleData.invoices[0] } : {}),
    });
    expect(html).toContain("card-panel__hero");
    expect(html).toContain("card-panel__chip");
    expect(html).toContain("card-panel__surface");
    expect(html).not.toContain("fatura(s)");
    expect(html).not.toContain("card-panel__count");
    expect(html).toContain("Vence dia");
  });

  it("labels ledger types for display", () => {
    expect(transactionTypeLabel(sampleData.transactions[0]!)).toBe("Receita");
    expect(
      transactionTypeLabel({
        ...sampleData.transactions[1]!,
        expenseKind: "fee",
      }),
    ).toBe("Tarifa");
    expect(
      transactionTypeLabel({
        ...sampleData.transactions[1]!,
        expenseKind: "refund",
      }),
    ).toBe("Estorno");
    expect(transactionTypeLabel(sampleData.transactions[1]!)).toBe("Despesa");
  });

  it("uses neutral money class for zero open invoice cards", () => {
    const html = renderCardPanel({
      card: sampleData.cards[0]!,
      invoice: {
        ...sampleData.invoices[0]!,
        status: "paid",
        invoiceTotalCents: 80_000,
        amountPaidCents: 80_000,
        amountDueCents: 0,
        creditBalanceCents: 0,
      },
      invoiceCount: 1,
    });
    expect(html).toContain(">Paga<");
    expect(html).toContain('class="card-panel__hero-value money money--neutral"');
    expect(html).not.toContain("money--negative");
    expect(html).not.toContain("-R$");
  });
});
