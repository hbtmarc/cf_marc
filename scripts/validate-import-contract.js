#!/usr/bin/env node
/**
 * Fase 0.3.9 — Validador de contrato cfm.import.v1
 * Uso: node scripts/validate-import-contract.js <caminho.json> [--canonical]
 *
 * Não imprime payload financeiro completo.
 */
/* eslint-disable no-eval */
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var args = process.argv.slice(2).filter(function (a) { return a.indexOf("--") !== 0; });
var flags = process.argv.slice(2).filter(function (a) { return a.indexOf("--") === 0; });
var jsonPath = args[0];
var canonicalMode = flags.indexOf("--canonical") >= 0;

var CANONICAL_EXPECTATIONS = {
  transactions: 206,
  valid: 206,
  invalid: 0,
  cards: 4,
  cardSnapshots: 4,
  invoices: 6,
  installmentPlans: 42,
  recurringTotal: 9,
  blockingConfirmCount: 0,
  blockingSimilarityCount: 0,
  informationalSimilarityCount: 12,
  badRawHashCount: 0,
  suggestionCount: 4
};

function load(relativePath) {
  var code = fs.readFileSync(path.join(root, relativePath), "utf8");
  code = code.replace(/window\.CFM/g, "global.CFM");
  eval(code);
}

function usage() {
  console.log("Uso: node scripts/validate-import-contract.js <caminho.json> [--canonical]");
  console.log("");
  console.log("Exemplos:");
  console.log("  node scripts/validate-import-contract.js data/sample-import.cfm.v1.json");
  console.log("  node scripts/validate-import-contract.js ./cfm_import_v1_cardsnapshots.json --canonical");
  process.exit(2);
}

if (!jsonPath) usage();

var absPath = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
if (!fs.existsSync(absPath)) {
  console.error("ERRO: arquivo não encontrado:", absPath);
  console.error("Se o JSON canônico está fora do repo, informe o caminho local completo.");
  process.exit(2);
}

global.CFM = global.CFM || {};
load("src/utils/formatters.js");
load("src/utils/validators.js");
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");
load("src/schemas/import.schema.js");
load("src/schemas/import.contract.js");
load("src/services/import.service.js");

var v = CFM.validators;
var contract = CFM.importContract;
var imp = CFM.importService;

var rawText = fs.readFileSync(absPath, "utf8");
var fileName = path.basename(absPath);
var fileSize = Buffer.byteLength(rawText, "utf8");

var payload;
try {
  payload = imp.parseJsonText(rawText);
} catch (e) {
  console.error("ERRO: JSON malformado —", e.message);
  process.exit(1);
}

if (v.normalizeImportPayload) payload = v.normalizeImportPayload(payload);

var schemaValidation = imp.validateImportPayload(payload);
var contractResult = contract.validate(payload, { skipSchema: true });

var badRawHashCount = v.countBadRawHashes ? v.countBadRawHashes(payload) : 0;
var privacyCount = v.scanForSensitiveData ? v.scanForSensitiveData(payload).length : 0;

var report = null;
if (schemaValidation.valid) {
  report = imp.buildImportReport(fileName, fileSize, payload, schemaValidation);
}

var blockingIssues = contractResult.blockingIssues.slice();
var warnings = contractResult.warnings.slice();

if (!schemaValidation.valid) {
  (schemaValidation.fatal || []).forEach(function (msg) {
    blockingIssues.push({
      code: "SCHEMA_FATAL",
      entity: "schema",
      id: "",
      message: msg,
      generatorFix: "Corrigir erro estrutural do schema antes de exportar.",
      severity: "blocking"
    });
  });
}

if (badRawHashCount > 0) {
  blockingIssues.push({
    code: "BAD_RAW_HASH_COUNT",
    entity: "payload",
    id: "",
    message: "badRawHashCount = " + badRawHashCount,
    generatorFix: "Normalizar rawHash para sha256:<64 hex> ou usar canonicalFingerprint.",
    severity: "blocking"
  });
}

if (privacyCount > 0) {
  blockingIssues.push({
    code: "PRIVACY",
    entity: "payload",
    id: "",
    message: privacyCount + " alerta(s) de privacidade.",
    generatorFix: "Sanitizar CPF, cartão completo, linha digitável e sequências longas.",
    severity: "blocking"
  });
}

var canonicalFailures = [];
if (canonicalMode && report && report.counters) {
  var c = report.counters;
  Object.keys(CANONICAL_EXPECTATIONS).forEach(function (key) {
    var expected = CANONICAL_EXPECTATIONS[key];
    var actual = c[key];
    if (actual === undefined && key === "valid") actual = c.transactions - (c.invalid || 0);
    if (actual === undefined && key === "recurringTotal") {
      actual = c.recurringTotal || c.recurringRules || 0;
    }
    if (actual !== expected) {
      canonicalFailures.push(key + ": esperado " + expected + ", obtido " + actual);
    }
  });
  if (badRawHashCount !== CANONICAL_EXPECTATIONS.badRawHashCount) {
    canonicalFailures.push("badRawHashCount: esperado 0, obtido " + badRawHashCount);
  }
}

var generatorFixes = [];
var fixSeen = {};
blockingIssues.concat(warnings).forEach(function (item) {
  if (item.generatorFix && !fixSeen[item.generatorFix]) {
    fixSeen[item.generatorFix] = true;
    generatorFixes.push(item.generatorFix);
  }
});

function printHeader() {
  console.log("=== CFM Import Contract Validator (Fase 0.3.9) ===");
  console.log("Arquivo:", fileName);
  console.log("Caminho:", absPath);
  console.log("");
}

function printCounts() {
  var counts = contractResult.counts;
  console.log("schemaVersion:", payload.schemaVersion || "(ausente)");
  console.log("");
  console.log("Totais:");
  console.log("  accounts:         ", counts.accounts);
  console.log("  cards:            ", counts.cards);
  console.log("  cardSnapshots:    ", counts.cardSnapshots);
  console.log("  invoices:         ", counts.invoices);
  console.log("  transactions:     ", counts.transactions);
  console.log("  installmentPlans: ", counts.installmentPlans);
  console.log("  recurringRules:   ", counts.recurringRules);
  console.log("");
  console.log("badRawHashCount:   ", badRawHashCount);
  console.log("privacyAlerts:     ", privacyCount);
  console.log("blockingIssues:    ", blockingIssues.length);
  console.log("warnings:          ", warnings.length);
}

function printImporterSummary() {
  if (!report || !report.counters) {
    console.log("");
    console.log("Relatório importador: indisponível (schema inválido).");
    return;
  }
  var c = report.counters;
  console.log("");
  console.log("Importador (resumo seguro):");
  console.log("  overallStatus:              ", report.overallStatus);
  console.log("  valid / invalid:            ", c.valid, "/", c.invalid);
  console.log("  blockingConfirmCount:       ", c.blockingConfirmCount);
  console.log("  blockingSimilarityCount:    ", c.blockingSimilarityCount);
  console.log("  informationalSimilarityCount:", c.informationalSimilarityCount);
  console.log("  suggestionCount:            ", c.suggestionCount != null ? c.suggestionCount : c.reviewSuggestions);
  console.log("  recurringTotal:             ", c.recurringTotal || c.recurringRules);
}

function printIssues(list, title) {
  if (!list.length) return;
  console.log("");
  console.log(title);
  list.slice(0, 30).forEach(function (item, idx) {
    console.log("  " + (idx + 1) + ". [" + item.code + "] " + item.entity +
      (item.id ? " id=" + item.id : "") + " — " + item.message);
    if (item.generatorFix) console.log("     → " + item.generatorFix);
  });
  if (list.length > 30) console.log("  … +" + (list.length - 30) + " item(ns)");
}

function printGeneratorFixes() {
  console.log("");
  console.log("--- CORREÇÕES NECESSÁRIAS NO GERADOR JSON ---");
  if (!generatorFixes.length) {
    console.log("(nenhuma — contrato atendido ou apenas avisos informativos)");
    return;
  }
  generatorFixes.forEach(function (fix, i) {
    console.log((i + 1) + ". " + fix);
  });
}

function printCanonical() {
  if (!canonicalMode) return;
  console.log("");
  console.log("Perfil canônico (--canonical):");
  if (!canonicalFailures.length) {
    console.log("  OK — métricas alinhadas ao JSON canônico de referência.");
  } else {
    canonicalFailures.forEach(function (line) {
      console.log("  FALHA:", line);
    });
  }
}

printHeader();
printCounts();
printImporterSummary();
printIssues(blockingIssues, "Erros bloqueantes:");
printIssues(warnings, "Avisos:");
printCanonical();

var pass = blockingIssues.length === 0 &&
  schemaValidation.valid &&
  (!canonicalMode || canonicalFailures.length === 0);

console.log("");
console.log("VERDICT:", pass ? "PASS" : "FAIL");

printGeneratorFixes();

console.log("");
if (!pass) process.exit(1);
