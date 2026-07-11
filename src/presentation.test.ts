import { describe, expect, it } from "vitest";
import {
  balanceTone,
  buildDashboardContext,
  renderAttentionPanel,
  renderCardPanel,
  renderContextualPanel,
  renderEmptyState,
  renderProjectionPanel,
  renderRhythmPanel,
  renderSituationActions,
  renderSituationPanel,
  transactionTypeLabel,
} from "./presentation";
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

  it("builds dashboard context from existing data without inventing values", () => {
    const ctx = buildDashboardContext(sampleData, "2026-07");
    expect(ctx.summary.balanceRealizedCents).toBe(500_000);
    expect(ctx.projection.projectedCents).toBe(ctx.summary.balancePlannedCents);
    expect(ctx.upcoming.length).toBeGreaterThan(0);
    expect(ctx.hasMovement).toBe(true);
  });

  it("does not flag open invoices within due date as attention", () => {
    const ctx = buildDashboardContext(sampleData, "2026-07");
    expect(ctx.attention.some((item) => item.message.includes("vencida"))).toBe(false);
  });

  it("renders dashboard structure markers", () => {
    const ctx = buildDashboardContext(sampleData, "2026-07");
    expect(renderSituationPanel(ctx)).toContain("panel--situation");
    expect(renderProjectionPanel(ctx)).toContain("projection-breakdown");
    expect(renderContextualPanel(ctx.upcoming, ctx.attention)).toContain("contextual-panel");
  });

  it("renders integrated actions with primary hierarchy", () => {
    const html = renderSituationActions();
    expect(html).toContain("Novo lançamento");
    expect(html).toContain("btn--primary");
    expect(html).toContain("situation-actions__link");
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

  it("shows positive attention state when no issues exist", () => {
    const cleanData: AppData = {
      ...sampleData,
      transactions: [
        {
          ...sampleData.transactions[0]!,
          status: "settled",
        },
      ],
      invoices: [
        {
          ...sampleData.invoices[0]!,
          status: "paid",
        },
      ],
    };
    const cleanCtx = buildDashboardContext(cleanData, "2026-07");
    expect(renderAttentionPanel(cleanCtx.attention)).toContain("contextual-panel__ok");
  });

  it("renders rhythm without invalid income percentage bars", () => {
    const ctx = buildDashboardContext(sampleData, "2026-07");
    const html = renderRhythmPanel(ctx.rhythm);
    expect(html).toContain("Recebido até hoje");
    expect(html).not.toContain("Receitas recebidas");
    expect(html).not.toMatch(/Recebido até hoje[\s\S]*role="progressbar"/);
  });

  it("renders card panel with robust structure and pluralization", () => {
    const html = renderCardPanel({
      card: sampleData.cards[0]!,
      invoiceCount: 1,
      single: true,
      ...(sampleData.invoices[0] ? { invoice: sampleData.invoices[0] } : {}),
    });
    expect(html).toContain("card-panel__summary");
    expect(html).toContain("1 fatura");
    expect(html).not.toContain("fatura(s)");
    expect(html).toContain("vence dia");
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

  it("renders negative realized balance with deficit tone in projection", () => {
    const ctx = buildDashboardContext(sampleData, "2026-07");
    ctx.projection.realizedCents = -5000;
    const html = renderProjectionPanel(ctx);
    expect(html).toContain("projection-breakdown__row--negative");
    expect(html).toContain("money--negative");
    expect(html).not.toContain("-R$&nbsp;0,00");
  });

  it("uses neutral money class for zero due invoice cards", () => {
    const html = renderCardPanel({
      card: sampleData.cards[0]!,
      invoice: {
        ...sampleData.invoices[0]!,
        status: "paid",
        amountDueCents: 0,
        creditBalanceCents: 0,
      },
      invoiceCount: 1,
    });
    expect(html).toContain('class="card-panel__money money"');
    expect(html).not.toContain("money--negative");
  });
});
