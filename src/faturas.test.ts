import { afterEach, describe, expect, it } from "vitest";
import {
  invoiceNeedsFinancialAction,
  invoiceOpenCents,
  invoicePaidCents,
  invoiceTotalCentsValue,
  transactionsForInvoice,
} from "./finance";
import {
  getExpandedInvoiceId,
  renderFaturas,
  resetFaturasUiState,
} from "./pages/faturas";
import {
  renderCardPanel,
  renderInvoiceDetailPanel,
  renderInvoiceTableRow,
  renderNominalMoney,
} from "./presentation";
import { renderNav } from "./ui";
import type { AppData, Invoice, Transaction } from "./types";
import type { AppMutations } from "./forms";

const mutations: AppMutations = { update: () => {} };

function baseInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: "inv-base",
    cardId: "card-nubank",
    competenceMonth: "2026-07",
    amountCents: 0,
    dueDate: "2026-07-10",
    status: "open",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

const nubankPaid = baseInvoice({
  id: "inv-nubank-jul",
  status: "paid",
  invoiceTotalCents: 160_125,
  amountPaidCents: 160_125,
  amountDueCents: 0,
  creditBalanceCents: 0,
});

const portoOpen = baseInvoice({
  id: "inv-porto-jul",
  cardId: "card-porto",
  status: "open",
  invoiceTotalCents: 484_624,
  amountPaidCents: 0,
  amountDueCents: 484_624,
  dueDate: "2026-07-15",
});

const mercadoCreditor = baseInvoice({
  id: "inv-mp-jun",
  cardId: "card-mp",
  competenceMonth: "2026-06",
  status: "paid",
  invoiceTotalCents: 5_517,
  amountPaidCents: 6_000,
  amountDueCents: 0,
  creditBalanceCents: 483,
  dueDate: "2026-06-20",
});

const sampleTransactions: Transaction[] = [
  {
    id: "tx-purchase",
    kind: "expense",
    description: "Compra Safe2Pay",
    amountCents: 12_000,
    date: "2026-06-28",
    competenceMonth: "2026-06",
    category: "Serviços",
    status: "settled",
    expenseKind: "expense",
    ledgerStatus: "in_invoice",
    invoiceId: "inv-mp-jun",
    cardId: "card-mp",
    createdAt: "2026-06-28T12:00:00.000Z",
    updatedAt: "2026-06-28T12:00:00.000Z",
  },
  {
    id: "tx-fee",
    kind: "expense",
    description: "IOF",
    amountCents: 300,
    date: "2026-06-28",
    competenceMonth: "2026-06",
    category: "Tarifas",
    status: "settled",
    expenseKind: "fee",
    ledgerStatus: "in_invoice",
    invoiceId: "inv-mp-jun",
    cardId: "card-mp",
    createdAt: "2026-06-28T12:00:00.000Z",
    updatedAt: "2026-06-28T12:00:00.000Z",
  },
  {
    id: "tx-refund",
    kind: "expense",
    description: "Estorno loja",
    amountCents: 2_000,
    date: "2026-06-29",
    competenceMonth: "2026-06",
    category: "Compras",
    status: "settled",
    expenseKind: "refund",
    ledgerStatus: "in_invoice",
    invoiceId: "inv-mp-jun",
    cardId: "card-mp",
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:00:00.000Z",
  },
  {
    id: "tx-installment",
    kind: "expense",
    description: "Parcela TV",
    amountCents: 8_000,
    date: "2026-06-15",
    competenceMonth: "2026-06",
    category: "Compras",
    status: "settled",
    expenseKind: "expense",
    ledgerStatus: "in_invoice",
    invoiceId: "inv-mp-jun",
    cardId: "card-mp",
    installment: { current: 2, total: 6 },
    createdAt: "2026-06-15T12:00:00.000Z",
    updatedAt: "2026-06-15T12:00:00.000Z",
  },
  {
    id: "tx-other-invoice",
    kind: "expense",
    description: "Outra fatura",
    amountCents: 1_000,
    date: "2026-07-01",
    competenceMonth: "2026-07",
    category: "Compras",
    status: "settled",
    expenseKind: "expense",
    ledgerStatus: "in_invoice",
    invoiceId: "inv-nubank-jul",
    cardId: "card-nubank",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "tx-invoice-payment",
    kind: "expense",
    description: "Pagamento fatura",
    amountCents: 160_125,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Cartão",
    status: "settled",
    createdAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
  },
];

function sampleData(): AppData {
  return {
    schemaVersion: "cfm.local.v2",
    selectedCompetenceMonth: "2026-07",
    transactions: sampleTransactions,
    cards: [
      {
        id: "card-nubank",
        name: "Nubank",
        closingDay: 25,
        dueDay: 3,
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
      {
        id: "card-porto",
        name: "Porto Seguro",
        closingDay: 10,
        dueDay: 15,
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
      {
        id: "card-mp",
        name: "Mercado Pago",
        closingDay: 5,
        dueDay: 12,
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
    ],
    invoices: [nubankPaid, portoOpen, mercadoCreditor],
  };
}

describe("invoice history presentation", () => {
  it("shows paid invoice total and zero open amount on cards", () => {
    const html = renderCardPanel({
      card: sampleData().cards[0]!,
      invoice: nubankPaid,
      invoiceCount: 1,
    });
    expect(html).toContain("Total da fatura");
    expect(html).toContain("1.601,25");
    expect(html).toContain("Pago");
    expect(html).toContain("Em aberto");
    expect(html).toContain("0,00");
    expect(html).toContain("Paga");
    expect(html).not.toContain("-R$");
  });

  it("shows open invoice total and due amount", () => {
    const html = renderCardPanel({
      card: sampleData().cards[1]!,
      invoice: portoOpen,
      invoiceCount: 1,
    });
    expect(html).toContain("4.846,24");
    expect(html).toContain("money--negative");
    expect(html).toContain("Aberta");
  });

  it("shows creditor invoice total, payment and credit", () => {
    const html = renderCardPanel({
      card: sampleData().cards[2]!,
      invoice: mercadoCreditor,
      invoiceCount: 1,
    });
    expect(html).toContain("Total líquido");
    expect(html).toContain("55,17");
    expect(html).toContain("60,00");
    expect(html).toContain("Saldo credor");
    expect(html).toContain("4,83");
    expect(html).toContain("Credora");
  });

  it("never renders negative zero money", () => {
    expect(renderNominalMoney(0)).not.toContain("-R$");
    expect(renderNominalMoney(-0)).not.toContain("-R$");
  });
});

describe("invoice detail and lines", () => {
  it("filters transactions exclusively by invoiceId", () => {
    const lines = transactionsForInvoice(sampleTransactions, "inv-mp-jun");
    expect(lines).toHaveLength(4);
    expect(lines.every((item) => item.invoiceId === "inv-mp-jun")).toBe(true);
    expect(lines.some((item) => item.description === "Pagamento fatura")).toBe(false);
  });

  it("labels fee and refund and installment in detail rows", () => {
    const html = renderInvoiceDetailPanel({
      invoice: mercadoCreditor,
      cardName: "Mercado Pago",
      transactions: transactionsForInvoice(sampleTransactions, "inv-mp-jun"),
      panelId: "invoice-detail-inv-mp-jun",
    });
    expect(html).toContain("Tarifa");
    expect(html).toContain("Estorno");
    expect(html).toContain("2/6");
    expect(html).toContain("money--positive");
    expect(html).toContain("55,17");
  });

  it("renders table row with total and open columns", () => {
    const html = renderInvoiceTableRow({
      invoice: portoOpen,
      cardName: "Porto Seguro",
      expanded: false,
      detailPanelId: "invoice-detail-inv-porto-jul",
    });
    expect(html).toContain("Ver fatura");
    expect(html).toContain('aria-controls="invoice-detail-inv-porto-jul"');
    expect(html).toContain("4.846,24");
  });
});

describe("faturas page detail toggle", () => {
  afterEach(() => {
    resetFaturasUiState();
  });

  it("expands and collapses invoice detail panel", () => {
    const host = document.createElement("div");
    const data = sampleData();
    const rerender = (): void => {
      renderFaturas(host, data, mutations, rerender);
    };

    rerender();
    expect(host.querySelector(".invoice-detail")).toBeNull();

    host.querySelector<HTMLButtonElement>('[data-invoice-view="inv-porto-jul"]')?.click();
    expect(getExpandedInvoiceId()).toBe("inv-porto-jul");
    rerender();
    expect(host.querySelector(".invoice-detail")).not.toBeNull();
    expect(host.querySelector(".invoice-detail")?.textContent).toContain("Porto Seguro");

    host.querySelector<HTMLButtonElement>('[data-invoice-view="inv-porto-jul"]')?.click();
    rerender();
    expect(getExpandedInvoiceId()).toBeNull();
    expect(host.querySelector(".invoice-detail")).toBeNull();
  });

  it("switches detail content when another invoice is selected", () => {
    const host = document.createElement("div");
    const data = sampleData();
    const rerender = (): void => {
      renderFaturas(host, data, mutations, rerender);
    };

    rerender();
    host.querySelector<HTMLButtonElement>('[data-invoice-view="inv-porto-jul"]')?.click();
    rerender();
    expect(host.querySelector(".invoice-detail")?.textContent).toContain("Porto Seguro");

    host.querySelector<HTMLButtonElement>('[data-invoice-view="inv-nubank-jul"]')?.click();
    rerender();
    expect(getExpandedInvoiceId()).toBe("inv-nubank-jul");
    expect(host.querySelector(".invoice-detail")?.textContent).toContain("Nubank");
  });
});

describe("navigation badge", () => {
  it("counts only open, partial and overdue invoices needing action", () => {
    const data = sampleData();
    const html = renderNav("/faturas", data);
    expect(html).toContain("nav-link__badge");
    expect(invoiceNeedsFinancialAction(portoOpen)).toBe(true);
    expect(invoiceNeedsFinancialAction(nubankPaid)).toBe(false);
    expect(invoiceNeedsFinancialAction(mercadoCreditor)).toBe(false);
  });
});

describe("invoice value helpers", () => {
  it("reads official invoice totals", () => {
    expect(invoiceTotalCentsValue(nubankPaid)).toBe(160_125);
    expect(invoicePaidCents(nubankPaid)).toBe(160_125);
    expect(invoiceOpenCents(nubankPaid)).toBe(0);
  });
});
