/**
 * Fase 0.5.4 — Importação idempotente real e bloqueio de entidades legadas.
 * Uso: node scripts/test-phase-0.5.4.js
 */
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");

function load(relativePath) {
  var code = fs.readFileSync(path.join(root, relativePath), "utf8");
  code = code.replace(/window\.CFM/g, "global.CFM");
  eval(code);
}

function createMemoryStorage() {
  var map = {};
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
    setItem: function (k, v) {
      map[k] = String(v);
    },
    removeItem: function (k) {
      delete map[k];
    },
    clear: function () {
      map = {};
    }
  };
}

global.CFM = global.CFM || {};
global.localStorage = createMemoryStorage();

load("src/utils/formatters.js");
load("src/utils/validators.js");
load("src/utils/import-semantics.js");
load("src/utils/import-reconciliation.js");
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");
load("src/schemas/import.schema.js");
load("src/services/import.service.js");
load("src/utils/import-persistence.js");
load("src/utils/import-diff.js");
load("src/services/local-store.service.js");
load("src/services/financial-read-model.service.js");

var v = CFM.validators;
var imp = CFM.importService;
var store = CFM.localStoreService;
var diff = CFM.importDiff;
var readModel = CFM.financialReadModel;

var fails = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

var REAL_HASH = "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
var LEGACY_HASH = "sha256:Banco do Brasil|bank_statement|2026-05-05|196453|out|pagamento fatura nubank";

function resolveFixturePath(fileName) {
  var candidates = [
    path.join(root, fileName),
    path.join(root, "imports-local", fileName),
    path.join(root, "data", "private", fileName),
    path.join(root, "..", fileName)
  ];
  var i;
  for (i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function loadJsonFixture(fileName) {
  var filePath = resolveFixturePath(fileName);
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildReportFromPayload(payload, fileName) {
  var normalized = v.normalizeImportPayload(JSON.parse(JSON.stringify(payload)));
  var validation = imp.validateImportPayload(normalized);
  return imp.buildImportReport(fileName, 2048, normalized, validation);
}

function buildSyntheticOfficialPayload() {
  var cards = [
    { id: "card_nubank_credit", name: "Nubank Crédito", brand: "mastercard", lastFour: "1234", limitCents: 5000000 },
    { id: "card_bb_ourocard_platinum_visa_0040", name: "Ourocard Platinum Visa", brand: "visa", lastFour: "0040", limitCents: 8000000 },
    { id: "card_porto_credit_visa_gold_2128", name: "Porto Bank Visa Gold", brand: "visa", lastFour: "2128", limitCents: 1620000 },
    { id: "card_mercado_pago_3209", name: "Mercado Pago", brand: "visa", lastFour: "3209", limitCents: 900000 }
  ];
  var invoices = [];
  var transactions = [];
  var installmentPlans = [];
  var recurringRules = [];
  var months = ["2026-04", "2026-05"];
  var cardIds = cards.map(function (c) { return c.id; });

  cardIds.forEach(function (cardId, ci) {
    months.forEach(function (month, mi) {
      invoices.push({
        id: "inv_" + cardId + "_" + month,
        externalRef: "inv_" + cardId + "_" + month,
        cardId: cardId,
        competenceMonth: month,
        totalCents: 100000 + ci * 1000 + mi * 100,
        amountDueCents: 100000 + ci * 1000 + mi * 100,
        status: "open"
      });
    });
  });

  var txCount = 0;
  while (transactions.length < 245) {
    var card = cards[txCount % cards.length];
    var month = months[txCount % months.length];
    var day = String((txCount % 27) + 1).padStart(2, "0");
    transactions.push({
      id: "tx_official_" + txCount,
      externalRef: "tx_official_" + txCount,
      description: "Compra oficial " + txCount,
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 1000 + txCount,
      date: month + "-" + day,
      competenceMonth: month,
      cardId: card.id
    });
    txCount++;
  }

  var planCount = 0;
  while (installmentPlans.length < 60) {
    var pCard = cards[planCount % cards.length];
    installmentPlans.push({
      id: "plan_" + planCount,
      externalRef: "plan_" + planCount,
      description: "Parcelamento " + planCount,
      cardId: pCard.id,
      totalInstallments: 6,
      currentInstallment: (planCount % 6) + 1,
      installmentAmountCents: 5000 + planCount
    });
    planCount++;
  }

  var ruleCount = 0;
  while (recurringRules.length < 24) {
    recurringRules.push({
      id: "rule_" + ruleCount,
      externalRef: "rule_" + ruleCount,
      description: "Recorrência " + ruleCount,
      frequency: "monthly",
      amountCents: 990 + ruleCount,
      expectedAmountCents: 990 + ruleCount,
      flow: "out",
      active: true
    });
    ruleCount++;
  }

  return {
    schemaVersion: "cfm.import.v1",
    source: {
      institution: "Multi",
      documentType: "credit_card_bill",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      rawHash: REAL_HASH,
      generatedAt: "2026-06-17T19:49:00.000Z"
    },
    cards: cards,
    invoices: invoices,
    transactions: transactions,
    installmentPlans: installmentPlans,
    recurringRules: recurringRules
  };
}

function buildSyntheticLegacyPayload(officialPayload) {
  var legacyCards = [
    { id: "card_nubank_credit_multi", name: "Nubank Cartão de Crédito", brand: "mastercard", lastFour: "1234" },
    { id: "card_bb_ourocard_platinum_visa_0000", name: "Ourocard Platinum Visa •••• 0000", brand: "visa", lastFour: "0000" },
    { id: "card_porto_seguro_visa_2128", name: "Porto Seguro Cartão", brand: "visa", lastFour: "2128" },
    { id: "card_mercado_pago_3209", name: "Mercado Pago Visa", brand: "visa", lastFour: "3209" }
  ];
  var cardMap = {
    card_nubank_credit: "card_nubank_credit_multi",
    card_bb_ourocard_platinum_visa_0040: "card_bb_ourocard_platinum_visa_0000",
    card_porto_credit_visa_gold_2128: "card_porto_seguro_visa_2128",
    card_mercado_pago_3209: "card_mercado_pago_3209"
  };

  return {
    schemaVersion: "cfm.import.v1",
    source: {
      institution: "Multi",
      documentType: "credit_card_bill",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      rawHash: "sha256:legacy-old-export-marker-not-64hex",
      canonicalFingerprint: LEGACY_HASH.replace(/^sha256:/, ""),
      generatedAt: "2026-05-01T10:00:00.000Z"
    },
    cards: legacyCards,
    invoices: (officialPayload.invoices || []).map(function (inv, idx) {
      return Object.assign({}, inv, {
        id: "legacy_inv_" + idx,
        externalRef: "legacy_inv_" + idx,
        cardId: cardMap[inv.cardId] || inv.cardId
      });
    }),
    transactions: (officialPayload.transactions || []).slice(0, 206).map(function (tx, idx) {
      return Object.assign({}, tx, {
        id: "legacy_tx_" + idx,
        externalRef: "legacy_tx_" + idx,
        cardId: cardMap[tx.cardId] || tx.cardId,
        description: idx % 5 === 0 ? tx.description.replace("Compra", "compra") : tx.description
      });
    }),
    installmentPlans: (officialPayload.installmentPlans || []).slice(0, 40).map(function (plan, idx) {
      return Object.assign({}, plan, {
        id: "legacy_plan_" + idx,
        externalRef: "legacy_plan_" + idx,
        cardId: cardMap[plan.cardId] || plan.cardId
      });
    }),
    recurringRules: (officialPayload.recurringRules || []).slice(0, 20).map(function (rule, idx) {
      return Object.assign({}, rule, {
        id: "legacy_rule_" + idx,
        externalRef: "legacy_rule_" + idx
      });
    })
  };
}

function buildMonthlyFixture() {
  var cards = [{ id: "card_nubank_credit", name: "Nubank Crédito", brand: "mastercard", lastFour: "1234" }];
  var juneTxs = [
    { id: "jun_a", externalRef: "jun_a", description: "Assinatura Junho", type: "credit_card_purchase", flow: "out", amountCents: 999, date: "2026-06-05", competenceMonth: "2026-06", cardId: "card_nubank_credit" },
    { id: "jun_b", externalRef: "jun_b", description: "Mercado Junho", type: "credit_card_purchase", flow: "out", amountCents: 4500, date: "2026-06-12", competenceMonth: "2026-06", cardId: "card_nubank_credit" }
  ];
  return {
    base: {
      schemaVersion: "cfm.import.v1",
      source: { institution: "Nubank", documentType: "credit_card_bill", periodEnd: "2026-06-30", rawHash: REAL_HASH, generatedAt: "2026-06-01T12:00:00.000Z" },
      cards: cards,
      transactions: juneTxs
    },
    incremental: {
      schemaVersion: "cfm.import.v1",
      source: { institution: "Nubank", documentType: "credit_card_bill", periodEnd: "2026-07-31", rawHash: "sha256:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface", generatedAt: "2026-07-01T12:00:00.000Z" },
      cards: cards,
      transactions: [
        juneTxs[0],
        { id: "jun_a_changed", externalRef: "jun_a", description: "Assinatura Junho", type: "credit_card_purchase", flow: "out", amountCents: 1500, date: "2026-06-05", competenceMonth: "2026-06", cardId: "card_nubank_credit" },
        { id: "jul_new", externalRef: "jul_new", description: "Compra Julho Nova", type: "credit_card_purchase", flow: "out", amountCents: 8800, date: "2026-07-08", competenceMonth: "2026-07", cardId: "card_nubank_credit" }
      ]
    }
  };
}

function expectCounts(counts, expected, label) {
  assert(counts.transactions === expected.transactions, label + " transactions=" + expected.transactions);
  assert(counts.invoices === expected.invoices, label + " invoices=" + expected.invoices);
  assert(counts.cards === expected.cards, label + " cards=" + expected.cards);
  assert(counts.recurringRules === expected.recurringRules, label + " recurring=" + expected.recurringRules);
  assert(counts.installmentPlans === expected.installmentPlans, label + " plans=" + expected.installmentPlans);
}

function countDistinctCardSemantics(cards) {
  var seen = {};
  (cards || []).forEach(function (card) {
    seen[diff.buildCardSemanticKey(card)] = true;
  });
  return Object.keys(seen).length;
}

assert(diff.buildCardSemanticKey({ id: "card_nubank_credit_multi", name: "Nubank Cartão de Crédito", lastFour: "1234" }) ===
  diff.buildCardSemanticKey({ id: "card_nubank_credit", name: "Nubank Crédito", lastFour: "1234" }),
  "cartões Nubank legado vs atual equivalentes");

localStorage.clear();

var officialPayload = loadJsonFixture("cfm_20260617_1949.json") || buildSyntheticOfficialPayload();
var officialReport = buildReportFromPayload(officialPayload, "cfm_20260617_1949.json");
var saveOfficial = store.saveImportBatch(officialReport, {});
assert(saveOfficial.ok, "importa JSON oficial");

var expectedOfficial = loadJsonFixture("cfm_20260617_1949.json")
  ? { transactions: 245, invoices: 8, cards: 4, recurringRules: 24, installmentPlans: 60 }
  : { transactions: 245, invoices: 8, cards: 4, recurringRules: 24, installmentPlans: 60 };

var afterOfficial = store.getActiveFinancialData();
expectCounts(afterOfficial.counts, expectedOfficial, "após JSON oficial");

var legacyPayload = loadJsonFixture("cfm_import_v1_cardsnapshots.json") ||
  buildSyntheticLegacyPayload(officialPayload);
var legacyReport = buildReportFromPayload(legacyPayload, "cfm_import_v1_cardsnapshots.json");
var legacyDiff = diff.analyzeImportDiff(legacyReport, {});

assert(legacyDiff.blockedSave, "JSON legado bloqueia save");
assert(
  legacyDiff.status === "legacy_overlap_blocked" || legacyDiff.status === "requires_review",
  "JSON legado classificado como bloqueado/revisão"
);
assert(legacyDiff.safeNewTransactions.length === 0,
  "JSON legado não expõe safeNewTransactions em massa");

var blockedSave = store.saveImportBatch(legacyReport, {});
assert(!blockedSave.ok && (blockedSave.blockedSave || blockedSave.legacyOverlap),
  "tentativa de save legado rejeitada");

var afterLegacyAttempt = store.getActiveFinancialData();
expectCounts(afterLegacyAttempt.counts, expectedOfficial, "base intacta após legado");
assert(countDistinctCardSemantics(afterLegacyAttempt.cards) === expectedOfficial.cards,
  "sem cartões duplicados semanticamente");

var monthly = buildMonthlyFixture();
localStorage.clear();
store.saveImportBatch(buildReportFromPayload(monthly.base, "junho_base.json"), {});
var monthlyReport = buildReportFromPayload(monthly.incremental, "julho_incremental.json");
var monthlyDiff = diff.analyzeImportDiff(monthlyReport, {});

assert(monthlyDiff.changedExisting.length >= 1, "conflito de valor detectado como changed_existing");
assert(monthlyDiff.status === "requires_review", "conflito de valor bloqueia autosave (requires_review)");
assert(monthlyDiff.safeNewTransactions.length <= 1, "no máximo julho novo como candidato seguro");
var conflictSave = store.saveImportBatch(monthlyReport, {});
assert(!conflictSave.ok && conflictSave.requiresReview, "save bloqueado enquanto houver changed_existing");

localStorage.clear();
store.saveImportBatch(buildReportFromPayload({
  schemaVersion: "cfm.import.v1",
  source: { institution: "Nubank", documentType: "credit_card_bill", periodEnd: "2026-06-30", rawHash: REAL_HASH, generatedAt: "2026-06-01T12:00:00.000Z" },
  cards: monthly.base.cards,
  transactions: [monthly.base.transactions[0]]
}, "junho_only.json"), {});
var monthlySafeReport = buildReportFromPayload({
  schemaVersion: "cfm.import.v1",
  source: { institution: "Nubank", documentType: "credit_card_bill", periodEnd: "2026-07-31", rawHash: "sha256:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface", generatedAt: "2026-07-01T12:00:00.000Z" },
  cards: monthly.base.cards,
  transactions: [
    monthly.base.transactions[0],
    { id: "jul_new", externalRef: "jul_new", description: "Compra Julho Nova", type: "credit_card_purchase", flow: "out", amountCents: 8800, date: "2026-07-08", competenceMonth: "2026-07", cardId: "card_nubank_credit" }
  ]
}, "julho_seguro.json");
var monthlySafeDiff = diff.analyzeImportDiff(monthlySafeReport, {});
assert(monthlySafeDiff.status === "incremental" && monthlySafeDiff.safeIncremental, "importação mensal segura classificada");
var beforeMonthly = store.getActiveFinancialData().counts.transactions;
var monthlySave = store.saveImportBatch(monthlySafeReport, {});
assert(monthlySave.ok && monthlySave.incremental, "importação mensal segura salva");
assert(store.getActiveFinancialData().counts.transactions === beforeMonthly + monthlySafeDiff.safeNewTransactions.length,
  "incremental mensal adiciona só novos seguros");
assert(store.getActiveFinancialData().counts.cards === 1, "cartão não duplica no incremental mensal");

var model = readModel.getFinancialReadModel();
assert(model.hasData, "read model disponível após cenários");

var scanPaths = ["src/pages/importer.page.js", "src/utils/import-diff.js", "src/utils/import-persistence.js"];
var nativePatterns = [
  { re: /window\.confirm\s*\(/, label: "window.confirm(" },
  { re: /window\.alert\s*\(/, label: "window.alert(" },
  { re: /window\.prompt\s*\(/, label: "window.prompt(" }
];
scanPaths.forEach(function (rel) {
  var src = fs.readFileSync(path.join(root, rel), "utf8");
  nativePatterns.forEach(function (p) {
    assert(!p.re.test(src), rel + " sem " + p.label);
  });
});

console.log(fails === 0 ? "\nALL PASS (phase 0.5.4)" : "\nFAILED: " + fails);
process.exit(fails === 0 ? 0 : 1);
