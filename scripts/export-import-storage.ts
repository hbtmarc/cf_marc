import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyImportPlan, buildImportPlan } from "../src/import.ts";
import { parseImportJson, validateImportDocument } from "../src/import-validate.ts";
import { emptyAppData } from "../src/storage.ts";

const importPath =
  process.argv[2] ??
  "C:/Users/hbmar/Downloads/cfm_import_20260710_2107_corrigido.json";
const outPath = resolve(process.argv[3] ?? "docs/screenshots-etapa5/_storage-temp.json");

const raw = readFileSync(importPath, "utf8");
const parsed = parseImportJson(raw);
if (!parsed.ok) {
  throw new Error(parsed.message);
}
const validated = validateImportDocument(parsed.value, "local");
if (!validated.ok) {
  throw new Error(validated.summary.errors.join("; "));
}
const data = emptyAppData();
applyImportPlan(data, buildImportPlan(data, validated.payload, validated.summary));
writeFileSync(outPath, JSON.stringify(data));
console.log(outPath);
