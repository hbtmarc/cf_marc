/**
 * Fase 0.6.0 — Dashboard financeiro operacional.
 * Uso: node scripts/test-phase-0.6.0.js
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
global.sessionStorage = createMemoryStorage();

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
var rm = CFM.financialReadModel;

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

function activeData() {
  return store.getActiveFinancialData();
}

localStorage.clear();
sessionStorage.clear();

var payload = buildFourCardPayload();
var report = buildReport(payload);
var save = store.saveImportBatch(report, {});
assert(save.ok, "saveImportBatch com fixture 4 cartões");

var data = activeData();
data.enrichedCards = rm.enrichCards(
  data.cards, data.invoices, data.transactions, data.installmentPlans
);

var months = rm.getAvailableCompetenceMonths(data);
assert(months.indexOf("2026-05") >= 0 && months.indexOf("2026-06") >= 0,
  "getAvailableCompetenceMonths inclui maio e junho");
assert(months[0] === "2026-06", "meses ordenados desc (junho primeiro)");

var maySummary = rm.aggregateMonthSummary(data, "2026-05");
assert(maySummary.inCents === 500000 && maySummary.outCents === 30000,
  "aggregateMonthSummary maio: entradas/saídas corretas");
assert(maySummary.netCents === 470000, "aggregateMonthSummary maio: saldo");
assert(maySummary.transactionCount === 2, "aggregateMonthSummary maio: 2 lançamentos");
assert(maySummary.paidInvoiceCount === 1 && maySummary.openInvoiceCount === 0,
  "aggregateMonthSummary maio: fatura paga");

var junSummary = rm.aggregateMonthSummary(data, "2026-06");
assert(junSummary.outCents === 25000,
  "aggregateMonthSummary junho exclui pagamento de fatura (25000, não 40000)");
assert(junSummary.openInvoiceCount === 1 && junSummary.openInvoiceCents === 20000,
  "aggregateMonthSummary junho: fatura aberta");
assert(junSummary.activeRecurringCount === 1 && junSummary.recurringOutCents === 1990,
  "aggregateMonthSummary junho: recorrências ativas");
assert(junSummary.futureInstallmentCount === 1,
  "aggregateMonthSummary junho: parcelas futuras (count)");
var inlinePlans = {
  transactions: data.transactions,
  invoices: data.invoices,
  recurringRules: data.recurringRules,
  installmentPlans: [{
    totalInstallments: 6,
    currentInstallment: 2,
    installmentAmountCents: 5000
  }]
};
var inlineJun = rm.aggregateMonthSummary(inlinePlans, "2026-06");
assert(inlineJun.futureInstallmentCents === 5000,
  "aggregateMonthSummary soma installmentAmountCents em parcelas futuras");

var upcoming = rm.getUpcomingDueItems(data, "2026-06", 10);
assert(upcoming.length >= 3, "getUpcomingDueItems retorna fatura, recorrência e parcela");
assert(upcoming.some(function (i) { return i.type === "invoice"; }), "upcoming inclui fatura aberta");
assert(upcoming.some(function (i) { return i.type === "recurring"; }), "upcoming inclui recorrência");
assert(upcoming.some(function (i) { return i.type === "installment"; }), "upcoming inclui parcela");
for (var u = 1; u < upcoming.length; u++) {
  assert(String(upcoming[u - 1].sortDate) <= String(upcoming[u].sortDate),
    "getUpcomingDueItems ordenado por data");
  if (u === 1) break;
}

var attentionJun = rm.getAttentionCards(data, "2026-06", data.enrichedCards);
assert(attentionJun.length >= 1, "getAttentionCards detecta cartão com fatura aberta");
assert(attentionJun.some(function (c) {
  return c.id === "c1" && c.reasons.indexOf("fatura_aberta") >= 0;
}), "Nubank marcado por fatura aberta em junho");

var highUsagePayload = JSON.parse(JSON.stringify(payload));
highUsagePayload.cardSnapshots[0].usedCents = 950000;
highUsagePayload.cardSnapshots[0].availableCents = 50000;
var highReport = buildReport(highUsagePayload, "high-usage.json");
store.saveImportBatch(highReport, {});
var highData = activeData();
highData.enrichedCards = rm.enrichCards(
  highData.cards, highData.invoices, highData.transactions, highData.installmentPlans
);
var attentionHigh = rm.getAttentionCards(highData, "2026-06", highData.enrichedCards);
assert(attentionHigh.some(function (c) {
  return c.id === "c1" && c.reasons.indexOf("limite_critico") >= 0;
}), "getAttentionCards detecta limite crítico (≥90%)");

var topJun = rm.getTopExpenseGroups(data, "2026-06", 5);
assert(topJun.length === 1 && topJun[0].label === "Compra junho" && topJun[0].amountCents === 25000,
  "getTopExpenseGroups agrupa maior saída de junho");
assert(!topJun.some(function (g) { return /pagamento/i.test(g.label); }),
  "getTopExpenseGroups exclui pagamento de fatura");

rm.setStoredDashboardCompetenceMonth("2026-05");
var modelMay = rm.getFinancialReadModel();
assert(modelMay.dashboard.selectedCompetenceMonth === "2026-05",
  "getFinancialReadModel respeita competência armazenada (maio)");
assert(modelMay.dashboard.summary.outCents === 30000,
  "dashboard maio recalcula saídas");

rm.setStoredDashboardCompetenceMonth("2026-06");
var modelJun = rm.getFinancialReadModel();
assert(modelJun.dashboard.summary.outCents === 25000,
  "trocar competência para junho altera saídas do dashboard");
assert(modelJun.dashboardMonth.outCents === 25000,
  "dashboardMonth compatível com summary selecionado");

var opView = rm.buildDashboardOperationalView(data, "2026-05");
assert(opView.selectedCompetenceMonth === "2026-05", "buildDashboardOperationalView aceita override");
assert(opView.topExpenseGroups[0].label === "Compra maio", "operational view maio: top expense");

assert(rm.isSettlementTransaction({ type: "invoice_payment", flow: "out" }),
  "isSettlementTransaction reconhece pagamento de fatura");
assert(!rm.isCountableOutflow({ type: "invoice_payment", flow: "out", amountCents: 100 }),
  "isCountableOutflow exclui liquidação");

var scanPaths = ["src/pages/dashboard.page.js"];
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
  assert(src.indexOf("data-dashboard-month") >= 0, "dashboard.page.js tem seletor de competência");
  assert(src.indexOf("Próximos vencimentos") >= 0, "dashboard.page.js tem seção vencimentos");
});

console.log(fails === 0 ? "\nALL PASS (phase 0.6.0)" : "\nFAILED: " + fails);
process.exit(fails === 0 ? 0 : 1);
