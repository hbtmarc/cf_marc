import { describe, expect, it } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import { isProjectedInvoice } from "./finance";
import {
  projectedInvoiceStableId,
  projectedInstallmentsForProjectedInvoice,
  syncProjectedInvoices,
} from "./projected-invoices";
import { emptyAppData } from "./storage";
import type { AppData, Transaction } from "./types";
import projectionFixture from "./fixtures/cfm-import-v1-projections.json";

function tx(partial: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    kind: "expense",
    description: "Compra parcelada",
    amountCents: 10_000,
    date: "2026-07-10",
    competenceMonth: "2026-07",
    category: "Compras",
    status: "settled",
    ledgerStatus: "in_invoice",
    cardId: "card-nubank",
    installment: { current: 1, total: 12 },
    sourceImportId: "exp-1",
    createdAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
    ...partial,
  };
}

describe("projected invoice sync", () => {
  it("creates projected invoices through the final installment month", () => {
    const data: AppData = {
      ...emptyAppData(),
      selectedCompetenceMonth: "2026-07",
      cards: [
        {
          id: "card-nubank",
          name: "Nubank",
          closingDay: 3,
          dueDay: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      invoices: [
        {
          id: "inv-jul",
          cardId: "card-nubank",
          competenceMonth: "2026-07",
          amountCents: 10_000,
          invoiceTotalCents: 10_000,
          amountPaidCents: 0,
          amountDueCents: 10_000,
          dueDate: "2026-07-10",
          status: "open",
          sourceImportId: "inv-jul-import",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      transactions: [tx({ id: "src-1-12" })],
    };

    syncProjectedInvoices(data);

    const projected = data.invoices.filter(isProjectedInvoice);
    expect(projected).toHaveLength(11);
    expect(projected.map((item) => item.competenceMonth)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
    ]);
    expect(projected.at(-1)?.competenceMonth).toBe("2027-06");
    expect(projected.at(-1)?.id).toBe(
      projectedInvoiceStableId("card-nubank", "2027-06"),
    );
  });

  it("removes projected invoice when real invoice exists for the month", () => {
    const data: AppData = {
      ...emptyAppData(),
      selectedCompetenceMonth: "2026-07",
      cards: [
        {
          id: "card-nubank",
          name: "Nubank",
          closingDay: 3,
          dueDay: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      invoices: [
        {
          id: "inv-jul",
          cardId: "card-nubank",
          competenceMonth: "2026-07",
          amountCents: 10_000,
          dueDate: "2026-07-10",
          status: "open",
          sourceImportId: "inv-jul",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          id: projectedInvoiceStableId("card-nubank", "2026-08"),
          cardId: "card-nubank",
          competenceMonth: "2026-08",
          amountCents: 10_000,
          dueDate: "2026-08-10",
          status: "open",
          isProjected: true,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "inv-aug-real",
          cardId: "card-nubank",
          competenceMonth: "2026-08",
          amountCents: 12_000,
          dueDate: "2026-08-10",
          status: "open",
          sourceImportId: "inv-aug",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      transactions: [tx({ id: "src-1-12" })],
    };

    syncProjectedInvoices(data);

    expect(
      data.invoices.some(
        (item) => item.competenceMonth === "2026-08" && isProjectedInvoice(item),
      ),
    ).toBe(false);
    expect(data.invoices.some((item) => item.id === "inv-aug-real")).toBe(true);
  });

  it("lists projected installment lines for a projected invoice", () => {
    const data: AppData = {
      ...emptyAppData(),
      selectedCompetenceMonth: "2026-09",
      cards: [
        {
          id: "card-nubank",
          name: "Nubank",
          closingDay: 3,
          dueDay: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      transactions: [tx({ id: "src-1-12" })],
      invoices: [],
    };

    syncProjectedInvoices(data);
    const september = data.invoices.find(
      (item) => item.competenceMonth === "2026-09" && isProjectedInvoice(item),
    );
    expect(september).toBeDefined();

    const lines = projectedInstallmentsForProjectedInvoice(data, september!);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.installment).toEqual({ current: 3, total: 12 });
  });
});

describe("projected invoices after import", () => {
  it("syncs projected invoices when import plan is applied", () => {
    const parsed = parseImportJson(JSON.stringify(projectionFixture));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const validated = validateImportDocument(parsed.value);
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }

    const data = emptyAppData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);

    const projected = data.invoices.filter(isProjectedInvoice);
    expect(projected.length).toBeGreaterThan(0);
    expect(projected.some((item) => item.competenceMonth === "2026-09")).toBe(true);
  });
});
