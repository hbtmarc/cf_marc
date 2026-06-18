/**
 * Fase 0.3.16 — Controle de parcelas relacionadas.
 * Uso: node scripts/test-phase-0.3.16.js
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

var sectionActions = sem.getObservationActionLabels("installment_related", "section");
var cardActions = sem.getObservationActionLabels("installment_related", "card");
var compareActions = sem.getObservationActionLabels("installment_related", "compare_panel");
var globalActions = sem.getObservationActionLabels("installment_related", "global_panel");

assert(sectionActions.indexOf("Ver todas as parcelas relacionadas") >= 0,
  "seção: botão global Ver todas as parcelas relacionadas");
assert(cardActions.indexOf("Comparar este par") >= 0 &&
  cardActions.indexOf("Marcar como conferido") >= 0,
  "card: Comparar este par + Marcar como conferido");
assert(compareActions.indexOf("Parcelas corretas") >= 0 &&
  compareActions.indexOf("São compras diferentes") < 0 &&
  compareActions.indexOf("É duplicata") < 0,
  "painel par: sem compra/duplicata");
assert(globalActions.indexOf("Marcar todas como conferidas") >= 0,
  "painel global: Marcar todas como conferidas");

var txs = [
  {
    id: "tx_a",
    description: "Loja Parcela 1/3",
    amountCents: 5000,
    flow: "out",
    type: "credit_card_purchase",
    cardId: "c1",
    competenceMonth: "2026-04",
    transactionDate: "2026-04-10"
  },
  {
    id: "tx_b",
    description: "Loja Parcela 2/3",
    amountCents: 5000,
    flow: "out",
    type: "credit_card_purchase",
    cardId: "c1",
    competenceMonth: "2026-05",
    transactionDate: "2026-05-10"
  },
  {
    id: "tx_c",
    description: "Outra Loja 1/2",
    amountCents: 7000,
    flow: "out",
    type: "credit_card_purchase",
    cardId: "c1",
    competenceMonth: "2026-04"
  },
  {
    id: "tx_d",
    description: "Outra Loja 2/2",
    amountCents: 7000,
    flow: "out",
    type: "credit_card_purchase",
    cardId: "c1",
    competenceMonth: "2026-05"
  }
];

var obs1 = sem.annotateObservation({
  index1: 0,
  index2: 1,
  classification: "installment_related",
  pairKey: "inst:pair1",
  description1: "Loja Parcela 1/3",
  description2: "Loja Parcela 2/3",
  amountCents: 5000
}, txs, []);

var obs2 = sem.annotateObservation({
  index1: 2,
  index2: 3,
  classification: "installment_related",
  pairKey: "inst:pair2",
  description1: "Outra Loja 1/2",
  description2: "Outra Loja 2/2",
  amountCents: 7000
}, txs, []);

var globalFilter = sem.buildInstallmentObservationFilter([obs1, obs2], txs, []);
assert(globalFilter.mode === "all_related_observations", "filtro global: mode all_related_observations");
assert(globalFilter.pairKeys.length === 2, "filtro global: 2 pairKeys");
assert(globalFilter.transactionRefs.indexOf("tx_a") >= 0, "filtro global: refs de transação");
assert(globalFilter.observationCount === 2, "filtro global: observationCount");

var enrichedTxs = txs.map(function (tx, i) {
  return {
    index: i,
    id: tx.id,
    externalRef: tx.externalRef || "",
    stableRef: sem.getStableTransactionRef(tx, i),
    description: tx.description,
    amountFmt: fcents(tx.amountCents),
    date: tx.transactionDate || tx.competenceMonth,
    cardName: "Cartão",
    installmentPlanId: ""
  };
});

var plans = [{
  id: "unrelated_plan",
  externalRef: "unrelated_plan",
  planStableRef: "unrelated_plan",
  groupKey: "plan:unrelated_plan",
  description: "Plano não relacionado",
  totalInstallments: 12
}];

var matchedPlans = sem.resolvePlansForObservationFilter(globalFilter, plans, enrichedTxs);
assert(matchedPlans.length === 0, "sem plano consolidado: matchedPlans vazio");

var derived = sem.buildObservationDerivedGroups(globalFilter, enrichedTxs);
assert(derived.length === 2, "fallback: 2 grupos derivados das observações");
assert(derived[0].fallbackLabel === "Grupo identificado nas observações", "fallback: label padrão");
assert(derived[0].transactions.length >= 1, "fallback: transações enriquecidas");

assert(sem.matchTransactionRef(enrichedTxs[0], "tx_a"), "matchTransactionRef por id");
assert(sem.matchTransactionRef(enrichedTxs[0], enrichedTxs[0].stableRef), "matchTransactionRef por stableRef");
assert(!sem.matchTransactionRef(enrichedTxs[0], "tx_b"), "matchTransactionRef não confunde pares");

var pairRefs = sem.getObservationTransactionRefs(obs1);
assert(pairRefs.length === 2, "Comparar este par: duas refs");
assert(pairRefs.indexOf("tx_a") >= 0 && pairRefs.indexOf("tx_b") >= 0,
  "Comparar este par: refs corretas");

var dismissed = {};
function isDismissed(pairKey) { return !!dismissed[pairKey]; }
globalFilter.pairKeys.forEach(function (pk) { dismissed[pk] = true; });
var remaining = globalFilter.pairKeys.filter(function (pk) { return !isDismissed(pk); });
assert(remaining.length === 0, "Marcar todas como conferidas: zera pairKeys ativos");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails === 0 ? 0 : 1);
