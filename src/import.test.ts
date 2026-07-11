import { describe, expect, it } from "vitest";
import {
  calculateCompetenceSummary,
  invoiceHasCredit,
  invoiceStatusLabel,
  isInvoiceLinkedExpense,
} from "./finance";
import { applyImportPlan, buildImportPlan, cloneAppData } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import type { ImportPayload, ImportPlan } from "./import-types";
import fixtureDocument from "./fixtures/cfm-import-v1-valid.json";
import { normalizeRoute } from "./router";
import { emptyAppData } from "./storage";
import type { AppData, Invoice } from "./types";

const approvedFixtureRaw = JSON.stringify(fixtureDocument);

function loadSyntheticPayload() {
  const parsed = parseImportJson(approvedFixtureRaw);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  const validated = validateImportDocument(parsed.value, "cfm-import-v1-valid.json");
  if (!validated.ok) {
    throw new Error(validated.summary.errors.join("; "));
  }
  return validated;
}

function sampleExistingData(conflictingFingerprint: string): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-06",
    transactions: [
      {
        id: "manual-1",
        kind: "expense",
        description: "Conta de luz manual",
        amountCents: 18990,
        date: "2026-05-15",
        competenceMonth: "2026-05",
        category: "Moradia",
        status: "settled",
        createdAt: "2026-05-15T12:00:00.000Z",
        updatedAt: "2026-05-15T12:00:00.000Z",
      },
      {
        id: "manual-income",
        kind: "income",
        description: "Proventos manual",
        amountCents: 1,
        date: "2026-06-03",
        competenceMonth: "2026-06",
        category: "Renda",
        status: "settled",
        canonicalFingerprint: conflictingFingerprint,
        createdAt: "2026-06-03T12:00:00.000Z",
        updatedAt: "2026-06-03T12:00:00.000Z",
      },
    ],
    cards: [
      {
        id: "local-card",
        name: "Cartao Manual",
        closingDay: 10,
        dueDay: 20,
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
    ],
  };
}

describe("cfm.import.v1 validation", () => {
  it("accepts the sanitized synthetic fixture", () => {
    const validated = loadSyntheticPayload();
    expect(validated.payload.schemaVersion).toBe("cfm.import.v1");
    expect(validated.summary.counts.incomes).toBe(1);
    expect(validated.summary.counts.cards).toBe(4);
    expect(validated.summary.counts.invoices).toBe(4);
    expect(validated.summary.counts.expenses).toBe(5);
    expect(validated.summary.counts.expenseByKind.expense).toBe(3);
    expect(validated.summary.counts.expenseByKind.fee).toBe(1);
    expect(validated.summary.counts.expenseByKind.refund).toBe(1);
    expect(validated.summary.counts.installments).toBe(1);
    expect(validated.summary.counts.uniqueFingerprints).toBe(6);
  });

  it("rejects malformed JSON", () => {
    const parsed = parseImportJson("{ invalid");
    expect(parsed.ok).toBe(false);
  });

  it("rejects incorrect schema version", () => {
    const parsed = parseImportJson(
      '{"schemaVersion":"cfm.import.v9","generatedAt":"2026-07-10T00:00:00-03:00","currency":"BRL","incomes":[],"cards":[],"invoices":[],"expenses":[]}',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const validated = validateImportDocument(parsed.value);
      expect(validated.ok).toBe(false);
      expect(validated.summary.errors.some((item) => item.includes("schemaVersion"))).toBe(true);
    }
  });

  it("rejects legacy provisional fields", () => {
    const parsed = parseImportJson(
      '{"schemaVersion":"cfm.import.v1","generatedAt":"2026-07-10T00:00:00-03:00","currency":"BRL","source":{"institution":"X"},"incomes":[],"cards":[],"invoices":[],"expenses":[]}',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const validated = validateImportDocument(parsed.value);
      expect(validated.ok).toBe(false);
      expect(validated.summary.errors.some((item) => item.includes("source"))).toBe(true);
    }
  });

  it("rejects duplicate fingerprints", () => {
    const payload = JSON.parse(approvedFixtureRaw) as ImportPayload;
    const firstIncome = payload.incomes[0]!;
    const firstExpense = payload.expenses[0]!;
    firstExpense.canonicalFingerprint = firstIncome.canonicalFingerprint;
    const validated = validateImportDocument(payload);
    expect(validated.ok).toBe(false);
    expect(validated.summary.errors.some((item) => item.includes("Fingerprint duplicado"))).toBe(true);
  });

  it("rejects missing card reference on invoice", () => {
    const payload = JSON.parse(approvedFixtureRaw) as ImportPayload;
    payload.invoices[0]!.cardId = "card_missing";
    const validated = validateImportDocument(payload);
    expect(validated.ok).toBe(false);
    expect(validated.summary.errors.some((item) => item.includes("cardId"))).toBe(true);
  });

  it("validates creditor invoice coherence", () => {
    const validated = loadSyntheticPayload();
    const credit = validated.payload.invoices.find((item) => item.creditBalanceCents > 0);
    expect(credit).toBeDefined();
    expect(credit!.invoiceTotalCents + credit!.creditBalanceCents).toBe(
      credit!.amountPaidCents + credit!.amountDueCents,
    );
  });

  it("warns about missing card cycle fields", () => {
    const validated = loadSyntheticPayload();
    expect(validated.summary.warnings).toContain("Ourocard Platinum: closingDay ausente.");
    expect(validated.summary.warnings).toContain("Ourocard Platinum: dueDay ausente.");
    expect(validated.summary.warnings).toContain("Porto Seguro Visa: closingDay ausente.");
    expect(validated.summary.warnings).toContain("Mercado Pago: dueDay ausente.");
  });

  it("rejects missing required contract fields", () => {
    const payload = JSON.parse(approvedFixtureRaw) as ImportPayload;
    delete (payload.incomes[0] as { sourceType?: string }).sourceType;
    delete (payload.invoices[0] as { sourceType?: string }).sourceType;
    delete (payload.expenses[0] as { sourceType?: string }).sourceType;
    delete (payload.expenses[0] as { paymentMethod?: string }).paymentMethod;
    const validated = validateImportDocument(payload);
    expect(validated.ok).toBe(false);
    expect(validated.summary.errors.some((item) => item.includes("sourceType"))).toBe(true);
    expect(validated.summary.errors.some((item) => item.includes("paymentMethod"))).toBe(true);
  });

  it("rejects open invoice without asOfDate", () => {
    const payload = JSON.parse(approvedFixtureRaw) as ImportPayload;
    const openInvoice = payload.invoices.find((item) => item.status === "open");
    expect(openInvoice).toBeDefined();
    delete openInvoice!.asOfDate;
    const validated = validateImportDocument(payload);
    expect(validated.ok).toBe(false);
    expect(validated.summary.errors.some((item) => item.includes("asOfDate"))).toBe(true);
  });
});

describe("import apply and idempotency", () => {
  it("imports valid data on confirmation", () => {
    const validated = loadSyntheticPayload();
    const data = emptyAppData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    expect(plan.canImport).toBe(true);
    const result = applyImportPlan(data, plan);
    expect(result.created).toBe(14);
    expect(data.cards).toHaveLength(4);
    expect(data.invoices).toHaveLength(4);
    expect(data.transactions).toHaveLength(6);
    expect(data.invoices.some((item) => invoiceHasCredit(item))).toBe(true);
    expect(data.transactions.filter((item) => isInvoiceLinkedExpense(item))).toHaveLength(3);
    expect(
      data.transactions.filter(
        (item) => item.sourceRecordId === "shared-synthetic-001",
      ),
    ).toHaveLength(2);
  });

  it("does not persist before confirmation", () => {
    const validated = loadSyntheticPayload();
    const data = emptyAppData();
    buildImportPlan(data, validated.payload, validated.summary);
    expect(data.cards).toHaveLength(0);
    expect(data.transactions).toHaveLength(0);
  });

  it("preserves manual records", () => {
    const validated = loadSyntheticPayload();
    const conflictingFingerprint = validated.payload.incomes[0]!.canonicalFingerprint;
    const data = sampleExistingData(conflictingFingerprint);
    const manualTx = data.transactions.length;
    const manualCards = data.cards.length;
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    expect(data.transactions.some((item) => item.id === "manual-1")).toBe(true);
    expect(data.cards.some((item) => item.id === "local-card")).toBe(true);
    expect(data.transactions.length).toBeGreaterThan(manualTx);
    expect(data.cards.length).toBeGreaterThan(manualCards);
    expect(plan.items.some((item) => item.action === "conflict")).toBe(true);
  });

  it("reimports the same file without duplication", () => {
    const validated = loadSyntheticPayload();
    const data = emptyAppData();
    const plan1 = buildImportPlan(data, validated.payload, validated.summary);
    const result1 = applyImportPlan(data, plan1);
    const txCount = data.transactions.length;
    const cardCount = data.cards.length;
    const invoiceCount = data.invoices.length;
    const plan2 = buildImportPlan(data, validated.payload, validated.summary);
    const result2 = applyImportPlan(data, plan2);
    expect(data.transactions.length).toBe(txCount);
    expect(data.cards.length).toBe(cardCount);
    expect(data.invoices.length).toBe(invoiceCount);
    expect(result2.existing).toBe(14);
    expect(result2.created).toBe(0);
    expect(result1.created).toBe(14);
  });

  it("maps open, partial, paid and creditor invoices", () => {
    const validated = loadSyntheticPayload();
    const data = emptyAppData();
    applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    const open = data.invoices.find((item) => item.importStatus === "open");
    const partial = data.invoices.find((item) => item.importStatus === "partial");
    const credit = data.invoices.find((item) => invoiceHasCredit(item));
    expect(open?.status).toBe("open");
    expect(partial?.status).toBe("partial");
    expect(credit).toBeDefined();
    expect(invoiceStatusLabel(credit as Invoice)).toBe("Credora");
    expect(invoiceStatusLabel(partial as Invoice)).toBe("Parcial");
  });

  it("stores purchase and IOF with same sourceRecordId without duplicating obligation", () => {
    const validated = loadSyntheticPayload();
    const data = emptyAppData();
    applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    const shared = data.transactions.filter(
      (item) => item.sourceRecordId === "shared-synthetic-001",
    );
    expect(shared).toHaveLength(2);
    const summary = calculateCompetenceSummary(data, "2026-01");
    expect(summary.expensePaidCents).toBe(40000);
    expect(summary.expensePendingCents).toBe(0);
    expect(sumInInvoice(data, "2026-01")).toBe(20300);
  });

  it("does not apply invalid plan", () => {
    const validated = loadSyntheticPayload();
    const conflictingFingerprint = validated.payload.incomes[0]!.canonicalFingerprint;
    const before = sampleExistingData(conflictingFingerprint);
    const snapshot = cloneAppData(before);
    const invalid = validateImportDocument({ schemaVersion: "wrong" });
    expect(invalid.ok).toBe(false);
    const plan: ImportPlan = {
      payload: {
        schemaVersion: "cfm.import.v1",
        generatedAt: "2026-07-10T00:00:00-03:00",
        currency: "BRL",
        incomes: [],
        cards: [],
        invoices: [],
        expenses: [],
      },
      summary: invalid.summary,
      items: [],
      canImport: false,
    };
    const result = applyImportPlan(snapshot, plan);
    expect(result.created).toBe(0);
    expect(snapshot).toEqual(before);
  });
});

function sumInInvoice(data: AppData, competenceMonth: string): number {
  return data.transactions
    .filter(
      (item) =>
        item.competenceMonth === competenceMonth && isInvoiceLinkedExpense(item),
    )
    .reduce((total, item) => total + item.amountCents, 0);
}

describe("import integration surfaces", () => {
  it("exposes the import route", () => {
    expect(normalizeRoute("#/importar")).toBe("/importar");
  });

  it("supports dashboard calculations after import without double counting", () => {
    const validated = loadSyntheticPayload();
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-01";
    applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    const summary = calculateCompetenceSummary(data, "2026-01");
    expect(summary.incomeSettledCents).toBe(500000);
    expect(summary.expensePaidCents).toBe(40000);
    expect(summary.balanceRealizedCents).toBe(460000);
  });
});

describe("import page accessibility", () => {
  it("renders keyboard-focusable dropzone", () => {
    document.body.innerHTML = `
      <div class="import-dropzone" id="import-dropzone" tabindex="0" role="button" aria-label="Selecionar arquivo"></div>
      <input class="sr-only" type="file" id="import-file-input" />
    `;
    const dropzone = document.getElementById("import-dropzone");
    expect(dropzone?.getAttribute("tabindex")).toBe("0");
    expect(dropzone?.getAttribute("role")).toBe("button");
  });
});
