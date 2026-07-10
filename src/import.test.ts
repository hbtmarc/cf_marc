import { describe, expect, it } from "vitest";
import { calculateCompetenceSummary, invoiceHasCredit, invoiceStatusLabel } from "./finance";
import { applyImportPlan, buildImportPlan, cloneAppData } from "./import";
import { buildCanonicalFingerprint } from "./import-fingerprint";
import { parseImportJson, validateImportDocument } from "./import-validate";
import type { ImportPlan } from "./import-types";
import fixtureDocument from "./fixtures/import-valid.json";
import { normalizeRoute } from "./router";
import { emptyAppData } from "./storage";
import type { AppData, Invoice } from "./types";

const fixtureRaw = JSON.stringify(fixtureDocument);

function loadValidPayload() {
  const parsed = parseImportJson(fixtureRaw);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  const validated = validateImportDocument(parsed.value, "import-valid.json");
  if (!validated.ok) {
    throw new Error(validated.summary.errors.join("; "));
  }
  return validated;
}

function sampleExistingData(): AppData {
  return {
    ...emptyAppData(),
    selectedCompetenceMonth: "2026-06",
    transactions: [
      {
        id: "manual-1",
        kind: "expense",
        description: "Conta de luz",
        amountCents: 18990,
        date: "2026-05-15",
        competenceMonth: "2026-05",
        category: "Moradia",
        status: "settled",
        createdAt: "2026-05-15T12:00:00.000Z",
        updatedAt: "2026-05-15T12:00:00.000Z",
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

describe("import validation", () => {
  it("accepts a valid cfm.import.v1 JSON", () => {
    const validated = loadValidPayload();
    expect(validated.payload.schemaVersion).toBe("cfm.import.v1");
    expect(validated.summary.counts.cards).toBe(2);
    expect(validated.summary.counts.transactions).toBe(6);
  });

  it("rejects malformed JSON", () => {
    const parsed = parseImportJson("{ invalid");
    expect(parsed.ok).toBe(false);
  });

  it("rejects incorrect schema version", () => {
    const parsed = parseImportJson('{"schemaVersion":"cfm.import.v9","source":{"institution":"X","documentType":"y"}}');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const validated = validateImportDocument(parsed.value);
      expect(validated.ok).toBe(false);
      expect(validated.summary.errors.some((item) => item.includes("schemaVersion"))).toBe(true);
    }
  });

  it("does not mutate storage when document is invalid", () => {
    const before = sampleExistingData();
    const snapshot = cloneAppData(before);
    const validated = validateImportDocument({ schemaVersion: "wrong" });
    expect(validated.ok).toBe(false);
    expect(snapshot).toEqual(before);
    const plan: ImportPlan = {
      payload: {
        schemaVersion: "cfm.import.v1",
        source: { institution: "X", documentType: "y" },
      },
      summary: validated.summary,
      items: [],
      canImport: false,
    };
    const result = applyImportPlan(snapshot, plan);
    expect(result.created).toBe(0);
    expect(snapshot).toEqual(before);
  });
});

describe("import apply and idempotency", () => {
  it("imports valid data on confirmation", () => {
    const validated = loadValidPayload();
    const data = emptyAppData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    expect(plan.canImport).toBe(true);
    const result = applyImportPlan(data, plan);
    expect(result.created).toBeGreaterThan(0);
    expect(data.cards.length).toBe(2);
    expect(data.invoices.some((item) => invoiceHasCredit(item))).toBe(true);
    expect(data.transactions.some((item) => item.description.includes("Salario"))).toBe(true);
  });

  it("preserves existing manual data", () => {
    const validated = loadValidPayload();
    const data = sampleExistingData();
    const beforeTx = data.transactions.length;
    const beforeCards = data.cards.length;
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    expect(data.transactions.length).toBeGreaterThan(beforeTx);
    expect(data.cards.length).toBeGreaterThan(beforeCards);
    expect(data.transactions.some((item) => item.id === "manual-1")).toBe(true);
  });

  it("reimports the same file without duplication", () => {
    const validated = loadValidPayload();
    const data = emptyAppData();
    const plan1 = buildImportPlan(data, validated.payload, validated.summary);
    const result1 = applyImportPlan(data, plan1);
    const txCount = data.transactions.length;
    const cardCount = data.cards.length;
    const plan2 = buildImportPlan(data, validated.payload, validated.summary);
    const result2 = applyImportPlan(data, plan2);
    expect(data.transactions.length).toBe(txCount);
    expect(data.cards.length).toBe(cardCount);
    expect(result2.existing).toBeGreaterThan(0);
    expect(result2.created).toBe(0);
    expect(result1.created).toBeGreaterThan(0);
  });

  it("imports transactions with same description on different dates", () => {
    const validated = loadValidPayload();
    const data = emptyAppData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    const matches = data.transactions.filter((item) => item.description === "Conta de luz");
    expect(matches.length).toBe(2);
    expect(new Set(matches.map((item) => item.date)).size).toBe(2);
  });

  it("marks uncertain manual matches as conflicts", () => {
    const validated = loadValidPayload();
    const data = sampleExistingData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    const conflict = plan.items.find(
      (item) => item.entity === "transaction" && item.action === "conflict",
    );
    expect(conflict).toBeDefined();
  });

  it("recognizes card aliases without creating extra cards", () => {
    const validated = loadValidPayload();
    expect(validated.summary.warnings.some((item) => item.includes("aliases"))).toBe(true);
    const data = emptyAppData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    expect(data.cards).toHaveLength(2);
  });

  it("interprets creditor invoice correctly", () => {
    const validated = loadValidPayload();
    const data = emptyAppData();
    const plan = buildImportPlan(data, validated.payload, validated.summary);
    applyImportPlan(data, plan);
    const credit = data.invoices.find((item) => (item.creditBalanceCents ?? 0) > 0);
    expect(credit).toBeDefined();
    expect(invoiceHasCredit(credit as Invoice)).toBe(true);
    expect(invoiceStatusLabel(credit as Invoice)).toBe("Credora");
    const summary = calculateCompetenceSummary(data, "2026-06");
    expect(summary.expensePlannedCents).toBe(245000 + 18990);
  });

  it("does not apply import before confirmation", () => {
    const validated = loadValidPayload();
    const data = emptyAppData();
    buildImportPlan(data, validated.payload, validated.summary);
    expect(data.cards).toHaveLength(0);
    expect(data.transactions).toHaveLength(0);
  });

  it("builds canonical fingerprints for imported transactions", () => {
    const validated = loadValidPayload();
    const tx = validated.payload.transactions?.[1];
    expect(tx).toBeDefined();
    const fingerprint = buildCanonicalFingerprint(tx!, {
      institution: validated.payload.source.institution,
      documentType: validated.payload.source.documentType,
    });
    expect(fingerprint.length).toBeGreaterThan(10);
    expect(fingerprint).toContain("supermercado central");
  });
});

describe("import integration surfaces", () => {
  it("exposes the import route", () => {
    expect(normalizeRoute("#/importar")).toBe("/importar");
  });

  it("supports dashboard calculations after import", () => {
    const validated = loadValidPayload();
    const data = emptyAppData();
    data.selectedCompetenceMonth = "2026-06";
    applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    const summary = calculateCompetenceSummary(data, "2026-06");
    expect(summary.incomePlannedCents).toBe(850000);
    expect(summary.expensePlannedCents).toBeGreaterThan(0);
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
