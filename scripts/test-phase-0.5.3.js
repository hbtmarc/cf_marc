/**
 * Fase 0.5.3 — Identidade semântica e bloqueio de importação legada.
 * Uso: node scripts/test-phase-0.5.3.js
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

var parsedReal = diff.parseLegacyRawHash(REAL_HASH);
assert(parsedReal.kind === "sha256" && parsedReal.isRealHash === true, "parseLegacyRawHash: sha256 real");

var parsedLegacy = diff.parseLegacyRawHash(LEGACY_HASH);
assert(parsedLegacy.kind === "legacyCanonicalFingerprint", "parseLegacyRawHash: legacy fingerprint");
assert(parsedLegacy.amountCents === 196453, "parseLegacyRawHash extrai amountCents");
assert(parsedLegacy.normalizedDescription.indexOf("pagamento fatura nubank") >= 0,
  "parseLegacyRawHash extrai descrição normalizada");

assert(
  diff.normalizeCardIdentity("card_bb_ourocard_platinum_visa_0000") ===
  diff.normalizeCardIdentity("card_bb_ourocard_platinum_visa_0040"),
  "equivalência BB ourocard 0000 vs 0040"
);
assert(
  diff.normalizeCardIdentity("card_nubank_credit_multi") ===
  diff.normalizeCardIdentity("card_nubank_credit"),
  "equivalência Nubank credit multi vs credit"
);
assert(
  diff.normalizeCardIdentity("card_porto_seguro_visa_2128") ===
  diff.normalizeCardIdentity("card_porto_credit_visa_gold_2128"),
  "equivalência Porto 2128"
);

function txFixture(overrides) {
  return Object.assign({
    id: "tx_id",
    description: "Apple.com/Bill",
    type: "credit_card_purchase",
    flow: "out",
    amountCents: 999,
    date: "2026-05-06",
    competenceMonth: "2026-05",
    cardId: "card_nubank_credit",
    stableRef: "tx_id"
  }, overrides || {});
}

var semKey = diff.buildSemanticTransactionKey(txFixture(), {
  source: { institution: "Nubank", documentType: "bill" }
});
assert(semKey.indexOf("apple com bill") >= 0, "buildSemanticTransactionKey inclui merchant normalizado");
assert(semKey.indexOf("999") >= 0, "buildSemanticTransactionKey inclui amountCents");

function buildReportFromTxs(transactions, fileName, sourceExtra) {
  var payload = {
    schemaVersion: "cfm.import.v1",
    source: Object.assign({
      institution: "Nubank",
      documentType: "bill",
      periodEnd: "2026-06-30",
      rawHash: REAL_HASH,
      generatedAt: "2026-06-01T12:00:00.000Z"
    }, sourceExtra || {}),
    cards: [{ id: "card_nubank_credit", name: "Nubank", lastFour: "1234" }],
    transactions: transactions.map(function (tx) {
      return {
        id: tx.id,
        description: tx.description,
        type: tx.type,
        flow: tx.flow,
        amountCents: tx.amountCents,
        date: tx.date,
        competenceMonth: tx.competenceMonth,
        cardId: tx.cardId
      };
    })
  };
  var normalized = v.normalizeImportPayload(JSON.parse(JSON.stringify(payload)));
  var validation = imp.validateImportPayload(normalized);
  return imp.buildImportReport(fileName || "test.json", 1024, normalized, validation);
}

localStorage.clear();

var consolidatedTxs = [
  txFixture({ id: "new_apple_999", stableRef: "new_apple_999", amountCents: 999, date: "2026-05-06" }),
  txFixture({ id: "new_apple_6690", stableRef: "new_apple_6690", amountCents: 6690, date: "2026-05-07", description: "Apple.com/Bill" }),
  txFixture({ id: "spotify", stableRef: "spotify", amountCents: 2390, date: "2026-05-08", description: "EBN*Spotify" }),
  txFixture({ id: "github", stableRef: "github", amountCents: 13398, date: "2026-05-08", description: "GitHub, Inc." }),
  txFixture({
    id: "bb_pay",
    stableRef: "bb_pay",
    amountCents: 196453,
    date: "2026-05-05",
    description: "Pagamento fatura Nubank",
    type: "credit_card_payment",
    cardId: "card_bb_ourocard_platinum_visa_0040"
  }),
  txFixture({ id: "pan", stableRef: "pan", amountCents: 112185, date: "2026-06-03", description: "Banco Pan Auto Pan", cardId: "card_pan" }),
  txFixture({ id: "kelly1", stableRef: "kelly1", amountCents: 4500, date: "2026-05-10", description: "Kelly Lanchonete" }),
  txFixture({ id: "kelly2", stableRef: "kelly2", amountCents: 5200, date: "2026-05-18", description: "Kelly Lanchonete" })
];

var consolidatedReport = buildReportFromTxs(consolidatedTxs, "consolidado_final.json");
assert(store.saveImportBatch(consolidatedReport, {}).ok, "salva consolidado final");

var reimport = buildReportFromTxs(consolidatedTxs, "consolidado_final.json");
var reDiff = diff.analyzeImportDiff(reimport, {});
assert(reDiff.status === "no_new_occurrences", "reimportar arquivo final → no_new_occurrences");

var legacyTxs = [
  txFixture({ id: "legacy_apple_999", stableRef: "legacy_apple_999", amountCents: 999, date: "2026-05-06", description: "Apple Com Bill", cardId: "card_nubank_credit_multi" }),
  txFixture({ id: "legacy_apple_6690", stableRef: "legacy_apple_6690", amountCents: 6690, date: "2026-05-07", description: "apple.com/bill", cardId: "card_nubank_credit_multi" }),
  txFixture({ id: "legacy_spotify", stableRef: "legacy_spotify", amountCents: 2390, date: "2026-05-08", description: "Spotify", cardId: "card_nubank_credit_multi" }),
  txFixture({ id: "legacy_github", stableRef: "legacy_github", amountCents: 13398, date: "2026-05-08", description: "GitHub, Inc.", cardId: "card_nubank_credit_multi" }),
  txFixture({
    id: "legacy_bb",
    stableRef: "legacy_bb",
    amountCents: 196453,
    date: "2026-05-05",
    description: "pagamento fatura nubank",
    type: "bank_expense",
    flow: "out",
    cardId: "card_bb_ourocard_platinum_visa_0000",
    rawHash: LEGACY_HASH
  }),
  txFixture({ id: "legacy_pan", stableRef: "legacy_pan", amountCents: 112185, date: "2026-06-03", description: "Banco Pan Auto Pan", cardId: "card_pan" }),
  txFixture({ id: "legacy_kelly1", stableRef: "legacy_kelly1", amountCents: 4500, date: "2026-05-10", description: "Kelly Lanchonete", cardId: "card_nubank_credit_multi" }),
  txFixture({ id: "legacy_kelly2", stableRef: "legacy_kelly2", amountCents: 5200, date: "2026-05-18", description: "Kelly Lanchonete", cardId: "card_nubank_credit_multi" })
];

var legacyReport = buildReportFromTxs(legacyTxs, "cfm_import_v1_cardsnapshots.json", {
  rawHash: "sha256:legacy-old-export-marker-not-64hex",
  institution: "Multi"
});
var legacyDiff = diff.classifyImportCompatibility(legacyReport, store.getActiveFinancialData(), {});
assert(legacyDiff.safeNewTransactions.length === 0,
  "arquivo legado sobreposto não gera safeNewTransactions em massa");
assert(
  legacyDiff.status === "legacy_overlap" || legacyDiff.status === "unsafe_legacy_import" ||
    legacyDiff.status === "legacy_overlap_blocked" ||
    legacyDiff.status === "no_new_occurrences",
  "arquivo legado classificado como overlap/sem novidades"
);
assert(legacyDiff.alreadyImportedTransactions.length >= 4,
  "transações conhecidas semanticamente marcadas como já importadas");

var kellyDiff = diff.compareTransactionIdentity(
  { description: "Kelly Lanchonete", amountCents: 4500, date: "2026-05-10", flow: "out", type: "credit_card_purchase", cardId: "c1" },
  { description: "Kelly Lanchonete", amountCents: 5200, date: "2026-05-18", flow: "out", type: "credit_card_purchase", cardId: "c1" },
  { source: { institution: "Nubank" }, storedTransactions: [], strongIndex: {}, semanticIndex: {} }
);
assert(kellyDiff.status === "safe_new", "Kelly Lanchonete com datas/valores diferentes permanece safe_new");

function basePayloadWithExtra(extraTx) {
  return buildReportFromTxs([
    txFixture({ id: "legacy_apple_999", description: "Apple Com Bill", amountCents: 999, date: "2026-05-06", cardId: "card_nubank_credit_multi" }),
    txFixture(extraTx)
  ], "incremental_semantic.json", { rawHash: "sha256:cccdddcccdddcccdddcccdddcccdddcccdddcccdddcccdddcccdddcccdddd" });
}
var incReport = basePayloadWithExtra({
  id: "tx_real_new",
  stableRef: "tx_real_new",
  description: "Compra realmente nova",
  amountCents: 12345,
  date: "2026-06-20",
  competenceMonth: "2026-06",
  cardId: "card_nubank_credit"
});
var incDiff = diff.analyzeImportDiff(incReport, {});
assert(incDiff.status === "incremental", "arquivo com 1 lançamento realmente novo → incremental");
assert(incDiff.safeNewTransactions.length === 1, "somente 1 safeNewTransaction");

var beforeCount = store.getActiveFinancialData().counts.transactions;
var incSave = store.saveImportBatch(incReport, {});
assert(incSave.ok && incSave.incremental, "save incremental ok");
assert(store.getActiveFinancialData().counts.transactions === beforeCount + 1,
  "incremental adiciona apenas 1 transação");

var dupProbe = buildReportFromTxs([
  txFixture({ id: "legacy_apple_999", description: "Apple Com Bill", amountCents: 999, date: "2026-05-06", cardId: "card_nubank_credit_multi" }),
  txFixture({ id: "maybe_dup", description: "Apple Com Bill", amountCents: 999, date: "2026-05-06", cardId: "card_nubank_credit" })
], "dup_probe.json", { rawHash: "sha256:eeefffeeefffeeefffeeefffeeefffeeefffeeefffeeefffeeefffeeefffaaa" });
var dupDiff = diff.analyzeImportDiff(dupProbe, {});
assert(dupDiff.possibleDuplicates.length >= 1 || dupDiff.alreadyImportedTransactions.length >= 1,
  "possível duplicidade detectada");
assert(dupDiff.safeNewTransactions.length === 0, "possible_duplicate não entra em safeNew");

var changedReport = buildReportFromTxs([
  txFixture({ id: "new_apple_999", amountCents: 1500, date: "2026-05-06", description: "Apple.com/Bill" })
], "changed.json", { rawHash: "sha256:aaaabbbbccccddddeeeeffffaaaabbbbccccddddeeeeffffaaaabbbbccccdddd" });
var changedDiff = diff.analyzeImportDiff(changedReport, {});
assert(changedDiff.changedExisting.length === 1, "changed_existing detectado");
assert(changedDiff.safeNewTransactions.length === 0, "changed_existing não vira safe_new");

var model = readModel.getFinancialReadModel();
assert(model.hasData && model.counts.transactions === beforeCount + 1, "read model consolidado sem duplicidade extra");

var scanPaths = [
  "src/pages/importer.page.js",
  "src/utils/import-diff.js"
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

console.log(fails === 0 ? "\nALL PASS (phase 0.5.3)" : "\nFAILED: " + fails);
process.exit(fails === 0 ? 0 : 1);
