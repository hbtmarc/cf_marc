/**
 * Fase 0.5.0 — Confirmação de importação e persistência local.
 * Uso: node scripts/test-phase-0.5.0.js
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
load("src/services/local-store.service.js");

var v = CFM.validators;
var imp = CFM.importService;
var persist = CFM.importPersistence;
var store = CFM.localStoreService;

var fails = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

var fixturePayload = {
  schemaVersion: "cfm.import.v1",
  generatedAt: "2026-06-01T12:00:00.000Z",
  source: {
    institution: "Nubank",
    documentType: "bill",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    rawHash: "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    generatedAt: "2026-06-01T12:00:00.000Z"
  },
  cards: [{ id: "nubank", name: "Nubank", externalRef: "nubank" }],
  cardSnapshots: [{
    cardId: "nubank",
    snapshotMonth: "2026-06",
    limitCents: 1000000,
    usedCents: 500000,
    availableCents: 500000,
    source: "import_json"
  }],
  invoices: [{
    id: "inv_jun",
    cardId: "nubank",
    competenceMonth: "2026-06",
    status: "open",
    totalCents: 50000,
    amountDueCents: 50000
  }],
  transactions: [
    {
      id: "tx_keep",
      description: "Compra mantida",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 25000,
      competenceMonth: "2026-06",
      invoiceId: "inv_jun",
      cardId: "nubank",
      date: "2026-06-10"
    },
    {
      id: "tx_ignore",
      description: "Compra ignorada",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 25000,
      competenceMonth: "2026-06",
      invoiceId: "inv_jun",
      cardId: "nubank",
      date: "2026-06-11"
    }
  ],
  installmentPlans: [{
    id: "plan_1",
    description: "Parcelamento teste",
    cardId: "nubank",
    totalInstallments: 3,
    currentInstallment: 1,
    installmentAmountCents: 10000
  }],
  recurringRules: [{
    id: "rule_1",
    description: "Assinatura teste",
    frequency: "monthly",
    expectedAmountCents: 1990,
    flow: "out",
    active: true
  }]
};

function buildReport() {
  var snapshot = JSON.stringify(fixturePayload);
  var normalized = v.normalizeImportPayload(JSON.parse(snapshot));
  var validation = imp.validateImportPayload(normalized);
  var report = imp.buildImportReport("phase-0.5.0-fixture.json", 2048, normalized, validation);
  assert(JSON.stringify(fixturePayload) === snapshot, "JSON original permanece intacto após buildImportReport");
  return report;
}

localStorage.clear();
assert(store.getStorageVersion() === "cfm.local.v1", "versão de storage cfm.local.v1");

var report = buildReport();
assert(report.overallStatus === "ready" || report.overallStatus === "has_pending",
  "relatório compatível com fixture validado");

var signature = persist.buildBatchSignature(report);
assert(signature.indexOf("phase-0.5.0-fixture.json") >= 0, "assinatura inclui fileName");
assert(signature.indexOf("deadbeefdeadbeef") >= 0, "assinatura inclui hash/fingerprint");

var txKeepRef = (report.allTransactions || []).filter(function (tx) {
  return tx.description === "Compra mantida";
})[0];
var txIgnoreRef = (report.allTransactions || []).filter(function (tx) {
  return tx.description === "Compra ignorada";
})[0];
assert(txKeepRef && txKeepRef.stableRef, "transação mantida com stableRef");
assert(txIgnoreRef && txIgnoreRef.stableRef, "transação ignorada com stableRef");

var payload = persist.buildImportBatchPayload(report, {
  ignoredTransactions: (function () {
    var m = {};
    m[txIgnoreRef.stableRef] = true;
    return m;
  })(),
  dismissedObservations: { "obs:test": true }
});

assert(payload.batch && payload.batch.counts, "payload com metadados e contadores");
assert(payload.batch.counts.transactions === 1, "contador de lançamentos exclui ignorada");
assert(!payload.transactions[txIgnoreRef.stableRef], "transação ignorada fora dos lançamentos ativos");
assert(payload.transactions[txKeepRef.stableRef], "transação mantida presente no payload");
assert(payload.batch.counts.cards >= 1, "contador de cartões presente");
assert(payload.batch.counts.invoices >= 1, "contador de faturas presente");
assert(payload.reviewHistory.dismissedObservationKeys.indexOf("obs:test") >= 0,
  "observações conferidas no histórico leve");

var save1 = store.saveImportBatch(report, {
  ignoredTransactions: (function () {
    var m = {};
    m[txIgnoreRef.stableRef] = true;
    return m;
  })()
});
assert(save1.ok, "primeira gravação saveImportBatch ok");
assert(save1.counts.transactions === 1, "contadores salvos refletem ignoradas");
assert(store.hasImportBatch(signature), "hasImportBatch detecta assinatura existente");

var saveDup = store.saveImportBatch(report, {});
assert(saveDup.duplicate === true, "segunda gravação sinaliza duplicidade sem duplicar silenciosamente");

var activeBefore = store.getActiveFinancialData();
assert(activeBefore.counts.transactions === 1, "dados ativos com um lançamento após deduplicação");

var replace = store.replaceImportBatch(signature, report, {});
assert(replace.ok && replace.replaced, "replaceImportBatch substitui lote existente");
var activeAfterReplace = store.getActiveFinancialData();
assert(activeAfterReplace.counts.transactions === 2,
  "substituição passa a incluir lançamentos não ignorados (2 txs)");

var batches = store.getImportBatches();
assert(batches.length === 1, "apenas um lote após substituição");

var appData = store.loadAppData();
assert(appData.version === "cfm.local.v1", "loadAppData preserva versão");
assert(Object.keys(appData.transactions).length === 2, "store consolidado com transações do lote ativo");

/* Anti-native em arquivos novos/alterados da fase */
var scanPaths = [
  "src/pages/importer.page.js",
  "src/services/local-store.service.js",
  "src/utils/import-persistence.js"
];
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

var hashOrFingerprint = report.source.rawHash || report.source.canonicalFingerprint || "";
assert(hashOrFingerprint.indexOf("deadbeef") >= 0,
  "report.source inclui rawHash ou canonicalFingerprint para assinatura");

console.log(fails === 0 ? "\nALL PASS (phase 0.5.0)" : "\nFAILED: " + fails);
process.exit(fails === 0 ? 0 : 1);
