/**
 * Fase 0.3.6-E — testes de estabilização final do importador.
 * Uso: node scripts/test-phase-036e.js
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
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");
load("src/schemas/import.schema.js");
load("src/services/import.service.js");

var v = CFM.validators;
var css = CFM.cardSnapshotService;
var imp = CFM.importService;

var fails = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

function cardSnap(cardId, limit, used, available, month) {
  return {
    cardExternalRef: cardId,
    cardId: cardId,
    snapshotMonth: month || "2026-05",
    snapshotDate: "2026-05-31",
    limitCents: limit,
    usedCents: used,
    availableCents: available,
    source: "import_json",
    confidence: "high"
  };
}

var payload = {
  schemaVersion: "cfm.import.v1",
  source: {
    institution: "Test",
    documentType: "bill",
    periodEnd: "2026-05-31",
    rawHash: "sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12"
  },
  cards: [
    { id: "bb", name: "BB Ourocard Platinum Visa", externalRef: "bb" },
    { id: "mp", name: "Mercado Pago Visa", externalRef: "mp" },
    { id: "porto", name: "Porto Seguro Cartão", externalRef: "porto" },
    { id: "nubank", name: "Nubank", externalRef: "nubank" },
    { id: "no_snap", name: "Cartão Sem Snapshot", externalRef: "no_snap" }
  ],
  cardSnapshots: [
    cardSnap("bb", 1000000, 815200, 184800),
    cardSnap("mp", 50000, 36497, 13503),
    cardSnap("porto", 1620000, 1409203, 210797),
    cardSnap("nubank", 1245000, 1060600, 184400)
  ],
  transactions: [
    {
      description: "Compra loja",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 75245,
      competenceMonth: "2026-06",
      invoiceId: "inv_nubank",
      cardId: "nubank"
    },
    {
      description: "Pagamento fatura maio",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 275246,
      competenceMonth: "2026-06",
      invoiceId: "inv_nubank",
      cardId: "nubank"
    },
    {
      description: "Pagamento fatura abril/2026",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 9900,
      competenceMonth: "2026-05",
      invoiceId: "inv_mp",
      cardId: "mp"
    },
    {
      description: "Transferência enviada mesma titularidade aparente",
      type: "transfer",
      flow: "out",
      amountCents: 10000,
      competenceMonth: "2026-05",
      review: { required: true, reason: "Transferência enviada — mesma titularidade aparente" }
    },
    {
      description: "Pix enviado para pessoa física conhecida",
      type: "expense",
      flow: "out",
      amountCents: 5000,
      competenceMonth: "2026-05",
      review: { required: true, reason: "Pix enviado para pessoa física" }
    }
  ],
  invoices: [
    {
      id: "inv_nubank",
      cardId: "nubank",
      competenceMonth: "2026-06",
      totalCents: 75246,
      amountDueCents: 75246
    },
    {
      id: "inv_mp",
      cardId: "mp",
      competenceMonth: "2026-05",
      totalCents: 0,
      amountDueCents: 0,
      balanceDirection: "credit",
      creditBalanceCents: 749,
      creditBehavior: "applies_to_next_invoice"
    },
    {
      id: "inv_stub",
      cardId: "bb",
      competenceMonth: "2026-04",
      totalCents: 0,
      isStub: true,
      review: { required: true, reason: "Fatura stub provisória" }
    }
  ],
  recurringRules: [],
  installmentPlans: []
};

payload = v.normalizeImportPayload(payload);
assert(v.countBadRawHashes(payload) === 0, "badRawHashCount = 0");

var validation = imp.validateImportPayload(payload);
var report = imp.buildImportReport("test.json", 1000, payload, validation);

assert(report.counters.valid === 5, "5 transações válidas");
assert(report.counters.blockingConfirmCount === 0, "blockingConfirmCount = 0");
assert(report.counters.invoiceStubCount === 1, "invoiceStubCount = 1");

var summaries = report.cardSummaries;
var bb = summaries.filter(function (c) { return c.canonicalKey === "bb_platinum" || c.id === "bb"; })[0];
var mp = summaries.filter(function (c) { return c.canonicalKey === "mercado_pago" || c.id === "mp"; })[0];
assert(bb && bb.usedCents === 815200 && bb.availableCents === 184800, "BB snapshot do JSON");
assert(mp && mp.usedCents === 36497 && mp.availableCents === 13503, "MP snapshot do JSON");
assert(bb.usedCents + bb.availableCents === bb.limitCents, "BB used+available=limit");

var noSnap = summaries.filter(function (c) { return c.id === "no_snap"; })[0];
assert(noSnap && noSnap.snapshotAbsent && noSnap.usedFmt === "snapshot ausente", "cartão sem snapshot");

var mpInv = report.allInvoices.filter(function (i) { return i.cardId === "mp"; })[0];
assert(mpInv && mpInv.hasCredit && !mpInv.hasReconciliationGap, "MP credor sem gap");

var nubInv = report.allInvoices.filter(function (i) { return i.cardId === "nubank"; })[0];
assert(nubInv && !nubInv.hasReconciliationGap, "Nubank sem gap falso");
assert(
  nubInv.reconciliationStatus === "consistent" ||
  nubInv.reconciliationStatus === "explained_by_payment",
  "Nubank status OK"
);

var recon = css.buildInvoiceReconciliation(payload.invoices[0], payload.transactions, {
  registry: css.buildCardRegistry(payload.cards),
  isHistoricalPaymentForInvoice: v.isHistoricalPaymentForInvoice
});
assert(recon.explainedByPayments === true, "recon Nubank encargos ≈ total");

var hist = v.isHistoricalPaymentForInvoice(payload.transactions[2], "2026-05");
assert(hist === true, "pagamento abril não entra fatura maio");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails > 0 ? 1 : 0);
