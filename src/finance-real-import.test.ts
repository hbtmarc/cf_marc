import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateCompetenceSummary, invoiceStatusLabel } from "./finance";
import { buildImportPlan, applyImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import { emptyAppData } from "./storage";
import type { AppData, Invoice } from "./types";

const REAL_IMPORT_PATHS = [
  "C:/Users/hbmar/Downloads/cfm_import_20260710_2107_corrigido.json",
  process.env.CFM_REAL_IMPORT,
].filter((value): value is string => Boolean(value));

function resolveRealImportPath(): string | null {
  for (const candidate of REAL_IMPORT_PATHS) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadImportedRealData(): AppData | null {
  const path = resolveRealImportPath();
  if (!path) {
    return null;
  }
  const parsed = parseImportJson(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    return null;
  }
  const validated = validateImportDocument(parsed.value, "cfm_import_20260710_2107_corrigido.json");
  if (!validated.ok) {
    return null;
  }
  const data = emptyAppData();
  applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
  return data;
}

describe("finance summary from approved real import", () => {
  const data = loadImportedRealData();

  it.skipIf(!data)("matches June/2026 totals", () => {
    const summary = calculateCompetenceSummary(data!, "2026-06");
    expect(summary.incomeSettledCents).toBe(570328);
    expect(summary.expensePaidCents).toBe(581902);
    expect(summary.expensePendingCents).toBe(0);
    expect(summary.balanceRealizedCents).toBe(-11574);
    expect(summary.balancePlannedCents).toBe(-11574);
  });

  it.skipIf(!data)("matches July/2026 totals", () => {
    const summary = calculateCompetenceSummary(data!, "2026-07");
    expect(summary.incomeSettledCents).toBe(579067);
    expect(summary.expensePaidCents).toBe(568047);
    expect(summary.expensePendingCents).toBe(484624);
    expect(summary.balanceRealizedCents).toBe(11020);
    expect(summary.balancePlannedCents).toBe(-473604);
  });

  it.skipIf(!data)("matches August/2026 totals", () => {
    const summary = calculateCompetenceSummary(data!, "2026-08");
    expect(summary.incomeSettledCents).toBe(0);
    expect(summary.expensePaidCents).toBe(0);
    expect(summary.expensePendingCents).toBe(151159);
    expect(summary.balancePlannedCents).toBe(-151159);
  });
});

describe("partial invoice summary", () => {
  it("uses amountPaidCents and amountDueCents without double counting purchases", () => {
    const data: AppData = {
      ...emptyAppData(),
      cards: [
        {
          id: "card-1",
          name: "Demo",
          closingDay: 10,
          dueDay: 20,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      invoices: [
        {
          id: "inv-partial",
          cardId: "card-1",
          competenceMonth: "2026-05",
          amountCents: 100000,
          invoiceTotalCents: 100000,
          amountPaidCents: 40000,
          amountDueCents: 60000,
          dueDate: "2026-05-20",
          status: "partial",
          importStatus: "partial",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      transactions: [
        {
          id: "tx-in-invoice",
          kind: "expense",
          description: "Compra na fatura",
          amountCents: 100000,
          date: "2026-05-10",
          competenceMonth: "2026-05",
          category: "Compras",
          status: "settled",
          ledgerStatus: "in_invoice",
          expenseKind: "expense",
          cardId: "card-1",
          invoiceId: "inv-partial",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    };

    const summary = calculateCompetenceSummary(data, "2026-05");
    expect(summary.expensePaidCents).toBe(40000);
    expect(summary.expensePendingCents).toBe(60000);
    expect(summary.expensePlannedCents).toBe(100000);
    expect(invoiceStatusLabel(data.invoices[0] as Invoice)).toBe("Parcial");
  });
});
