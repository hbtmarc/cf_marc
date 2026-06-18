/**
 * Fase 0.4.0 — Base de conciliação cruzada inteligente.
 * Uso: node scripts/test-phase-0.4.0.js
 */
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
load("src/utils/import-reconciliation.js");
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");
load("src/schemas/import.schema.js");
load("src/services/import.service.js");

var v = CFM.validators;
var imp = CFM.importService;
var recon = CFM.importReconciliation;
var sem = CFM.importSemantics;
var STATUS = recon.STATUS;

var fails = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

function entryByRef(report, ref) {
  return (report.entries || []).filter(function (e) {
    return e.invoiceRef === ref;
  })[0];
}

function buildReport(payload) {
  var snapshotTx = JSON.stringify((payload.transactions || []).map(function (t) {
    return { id: t.id, amountCents: t.amountCents, invoiceId: t.invoiceId };
  }));
  var normalized = v.normalizeImportPayload(JSON.parse(JSON.stringify(payload)));
  var validation = imp.validateImportPayload(normalized);
  var report = imp.buildImportReport("fixture.json", 1000, normalized, validation);
  var afterTx = JSON.stringify((normalized.transactions || []).map(function (t) {
    return { id: t.id, amountCents: t.amountCents, invoiceId: t.invoiceId };
  }));
  assert(snapshotTx === afterTx, "transações originais intactas após relatório");
  return { report: report, payload: normalized, snapshotTx: snapshotTx };
}

/* ── Fixture Nubank (fatura paga + centavos + julho aberta) ── */
var nubankPayload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Nubank", documentType: "bill", periodEnd: "2026-07-31",
    rawHash: "sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12" },
  cards: [{ id: "nubank", name: "Nubank", externalRef: "nubank" }],
  cardSnapshots: [{
    cardId: "nubank", snapshotMonth: "2026-06", limitCents: 1245000,
    usedCents: 1060600, availableCents: 184400, source: "import_json"
  }],
  transactions: [
    {
      id: "tx_purchase",
      description: "Compra loja",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 75245,
      competenceMonth: "2026-06",
      invoiceId: "inv_nub_jun",
      cardId: "nubank"
    },
    {
      id: "tx_pay",
      description: "Pagamento fatura",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 275246,
      competenceMonth: "2026-06",
      invoiceId: "inv_nub_jun",
      cardId: "nubank",
      cashFlowTreatment: "invoice_settlement"
    }
  ],
  invoices: [
    {
      id: "inv_nub_jun",
      cardId: "nubank",
      competenceMonth: "2026-06",
      status: "paid",
      reconciliationStatus: "settled",
      totalCents: 75246,
      amountDueCents: 75246,
      ofxDebitReconciliationDifferenceCents: 1
    },
    {
      id: "inv_nub_jul",
      cardId: "nubank",
      competenceMonth: "2026-07",
      status: "open",
      sourceStatus: "provisional",
      replaceWhenClosed: true,
      totalCents: 120000,
      amountDueCents: 120000
    }
  ],
  recurringRules: [],
  installmentPlans: []
};

/* ── Fixture MP saldo credor ── */
var mpPayload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "MP", documentType: "bill", periodEnd: "2026-05-31",
    rawHash: "sha256:b1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12" },
  cards: [{ id: "mp", name: "Mercado Pago Visa", externalRef: "mp" }],
  transactions: [],
  invoices: [{
    id: "inv_mp",
    cardId: "mp",
    competenceMonth: "2026-05",
    totalCents: 0,
    amountDueCents: 0,
    balanceDirection: "credit",
    creditBalanceCents: 749,
    creditBehavior: "applies_to_next_invoice"
  }],
  recurringRules: [],
  installmentPlans: []
};

/* ── Fixture Porto (crédito interno + liquidação externa) ── */
var portoPayload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Porto", documentType: "bill", periodEnd: "2026-07-31",
    rawHash: "sha256:c1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12" },
  cards: [{ id: "porto_gold", name: "Porto Seguro", externalRef: "porto_gold" }],
  transactions: [
    {
      id: "tx_int_cred",
      description: "Pagamento fatura junho",
      type: "credit_card_payment",
      flow: "in",
      amountCents: 177141,
      competenceMonth: "2026-06",
      cardId: "porto_gold",
      invoiceId: "inv_porto_jun",
      invoiceBalanceEffect: "decreases_amount_due"
    },
    {
      id: "tx_ext_settle",
      description: "Liquidação externa junho",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 267210,
      competenceMonth: "2026-06",
      cardId: "porto_gold",
      invoiceId: "inv_porto_jun",
      cashFlowTreatment: "invoice_settlement"
    },
    {
      id: "tx_hist",
      description: "Pagamento fatura abril/2026",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 9900,
      competenceMonth: "2026-05",
      cardId: "porto_gold",
      invoiceId: "inv_porto_may"
    },
    {
      id: "tx_purchase_may",
      description: "Compra comum maio",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 5000,
      competenceMonth: "2026-05",
      cardId: "porto_gold",
      invoiceId: "inv_porto_may"
    }
  ],
  invoices: [
    {
      id: "inv_porto_jun",
      cardId: "porto_gold",
      competenceMonth: "2026-06",
      status: "paid",
      reconciliationStatus: "settled",
      invoiceChargesCents: 267210,
      invoicePaymentsCreditsCents: 177141,
      settlementPaymentsCents: 267210,
      amountDueCents: 0,
      totalCents: 0
    },
    {
      id: "inv_porto_may",
      cardId: "porto_gold",
      competenceMonth: "2026-05",
      totalCents: 5000,
      amountDueCents: 5000
    }
  ],
  recurringRules: [],
  installmentPlans: []
};

assert(typeof recon.buildReconciliationReport === "function", "buildReconciliationReport existe");
assert(typeof recon.normalizeReconciliationText === "function", "normalizeReconciliationText existe");

var nub = buildReport(nubankPayload);
var nubReport = nub.report.reconciliationReport;
assert(!!nubReport && nubReport.version === "0.4.0", "relatório 0.4.0 no import report");
assert(nubReport.definitive === false && nubReport.persisted === false, "não persistido nem definitivo");

var junEntry = entryByRef(nubReport, "inv_nub_jun");
assert(junEntry && junEntry.status === STATUS.MATCHED, "fatura paga conciliada (matched)");
assert(junEntry.withinTolerance === true, "diferença de centavos dentro da tolerância");
assert(junEntry.blocking === false, "centavos não bloqueiam");
assert(junEntry.reasonCodes && junEntry.reasonCodes.length > 0, "matched tem reasonCodes");
assert(junEntry.candidateTransactionRefs.indexOf("tx_pay") >= 0, "pagamento é candidato");

var julEntry = entryByRef(nubReport, "inv_nub_jul");
assert(julEntry && julEntry.status === STATUS.OPEN_PROVISIONAL, "fatura aberta não bloqueante");
assert(julEntry.blocking === false, "provisória sem blocking");

var mp = buildReport(mpPayload);
var mpEntry = entryByRef(mp.report.reconciliationReport, "inv_mp");
assert(mpEntry && mpEntry.status === STATUS.CREDIT_BALANCE, "MP saldo positivo = credit_balance");
assert(mpEntry.blocking === false, "saldo credor não bloqueia");

var porto = buildReport(portoPayload);
var portoJun = entryByRef(porto.report.reconciliationReport, "inv_porto_jun");
assert(portoJun && portoJun.status === STATUS.MATCHED, "Porto junho conciliada");
assert(portoJun.candidateTransactionRefs.indexOf("tx_ext_settle") >= 0,
  "liquidação externa é candidata");

var mayEntry = entryByRef(porto.report.reconciliationReport, "inv_porto_may");
var histCandidate = (mayEntry.settlementCandidates || []).filter(function (c) {
  return c.transactionRef === "tx_hist";
})[0];
assert(!histCandidate || histCandidate.score === 0 ||
  (histCandidate.reasonCodes || []).indexOf("historical_payment_excluded") >= 0 ||
  histCandidate.score < 50,
  "pagamento histórico não pontua alto como settlement da fatura atual");

var purchaseScore = recon.scoreInvoiceSettlementCandidate(
  porto.payload.transactions[3],
  porto.payload.invoices[1],
  { registry: CFM.cardSnapshotService.buildCardRegistry(porto.payload.cards) }
);
assert(purchaseScore.score === 0, "compra comum não é candidata a settlement");

assert(!recon.isInvoicePaymentTransaction({ type: "credit_card_purchase", flow: "out" }),
  "compra não é pagamento de fatura");

var countersBefore = JSON.stringify(nub.report.counters);
var nub2 = buildReport(nubankPayload);
assert(JSON.stringify(nub2.report.counters) === countersBefore,
  "contadores inalterados com reconciliationReport");

var forbidden = ["alert(", "confirm(", "prompt(", "window.alert(", "window.confirm(", "window.prompt("];
var reconSrc = fs.readFileSync(path.join(root, "src/utils/import-reconciliation.js"), "utf8");
forbidden.forEach(function (pat) {
  assert(reconSrc.indexOf(pat) < 0, "sem popup nativo: " + pat);
});

if (fails) {
  console.error("\n" + fails + " failure(s)");
  process.exit(1);
}
console.log("\nALL PASS");
