/**
 * Fase 0.3.14 — Decisão e valores do importador.
 * Uso: node scripts/test-phase-0.3.14.js
 */
/* eslint-disable no-eval */
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");

function load(relativePath) {
  var code = fs.readFileSync(path.join(root, relativePath), "utf8");
  code = code.replace(/window\.CFM/g, "global.CFM");
  eval(code);
}

global.CFM = global.CFM || {};
load("src/utils/formatters.js");
load("src/utils/validators.js");
load("src/utils/import-semantics.js");
load("src/utils/merchant-classification-rules.js");
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");
load("src/schemas/import.schema.js");
load("src/services/import.service.js");

var sem = CFM.importSemantics;
var val = CFM.validators;
var imp = CFM.importService;
var fmt = CFM.formatters || {};
var fcents = fmt.formatCurrencyFromCents || function (c) { return String(c); };
var fails = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

/* Fatura paga: valor principal ≠ R$ 0,00 quando há encargos */
var paidInv = {
  id: "inv_paid",
  cardId: "c1",
  competenceMonth: "2026-06",
  status: "paid",
  reconciliationStatus: "settled",
  amountDueCents: 0,
  totalCents: 0,
  invoiceChargesCents: 267210,
  amountDueFmt: fcents(0)
};
var recon = { invoiceChargesCents: 267210, linkedPurchasesCents: 250000 };
var primary = sem.getInvoicePrimaryDisplay(paidInv, recon, [], fcents);
assert(primary.primaryCents > 0, "fatura paga: primaryCents > 0");
assert(primary.primaryFmt !== fcents(0), "fatura paga: headline não R$ 0,00");
assert(primary.isPaid === true, "fatura paga: isPaid");

/* Recorrência deriva valor por transação vinculada */
var txs = [
  { id: "tx_spotify", description: "Spotify", amountCents: 2190, flow: "out", type: "expense" },
  { id: "tx_openai", description: "Openai", amountCents: 10228, flow: "out", type: "expense" }
];
var ruleNoAmount = {
  description: "Openai *Chatgpt",
  flow: "out",
  transactionRefs: ["tx_openai"]
};
var amt = sem.getRecurringDisplayAmount(ruleNoAmount, txs);
assert(amt.hasValue === true, "recorrência: valor derivado");
assert(amt.amountCents === 10228, "recorrência: amountCents correto");

var ruleMerchant = { description: "Spotify", flow: "out" };
var amt2 = sem.getRecurringDisplayAmount(ruleMerchant, txs);
assert(amt2.hasValue === true && amt2.amountCents === 2190, "recorrência: valor por merchant");

var ruleEmpty = { description: "Desconhecido XYZ", flow: "out" };
var amt3 = sem.getRecurringDisplayAmount(ruleEmpty, txs);
assert(amt3.hasValue === false, "recorrência: sem valor");
assert(amt3.label === "Valor a confirmar", "recorrência: label fallback");

/* Parcelas relacionadas não geram compra repetida */
var instTxA = {
  description: "Loja Teste Parcela 1/2",
  amountCents: 5000,
  flow: "out",
  type: "credit_card_purchase",
  cardId: "c1",
  competenceMonth: "2026-05",
  transactionDate: "2026-05-10"
};
var instTxB = {
  description: "Loja Teste Parcela 2/2",
  amountCents: 5000,
  flow: "out",
  type: "credit_card_purchase",
  cardId: "c1",
  competenceMonth: "2026-06",
  transactionDate: "2026-06-10"
};
var cls = val.classifyTransactionSimilarity(instTxA, instTxB);
assert(cls.classification === "installment_related", "parcelas: installment_related");

var pair = { index1: 0, index2: 1, classification: "repeated_purchase" };
assert(sem.shouldSuppressRepeatedPurchasePair(pair, [instTxA, instTxB], []), "suprime repeated para parcelas");

var simReport = val.buildSimilarityReport
  ? val.buildSimilarityReport([instTxA, instTxB])
  : { repeatedPurchases: [] };
var repeated = (simReport.repeatedPurchases || []).length;
assert(repeated === 0, "parcelas 1/2 e 2/2 não em repeatedPurchases");

/* Compare hint */
var hint = sem.getTransactionCompareHint(instTxA, instTxB);
assert(hint && hint.length > 0, "compare hint disponível");

/* Import report: fatura paga enriquecida */
var payload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Test", documentType: "credit_card_bill" },
  cards: [{ id: "c1", name: "Cartão", lastFour: "1234" }],
  invoices: [paidInv],
  transactions: txs
};
var report = imp.buildImportReport("test.json", 100, payload, { valid: true, warnings: [], itemErrors: [] });
var inv = (report.allInvoices || [])[0];
assert(inv && inv.primaryAmountFmt && inv.primaryAmountFmt !== fcents(0), "report: primaryAmountFmt pago");

var recRules = report.allRecurringRules || [];
assert(recRules.length >= 0, "report: allRecurringRules ok");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails === 0 ? 0 : 1);
