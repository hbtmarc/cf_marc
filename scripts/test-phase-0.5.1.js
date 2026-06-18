/**
 * Fase 0.5.1 — Consumo dos dados importados nas páginas principais.
 * Uso: node scripts/test-phase-0.5.1.js
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
load("src/services/financial-read-model.service.js");

var v = CFM.validators;
var imp = CFM.importService;
var store = CFM.localStoreService;
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

function buildFourCardPayload() {
  return {
    schemaVersion: "cfm.import.v1",
    generatedAt: "2026-06-01T12:00:00.000Z",
    source: {
      institution: "Multi",
      documentType: "bill",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      rawHash: "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      generatedAt: "2026-06-01T12:00:00.000Z"
    },
    cards: [
      { id: "c1", name: "Nubank", brand: "Mastercard", lastFour: "1234" },
      { id: "c2", name: "Porto", brand: "Visa", lastFour: "5678" },
      { id: "c3", name: "BB Ouro", brand: "Visa", lastFour: "9012" },
      { id: "c4", name: "Mercado Pago", brand: "Mastercard", lastFour: "3456" }
    ],
    cardSnapshots: [
      { cardId: "c1", snapshotMonth: "2026-06", limitCents: 1000000, usedCents: 400000, availableCents: 600000, source: "import_json" },
      { cardId: "c2", snapshotMonth: "2026-06", limitCents: 2000000, usedCents: 500000, availableCents: 1500000, source: "import_json" },
      { cardId: "c3", snapshotMonth: "2026-06", limitCents: 800000, usedCents: 200000, availableCents: 600000, source: "import_json" },
      { cardId: "c4", snapshotMonth: "2026-06", limitCents: 500000, usedCents: 100000, availableCents: 400000, source: "import_json" }
    ],
    invoices: [
      { id: "inv_apr_c1", cardId: "c1", competenceMonth: "2026-04", status: "paid", totalCents: 10000, amountDueCents: 0 },
      { id: "inv_may_c1", cardId: "c1", competenceMonth: "2026-05", status: "paid", totalCents: 15000, amountDueCents: 0 },
      { id: "inv_jun_c1", cardId: "c1", competenceMonth: "2026-06", status: "open", totalCents: 20000, amountDueCents: 20000 }
    ],
    transactions: [
      { id: "tx_in_may", description: "Salário", type: "income", flow: "in", amountCents: 500000, competenceMonth: "2026-05", date: "2026-05-05" },
      { id: "tx_out_may", description: "Compra maio", type: "credit_card_purchase", flow: "out", amountCents: 30000, competenceMonth: "2026-05", cardId: "c1", date: "2026-05-10" },
      { id: "tx_out_jun", description: "Compra junho", type: "credit_card_purchase", flow: "out", amountCents: 25000, competenceMonth: "2026-06", cardId: "c1", date: "2026-06-10" },
      { id: "tx_pay_jun", description: "Pagamento fatura", type: "invoice_payment", flow: "out", amountCents: 15000, competenceMonth: "2026-06", cardId: "c1", date: "2026-06-15" }
    ],
    installmentPlans: [
      { id: "plan_c2", description: "Parcelamento", cardId: "c2", totalInstallments: 6, currentInstallment: 2, installmentAmountCents: 5000 }
    ],
    recurringRules: [
      { id: "rule_1", description: "Assinatura", frequency: "monthly", expectedAmountCents: 1990, flow: "out", active: true }
    ]
  };
}

function buildReport(payload, fileName) {
  var normalized = v.normalizeImportPayload(JSON.parse(JSON.stringify(payload)));
  var validation = imp.validateImportPayload(normalized);
  return imp.buildImportReport(fileName || "four-cards.json", 4096, normalized, validation);
}

localStorage.clear();

var payload = buildFourCardPayload();
var report = buildReport(payload);
var save = store.saveImportBatch(report, {});
assert(save.ok, "saveImportBatch com 4 cartões");

var active = store.getActiveFinancialData();
assert(Array.isArray(active.cards), "cards retorna array");
assert(Array.isArray(active.transactions), "transactions retorna array");
assert(Array.isArray(active.batches), "batches retorna array");
assert(active.activeBatch && active.activeBatch.id, "activeBatch presente");
assert(active.hasData, "hasData true após importação");
assert(active.cards.length === 4, "getActiveFinancialData retorna 4 cartões");
assert(active.counts.cards === 4, "counts.cards === 4");

var model = readModel.getFinancialReadModel();
assert(model.hasData, "read model detecta lote ativo");
assert(model.enrichedCards.length === 4, "enrichedCards retorna 4 cartões");
assert(model.monthlyHistory.length >= 2, "histórico gera meses a partir de lançamentos/faturas");
assert(model.dashboardMonth, "dashboardMonth definido");
assert(model.dashboardMonth.outCents === 25000,
  "dashboard exclui pagamento de fatura da saída (25000, não 40000)");

var may = model.monthlyHistory.filter(function (m) { return m.competenceMonth === "2026-05"; })[0];
assert(may && may.inCents === 500000 && may.outCents === 30000, "histórico maio com entradas/saídas corretas");

var reloaded = store.loadAppData();
assert(reloaded.activeBatchId === save.batchId, "reload simulado preserva activeBatchId");
assert(Object.keys(reloaded.cards).length === 4, "reload simulado preserva 4 cartões");

var dup = store.saveImportBatch(report, {});
assert(dup.duplicate === true, "importação duplicada não duplica entidades");
assert(store.getActiveFinancialData().cards.length === 4, "ainda 4 cartões após tentativa duplicada");

var scanPaths = [
  "src/pages/dashboard.page.js",
  "src/pages/cards.page.js",
  "src/pages/history.page.js",
  "src/services/financial-read-model.service.js"
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

assert(CFM.localStore === CFM.localStoreService, "alias CFM.localStore disponível");

console.log(fails === 0 ? "\nALL PASS (phase 0.5.1)" : "\nFAILED: " + fails);
process.exit(fails === 0 ? 0 : 1);
