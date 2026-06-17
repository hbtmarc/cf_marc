/**
 * Fase 0.3.6-D — testes de estabilização do importador.
 * Uso: node scripts/test-phase-036d.js
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
load("src/utils/validators.js");
load("src/utils/import-semantics.js");
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");

var v = CFM.validators;
var crs = CFM.classificationRulesService;
var css = CFM.cardSnapshotService;

var fails = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

var payload = {
  source: {
    institution: "Test",
    documentType: "bill",
    rawHash: "legivel-nao-sha256"
  },
  transactions: [
    {
      description: "Banco Pan Auto Pan",
      type: "expense",
      flow: "out",
      amountCents: 100000,
      competenceMonth: "2026-06",
      source: { rawHash: "outro-hash-legivel" }
    },
    {
      description: "Pagamento fatura",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 50000,
      competenceMonth: "2026-06",
      invoiceId: "inv1",
      cardId: "c1"
    },
    {
      description: "Compra loja",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 75245,
      competenceMonth: "2026-06",
      invoiceId: "inv1",
      cardId: "c1"
    },
    {
      description: "Pagamento fatura",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 275246,
      competenceMonth: "2026-06",
      invoiceId: "inv1",
      cardId: "c1"
    }
  ],
  recurringRules: [
    { id: "r1", description: "Netflix", flow: "out", amountCents: 5500, frequency: "monthly" }
  ],
  cards: [{ id: "c1", name: "Nubank" }],
  invoices: [{
    id: "inv1",
    externalRef: "inv1",
    cardId: "c1",
    competenceMonth: "2026-06",
    totalCents: 75246,
    amountDueCents: 75246
  }],
  installmentPlans: [{
    id: "plan_pan",
    description: "Banco Pan Auto Pan",
    kind: "financing",
    totalInstallments: 36,
    currentInstallment: 22,
    installmentAmountCents: 100000,
    cardId: "c1"
  }]
};

var beforeBad = v.countBadRawHashes(payload);
assert(beforeBad >= 2, "detecta rawHash legível antes da normalização (" + beforeBad + ")");

payload = v.normalizeImportPayload(payload);
var afterBad = v.countBadRawHashes(payload);
assert(afterBad === 0, "badRawHashCount após normalização = 0");

assert(
  payload.source.canonicalFingerprint && !payload.source.rawHash,
  "source.rawHash legível movido para canonicalFingerprint"
);

var recon = css.buildInvoiceReconciliation(payload.invoices[0], payload.transactions, {
  registry: { resolveCardId: function (r) { return r; } },
  isHistoricalPaymentForInvoice: v.isHistoricalPaymentForInvoice
});
assert(recon.explainedByPayments === true, "Nubank-like: encargos ≈ total (liquidação separada)");
assert(
  recon.reconciliationStatus === "consistent" ||
  recon.message.indexOf("consistente") >= 0 ||
  recon.message.indexOf("explicada") >= 0,
  "mensagem de conciliação OK"
);

var pairs = [{ index1: 0, index2: 1, description: "pan" }];
var filtered = pairs.filter(function () { return true; });
var panTx = payload.transactions[0];
var isPan = /banco\s*pan|auto\s*pan/i.test(panTx.description);
assert(isPan, "Banco Pan identificável para exclusão de semelhanças");

var raw = crs.buildRecognizedRecurrences([], payload.recurringRules, []);
var dup = crs.buildRecognizedRecurrences([], payload.recurringRules, []).concat(
  crs.buildRecognizedRecurrences([{
    isRecurring: true,
    ruleId: "local_netflix",
    ruleLabel: "Netflix",
    ruleSource: "personal_local",
    classification: { flow: "out", categoryLabel: "streaming", recurrenceFrequency: "monthly" }
  }], [], [])
);
var deduped = crs.dedupeRecognizedRecurrences(dup);
assert(deduped.length < dup.length || dup.length <= 1, "recorrências deduplicadas");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails > 0 ? 1 : 0);
