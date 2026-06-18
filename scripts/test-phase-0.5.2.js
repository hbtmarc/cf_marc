/**
 * Fase 0.5.2 — Reimportação inteligente e importação incremental.
 * Uso: node scripts/test-phase-0.5.2.js
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

var HASH = "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function basePayload(extraTx) {
  var txs = [
    {
      id: "tx_a",
      description: "Compra A",
      type: "credit_card_purchase",
      flow: "out",
      amountCents: 10000,
      competenceMonth: "2026-06",
      cardId: "c1",
      date: "2026-06-05"
    }
  ];
  if (extraTx) txs.push(extraTx);
  return {
    schemaVersion: "cfm.import.v1",
    source: {
      institution: "Test",
      documentType: "bill",
      periodEnd: "2026-06-30",
      rawHash: HASH,
      generatedAt: "2026-06-01T12:00:00.000Z"
    },
    cards: [{ id: "c1", name: "Cartão 1", lastFour: "1111" }],
    cardSnapshots: [{
      cardId: "c1",
      snapshotMonth: "2026-06",
      limitCents: 100000,
      usedCents: 50000,
      availableCents: 50000,
      source: "import_json"
    }],
    invoices: [{
      id: "inv_jun",
      cardId: "c1",
      competenceMonth: "2026-06",
      status: "open",
      totalCents: 10000,
      amountDueCents: 10000
    }],
    transactions: txs
  };
}

function buildReport(payload, fileName) {
  var normalized = v.normalizeImportPayload(JSON.parse(JSON.stringify(payload)));
  var validation = imp.validateImportPayload(normalized);
  return imp.buildImportReport(fileName || "file-a.json", 1024, normalized, validation);
}

localStorage.clear();

var reportA = buildReport(basePayload(), "cfm_20260617_1949.json");
var save1 = store.saveImportBatch(reportA, {});
assert(save1.ok, "primeira importação ok");

var diffSame = diff.analyzeImportDiff(reportA, {});
assert(diffSame.status === "no_new_occurrences", "mesmo arquivo → no_new_occurrences");

var saveSame = store.saveImportBatch(reportA, {});
assert(saveSame.noNewOccurrences === true, "segunda gravação do mesmo arquivo não salva");

var reportAlias = buildReport(basePayload(), "outro_nome.json");
var diffAlias = diff.analyzeImportDiff(reportAlias, {});
assert(diffAlias.status === "no_new_occurrences", "mesmo conteúdo com nome diferente → no_new_occurrences");

var payloadNew = basePayload({
  id: "tx_b",
  description: "Compra B",
  type: "credit_card_purchase",
  flow: "out",
  amountCents: 5000,
  competenceMonth: "2026-06",
  cardId: "c1",
  date: "2026-06-12"
});
payloadNew.source.rawHash = "sha256:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface";
var reportNew = buildReport(payloadNew, "incremental.json");
var diffNew = diff.analyzeImportDiff(reportNew, {});
assert(diffNew.status === "incremental", "arquivo com transação nova → incremental");
assert(diffNew.newTransactions.length === 1, "incrementalImport.newTransactions.length === 1");
assert(diffNew.newTransactions[0].id === "tx_b" || diffNew.newTransactions[0].stableRef === "tx_b",
  "nova transação identificada como tx_b");

var display = diff.buildIncrementalDisplayReport(reportNew, diffNew);
assert(display.allTransactions.length === 1, "relatório incremental exibe só a nova transação");

var incSave = store.saveImportBatch(reportNew, {});
assert(incSave.ok && incSave.incremental, "confirmação incremental ok");
assert(incSave.addedCounts.transactions === 1, "incremental adiciona 1 transação");

var consolidated = store.getActiveFinancialData();
assert(consolidated.counts.transactions === 2, "store consolidado com 2 transações");
assert(Object.keys(store.loadAppData().transactions).length === 2, "sem duplicidade de transações");

var payloadChanged = basePayload();
payloadChanged.transactions[0].amountCents = 15000;
payloadChanged.source.rawHash = "sha256:aaaabbbbccccddddeeeeffffaaaabbbbccccddddeeeeffffaaaabbbbccccdddd";
var reportChanged = buildReport(payloadChanged, "changed.json");
var diffChanged = diff.analyzeImportDiff(reportChanged, {});
assert(diffChanged.newTransactions.length === 0, "valor alterado não vira transação nova");
assert(diffChanged.changedExisting.length === 1, "mesmo externalRef com valor alterado → changed_existing");

var model = readModel.getFinancialReadModel();
assert(model.hasData && model.counts.transactions === 2, "read model consolidado após incremental");
assert(model.enrichedCards.length === 1, "cartões consolidados sem duplicidade");

var scanPaths = [
  "src/pages/importer.page.js",
  "src/utils/import-diff.js",
  "src/services/local-store.service.js"
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

console.log(fails === 0 ? "\nALL PASS (phase 0.5.2)" : "\nFAILED: " + fails);
process.exit(fails === 0 ? 0 : 1);
