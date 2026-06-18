/**
 * Fase 0.3.20 — Formatação monetária e datas (PT-BR)
 */
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

function loadFormatters() {
  var code = fs.readFileSync(path.join(root, "src/utils/formatters.js"), "utf8");
  global.CFM = {};
  var patched = code.replace(/window\.CFM/g, "CFM");
  eval(patched);
  return global.CFM.formatters;
}

var fmt = loadFormatters();

assert(typeof fmt.formatCurrencyBRL === "function", "formatCurrencyBRL existe");
assert(typeof fmt.formatDateBR === "function", "formatDateBR existe");
assert(typeof fmt.formatCompetenceBR === "function", "formatCompetenceBR existe");

assert(fmt.formatCurrencyBRL(7060) === "R$\u00a070,60", "centavos: 70,60 com duas casas");
assert(fmt.formatCurrencyBRL(167650) === "R$\u00a01.676,50", "centavos: 1.676,50");
assert(fmt.formatCurrencyBRL("R$ 70,6") === "R$\u00a070,60", "string legada R$ 70,6 normalizada");
assert(fmt.formatCurrencyBRL("R$ 1.676,5") === "R$\u00a01.676,50", "string legada R$ 1.676,5 normalizada");
assert(fmt.formatCurrencyBRL("Valor a confirmar") === "Valor a confirmar", "label não monetário preservado");

assert(fmt.formatDateBR("2026-01-15") === "15/01/2026", "data ISO → PT-BR");
assert(fmt.formatDateBR("2026-03-31") === "31/03/2026", "data ISO → PT-BR");
assert(fmt.formatCompetenceBR("2026-06") === "Junho/2026", "competência Junho/2026");
assert(fmt.formatDisplayDate("2026-05-10") === "10/05/2026", "formatDisplayDate data");
assert(fmt.formatDisplayDate("2026-07") === "Julho/2026", "formatDisplayDate competência");

var importerSrc = fs.readFileSync(path.join(root, "src/pages/importer.page.js"), "utf8");
assert(importerSrc.indexOf("function displayMoney") >= 0, "importador: displayMoney");
assert(importerSrc.indexOf("function displayDate") >= 0, "importador: displayDate");
assert(importerSrc.indexOf("displayMoney(tx.amountFmt") >= 0, "importador: tx usa displayMoney");
assert(importerSrc.indexOf("displayDate(tx.dateFmt") >= 0, "importador: tx usa displayDate");

var serviceSrc = fs.readFileSync(path.join(root, "src/services/import.service.js"), "utf8");
assert(serviceSrc.indexOf("formatCurrencyBRL") >= 0, "import.service usa formatCurrencyBRL");
assert(serviceSrc.indexOf("formatDateBR") >= 0, "import.service usa formatDateBR");

if (failed) {
  console.error("\n" + failed + " failure(s)");
  process.exit(1);
}
console.log("\nALL PASS");
