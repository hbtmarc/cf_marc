/**
 * Fase 0.3.10 — Interpretação Nubank v2 + regras locais de classificação.
 * Uso: node scripts/test-phase-nubank-v2.js
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
var mcr = CFM.merchantClassificationRules;
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

function cardTitleMain(card) {
  var title = String(card.name || "");
  if (card.lastFourDisplay) return title + card.lastFourDisplay;
  if (card.lastFour) return title + card.lastFour;
  return title;
}

function txByDescription(report, fragment) {
  var f = String(fragment).toLowerCase();
  return report.allTransactions.filter(function (t) {
    return String(t.description || "").toLowerCase().indexOf(f) >= 0;
  })[0];
}

function categoryHintHasDescription(report, fragment) {
  var f = String(fragment).toLowerCase();
  return (report.categoryReviewHints || []).some(function (h) {
    return String(h.description1 || "").toLowerCase().indexOf(f) >= 0;
  });
}

var MERCHANT_CASES = [
  {
    description: "Parcelamento de Compra - Www.F1.Com",
    categoryLabel: "Assinaturas / Streaming",
    needle: "f1.com"
  },
  {
    description: "Ec *T360graus",
    categoryLabel: "Lazer / Turismo",
    needle: "t360graus"
  },
  {
    description: "Ec *Ellisimports",
    categoryLabel: "Tecnologia / Apple",
    needle: "ellisimports"
  },
  {
    description: "Parcelamento de Compra - Ebn *Epidemicsd",
    categoryLabel: "Audiovisual / Áudio",
    needle: "epidemicsd"
  },
  {
    description: "Llcomunidade - Parcela 1/7",
    categoryLabel: "Tecnologia / Aplicativos",
    needle: "llcomunidade"
  }
];

var planRef = "plan_parcelas_loja";
var merchantTxs = MERCHANT_CASES.map(function (mc, i) {
  return {
    description: mc.description,
    type: "credit_card_purchase",
    flow: "out",
    amountCents: 10000 + i,
    competenceMonth: "2026-06",
    cardId: "nubank",
    categoryLabel: "Outros",
    review: { required: false }
  };
});

var payload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Nubank", documentType: "credit_card_bill" },
  cards: [{ id: "nubank", name: "Nubank Cartão de Crédito", cardAliases: ["0070", "0154"] }],
  cardSnapshots: [{
    cardId: "nubank",
    limitCents: 1245000,
    usedCents: 1081300,
    availableCents: 163700,
    snapshotMonth: "2026-06",
    source: "import_json"
  }],
  invoices: [
    {
      id: "inv_jun",
      cardId: "nubank",
      competenceMonth: "2026-06",
      status: "paid",
      totalCents: 7524600,
      amountDueCents: 7524600,
      reconciliationStatus: "settled",
      isWithinReconciliationTolerance: true,
      reconciliationToleranceCents: 10,
      ofxDebitReconciliationDifferenceCents: 6,
      pdfSummaryConfirmed: true,
      csvTransactionsConfirmed: true,
      review: { required: false }
    },
    {
      id: "inv_jul",
      cardId: "nubank",
      competenceMonth: "2026-07",
      status: "open",
      sourceStatus: "provisional",
      replaceWhenClosed: true,
      totalCents: 120000,
      amountDueCents: 120000,
      review: { required: false }
    }
  ],
  transactions: [
    {
      description: "Compra loja",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 50000,
      competenceMonth: "2026-06",
      cardId: "nubank",
      invoiceId: "inv_jun",
      installmentPlanExternalRef: planRef,
      installment: { current: 1, total: 12 },
      review: { required: false }
    },
    {
      description: "Compra loja",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 50000,
      competenceMonth: "2026-07",
      cardId: "nubank",
      invoiceId: "inv_jul",
      installmentPlanExternalRef: planRef,
      installment: { current: 2, total: 12 },
      review: { required: false }
    },
    {
      description: "Ec *Ellisimports - Parcela 1/12",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 83333,
      competenceMonth: "2026-05",
      cardId: "nubank",
      installment: { current: 1, total: 12 },
      review: { required: false }
    },
    {
      description: "Ec *Ellisimports - Parcela 2/12",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 83333,
      competenceMonth: "2026-06",
      cardId: "nubank",
      installment: { current: 2, total: 12 },
      review: { required: false }
    },
    {
      description: "Pagamento recebido",
      type: "credit_card_payment",
      flow: "out",
      amountCents: 7524600,
      competenceMonth: "2026-06",
      cardId: "nubank",
      invoiceId: "inv_jun",
      cashFlowTreatment: "invoice_settlement",
      expenseImpact: "none_when_purchases_are_counted"
    },
    {
      description: "Lançamento genérico",
      type: "expense",
      flow: "out",
      amountCents: 9900,
      competenceMonth: "2026-06",
      cardId: "nubank",
      categoryLabel: "Outros",
      review: { required: false }
    },
    {
      description: "Netflix Assinatura",
      type: "expense",
      flow: "out",
      amountCents: 5590,
      competenceMonth: "2026-05",
      cardId: "nubank",
      review: { required: false }
    },
    {
      description: "Netflix Assinatura",
      type: "expense",
      flow: "out",
      amountCents: 5590,
      competenceMonth: "2026-06",
      cardId: "nubank",
      review: { required: false }
    }
  ].concat(merchantTxs),
  installmentPlans: [{
    id: planRef,
    externalRef: planRef,
    cardId: "nubank",
    description: "Compra loja",
    totalInstallments: 12,
    currentInstallment: 2,
    installmentAmountCents: 50000,
    observedInstallments: [0, 1],
    remainingInstallments: 10,
    futureInstallments: 10,
    review: { required: false }
  }]
};

var report = imp.buildImportReport("nubank-v2-fixture.json", 1000, payload, { valid: true, itemErrors: [], warnings: [] });
var jun = report.allInvoices.filter(function (i) { return i.competenceMonth === "2026-06"; })[0];
var jul = report.allInvoices.filter(function (i) { return i.competenceMonth === "2026-07"; })[0];
var card = report.cardSummaries[0];
var c = report.counters || {};
var blocking = c.blockingSimilarityCount || 0;
var banner = sem.buildObservationBanner(blocking, c.attentionSimilarityCount || 0, c.informationalSimilarityCount || 0);

/* ── Classificação de estabelecimentos ── */
MERCHANT_CASES.forEach(function (mc) {
  var match = mcr.classifyMerchantDescription(mc.description);
  assert(!!match, "regra merchant: " + mc.needle);
  assert(match.categoryLabel === mc.categoryLabel, "categoria " + mc.needle);
  var tx = txByDescription(report, mc.needle);
  assert(!!tx, "tx importada " + mc.needle);
  assert(tx.categoryLabel === mc.categoryLabel, "tx classificada " + mc.needle);
  assert(!categoryHintHasDescription(report, mc.needle), "não revisar " + mc.needle);
});

/* ── Parcelas relacionadas ── */
assert((report.informationalInstallments || []).length >= 1, "parcelas informativas");
(report.informationalInstallments || []).forEach(function (pair, i) {
  assert(pair.tier === "informational" || pair.informational === true, "parcela informativa #" + i);
  assert(!sem.isObservationBlocking(pair, payload.transactions, payload.installmentPlans),
    "parcela não bloqueia #" + i);
  assert(!sem.isObservationAttention(pair, payload.transactions, payload.installmentPlans),
    "parcela não é atenção #" + i);
});

var heuristicPair = {
  index1: payload.transactions.indexOf(payload.transactions.filter(function (t) {
    return t.description.indexOf("Ellisimports - Parcela 1") >= 0;
  })[0]),
  index2: payload.transactions.indexOf(payload.transactions.filter(function (t) {
    return t.description.indexOf("Ellisimports - Parcela 2") >= 0;
  })[0])
};
assert(sem.isInstallmentRelatedPairConsistent(heuristicPair, payload.transactions, payload.installmentPlans),
  "parcelas Ellisimports relacionadas por heurística");

/* ── Faturas ── */
assert(jun && jun.reconciliationUi && jun.reconciliationUi.label === "Conciliada", "Junho conciliada");
assertNotContains(jun.reconciliationMessage, "Conciliação parcial", "mensagem junho");
assert(jul && jul.reconciliationUi && jul.reconciliationUi.label.indexOf("Aberta") >= 0, "Julho provisória");
assertContains(sem.getInvoiceToleranceInformativeLabel(jun, fcents), "Diferença informativa", "tolerância");

/* ── Observações ── */
assert(blocking === 0, "0 bloqueantes");
assertContains(banner.text, "Nenhum bloqueio encontrado", "banner");
assertNotContains(banner.text, "Existem pendências que bloqueiam a importação", "banner bloqueio falso");
assertNotContains(banner.counts, "5 bloqueantes", "contagem falsa");
(report.recurringCandidates || []).forEach(function (pair, i) {
  assert(!sem.isObservationBlocking(pair, payload.transactions, payload.installmentPlans),
    "recorrência não bloqueia #" + i);
});

/* ── Cartão / liquidação ── */
assert(card && card.hasSnapshot === true, "snapshot presente");
assertContains(card.snapshotConsistencyMessage, "Snapshot consistente", "snapshot");
assertNotContains(cardTitleMain(card), "final não informado", "card principal");
assert(!!report.allTransactions.filter(function (t) { return t.isInvoiceSettlement; })[0], "liquidação");
assertContains(sem.getTransactionDisplayType(
  report.allTransactions.filter(function (t) { return t.isInvoiceSettlement; })[0]
).label, "Pagamento de fatura", "rótulo liquidação");

/* ── Resumo ── */
assert(report.overallStatus === "ready", "Arquivo validado");
assert((c.pendingReview || c.blockingConfirmCount || 0) === 0, "0 pendências");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails > 0 ? 1 : 0);
