import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyImportPlan, buildImportPlan } from "./import";
import { parseImportJson, validateImportDocument } from "./import-validate";
import { emptyAppData } from "./storage";

const REAL_IMPORT_PATH = "C:/Users/hbmar/Downloads/cfm_import_20260710_2107_corrigido.json";
const hasRealImport = existsSync(REAL_IMPORT_PATH);

describe("approved real import outside repository", () => {
  it.skipIf(!hasRealImport)("creates 343 records on first import", () => {
    const parsed = parseImportJson(readFileSync(REAL_IMPORT_PATH, "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const validated = validateImportDocument(parsed.value, "cfm_import_20260710_2107_corrigido.json");
    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      return;
    }
    const data = emptyAppData();
    const result = applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    expect(result.created).toBe(343);
    expect(data.transactions).toHaveLength(330);
    expect(data.cards).toHaveLength(4);
    expect(data.invoices).toHaveLength(9);
  });

  it.skipIf(!hasRealImport)("marks 343 records as existing on reimport", () => {
    const parsed = parseImportJson(readFileSync(REAL_IMPORT_PATH, "utf8"));
    if (!parsed.ok) {
      return;
    }
    const validated = validateImportDocument(parsed.value, "cfm_import_20260710_2107_corrigido.json");
    if (!validated.ok) {
      return;
    }
    const data = emptyAppData();
    applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    const result = applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
    expect(result.created).toBe(0);
    expect(result.existing).toBe(343);
    expect(result.conflicts).toBe(0);
  });
});
