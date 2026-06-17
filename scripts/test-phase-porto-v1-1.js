/**
 * Fase 0.3.11 — Semântica Porto v1.1 (faturas, créditos internos, recorrência candidata).
 * Uso: node scripts/test-phase-porto-v1-1.js
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

function assertNotContains(haystack, needle, ctx) {
  assert(String(haystack || "").indexOf(needle) < 0, "não contém \"" + needle + "\" em " + ctx);
}

function assertContains(haystack, needle, ctx) {
  assert(String(haystack || "").indexOf(needle) >= 0, "contém \"" + needle + "\" em " + ctx);
}

function invoiceUiText(inv) {
  var parts = [
    inv.reconciliationUi && inv.reconciliationUi.label,
    inv.reconciliationUi && inv.reconciliationUi.message,
    inv.creditLabel,
    inv.settlementLabelDisplay,
    inv.invoiceDisplay && inv.invoiceDisplay.internalCreditsFmt,
    inv.invoiceDisplay && inv.invoiceDisplay.externalSettlementFmt,
    inv.invoiceDisplay && inv.invoiceDisplay.amountDueFmt
  ];
  (inv.paymentBreakdownRows || []).forEach(function (r) {
    parts.push(r.label, r.fmt);
  });
  return parts.filter(Boolean).join(" | ");
}

var payload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Porto Bank", documentType: "credit_card_bill" },
  cards: [{
    id: "porto_gold",
    name: "Porto Bank Visa Gold",
    lastFour: "2128"
  }],
  cardSnapshots: [{
    cardId: "porto_gold",
    limitCents: 1620000,
    usedCents: 1454131,
    availableCents: 165869,
    snapshotMonth: "2026-06",
    source: "import_json"
  }],
  invoices: [
    {
      id: "inv_porto_jun",
      cardId: "porto_gold",
      competenceMonth: "2026-06",
      status: "paid",
      reconciliationStatus: "settled",
      previousBalanceCents: 177141,
      invoiceChargesCents: 267210,
      invoicePaymentsCreditsCents: 177141,
      statementAmountDueCents: 267210,
      settlementPaymentsCents: 267210,
      amountDueCents: 0,
      totalCents: 0,
      paymentBreakdown: {
        invoiceStatementCreditsCents: 177141,
        externalSettlementPaymentsCents: 267210
      },
      review: { required: false }
    },
    {
      id: "inv_porto_jul",
      cardId: "porto_gold",
      competenceMonth: "2026-07",
      status: "open",
      sourceStatus: "provisional",
      replaceWhenClosed: true,
      previousBalanceCents: 267210,
      invoiceChargesCents: 393737,
      invoicePaymentsCreditsCents: 279433,
      statementAmountDueCents: 381514,
      amountDueCents: 381514,
      totalCents: 381514,
      externalSettlementReference: "BB-REF-2026-07",
      paymentBreakdown: {
        invoiceStatementPaymentCreditsCents: 267210,
        refundCreditsCents: 12223
      },
      review: { required: false }
    }
  ],
  transactions: [
    {
      description: "Compra teste",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 10000,
      competenceMonth: "2026-06",
      cardId: "porto_gold",
      invoiceId: "inv_porto_jun"
    },
    {
      description: "Pagamento fatura junho",
      type: "credit_card_payment",
      flow: "in",
      amountCents: 177141,
      competenceMonth: "2026-06",
      cardId: "porto_gold",
      invoiceId: "inv_porto_jun",
      invoiceBalanceEffect: "decreases_amount_due",
      expenseImpact: "none_when_purchases_are_counted"
    },
    {
      description: "Liquidação externa junho",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 267210,
      competenceMonth: "2026-06",
      cardId: "porto_gold",
      invoiceId: "inv_porto_jun",
      cashFlowTreatment: "invoice_settlement",
      expenseImpact: "none_when_purchases_are_counted"
    },
    {
      description: "Pagamento fatura julho",
      type: "credit_card_payment",
      flow: "in",
      amountCents: 267210,
      competenceMonth: "2026-07",
      cardId: "porto_gold",
      invoiceId: "inv_porto_jul",
      invoiceBalanceEffect: "decreases_amount_due",
      expenseImpact: "none_when_purchases_are_counted"
    }
  ],
  recurringRules: [{
    id: "rr_porto_identidade_protegida_1699_candidate",
    externalRef: "rr_porto_identidade_protegida_1699_candidate",
    description: "Identidade Protegida",
    status: "candidate",
    confidence: "medium",
    frequency: "monthly",
    expectedAmountCents: 1699,
    flow: "out",
    type: "expense",
    cardId: "porto_gold",
    isActive: true
  }]
};

var report = imp.buildImportReport("porto-v1-1-fixture.json", 1000, payload, { valid: true, itemErrors: [], warnings: [] });
var jun = report.allInvoices.filter(function (i) { return i.competenceMonth === "2026-06"; })[0];
var jul = report.allInvoices.filter(function (i) { return i.competenceMonth === "2026-07"; })[0];
var junUi = invoiceUiText(jun);
var julUi = invoiceUiText(jul);
var internalTx = report.allTransactions.filter(function (t) {
  return t.type === "credit_card_payment" && t.flow === "in";
})[0];
var recurring = report.allRecurringRules.filter(function (r) {
  return String(r.description || "").indexOf("Identidade") >= 0;
})[0];

/* Fatura junho */
assertContains(junUi, "Conciliada", "junho conciliada");
assert(jun.invoiceDisplay.amountDueCents === 0, "junho valor R$ 0,00");
assert(jun.invoiceDisplay.internalCreditsCents === 177141, "junho créditos internos");
assert(jun.invoiceDisplay.externalSettlementCents === 267210, "junho liquidação externa");
assertContains(jun.creditLabel, "Créditos internos", "label créditos junho");
assertContains(jun.settlementLabelDisplay, "Liquidação externa", "label liquidação junho");
assertNotContains(junUi, "Liquidação bancária: R$ 1.771,41", "junho sem liquidação errada");
assertNotContains(junUi, "Liquidação bancária", "junho sem liquidação bancária genérica");

/* Fatura julho */
assertContains(julUi, "Aberta", "julho provisória");
assert(jul.invoiceDisplay.amountDueCents === 381514, "julho valor principal");
assert(jul.invoiceDisplay.internalCreditsCents === 279433, "julho créditos/pagamentos");
assert(jul.paymentBreakdownRows.length >= 2, "julho detalhamento créditos");
assertNotContains(julUi, "Liquidação bancária", "julho sem liquidação bancária");

/* Transações */
assert(!!internalTx, "tx crédito interno presente");
assert(internalTx.isInvoiceInternalCredit === true, "tx marcada crédito interno");
assert(!internalTx.isInvoiceSettlement, "crédito interno não é liquidação externa");
var display = sem.getTransactionDisplayType(internalTx);
assertContains(display && display.label, "Crédito na fatura", "badge crédito na fatura");
assert(report.cardSummaries[0].linkedPurchaseCount === 1, "pagamentos não contam como compra");

/* Recorrência candidata */
assert(!!recurring, "recorrência Identidade Protegida");
assert(recurring.recurringDisplay === "candidate", "display candidate");
assert(recurring.isActive !== true, "candidate não ativa");
assert((recurring.recurringBadges || []).some(function (b) { return b.label === "Candidata"; }), "badge Candidata");
assert((recurring.recurringBadges || []).some(function (b) { return b.label === "Atenção"; }), "badge Atenção");
assert((recurring.recurringImpact || {}).blocksImport !== true, "candidate não bloqueia");

/* Regressão resumo */
assert(report.overallStatus === "ready", "arquivo validado");
assert((report.counters.blockingSimilarityCount || 0) === 0, "0 bloqueantes observações");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails > 0 ? 1 : 0);
