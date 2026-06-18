/**
 * Fase 0.3.15 — Ações contextuais do importador.
 * Uso: node scripts/test-phase-0.3.15.js
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
var fails = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    fails++;
  } else {
    console.log("OK:", msg);
  }
}

function observationActionsForContext(contextKind) {
  if (contextKind === "repeated_purchase") {
    return {
      allowed: ["Comparar compras", "Marcar como conferido"],
      compare: ["São compras diferentes", "É duplicata", "Revisar depois", "Limpar comparação"],
      forbidden: ["São parcelas relacionadas", "Ver grupo de parcelas", "Parcelas corretas"]
    };
  }
  if (contextKind === "installment_related") {
    var card = sem.getObservationActionLabels("installment_related", "card");
    var compare = sem.getObservationActionLabels("installment_related", "compare_panel");
    return {
      allowed: card,
      compare: compare,
      forbidden: ["São compras diferentes", "É duplicata", "Comparar compras", "Ver grupo de parcelas"]
    };
  }
  return { allowed: [], compare: [], forbidden: [] };
}

/* contextKind + aliases */
assert(sem.getObservationContextKind({ type: "repeated_purchase" }) === "repeated_purchase",
  "alias type repeated_purchase");
assert(sem.getObservationContextKind({ type: "installment_match" }) === "installment_related",
  "alias type installment_match");
assert(sem.getObservationContextKind({ type: "installment_group" }) === "installment_related",
  "alias type installment_group");
assert(sem.getObservationContextKind({ classification: "recurring_candidate" }) === "recurring_candidate",
  "recurring_candidate");

var purchaseSpec = observationActionsForContext("repeated_purchase");
assert(purchaseSpec.forbidden.indexOf("São parcelas relacionadas") >= 0,
  "repeated_purchase: sem ação de parcela na observação");
assert(purchaseSpec.allowed.indexOf("Comparar compras") >= 0,
  "repeated_purchase: Comparar compras");
assert(purchaseSpec.compare.indexOf("É duplicata") >= 0,
  "repeated_purchase: painel com É duplicata");
assert(purchaseSpec.compare.indexOf("São parcelas relacionadas") < 0,
  "repeated_purchase: painel sem São parcelas relacionadas");

var instSpec = observationActionsForContext("installment_related");
assert(instSpec.allowed.indexOf("Comparar este par") >= 0,
  "installment_related: Comparar este par");
assert(instSpec.forbidden.indexOf("São compras diferentes") >= 0,
  "installment_related: sem São compras diferentes");
assert(instSpec.forbidden.indexOf("É duplicata") >= 0,
  "installment_related: sem É duplicata");
assert(instSpec.compare.indexOf("Parcelas corretas") >= 0,
  "installment_related: painel Parcelas corretas");

var purchaseCopy = sem.getObservationUiCopy({ classification: "repeated_purchase" });
assert(purchaseCopy.title === "Compra semelhante encontrada", "copy compra semelhante");
assert(purchaseCopy.description.indexOf("parcel") < 0, "copy compra sem parcelamento");

var instCopy = sem.getObservationUiCopy({ classification: "installment_related" });
assert(instCopy.title === "Parcelas relacionadas", "copy parcelas");
assert(instCopy.description.indexOf("planos consistentes") >= 0, "copy plano consistente");

/* Filtro de grupo usa refs estáveis */
var txs = [
  {
    id: "tx_a",
    externalRef: "ext_a",
    description: "Loja Parcela 1/3",
    amountCents: 5000,
    cardId: "c1",
    installmentPlanExternalRef: "plan_loja",
    competenceMonth: "2026-04"
  },
  {
    id: "tx_b",
    externalRef: "ext_b",
    description: "Loja Parcela 2/3",
    amountCents: 5000,
    cardId: "c1",
    installmentPlanExternalRef: "plan_loja",
    competenceMonth: "2026-05"
  }
];
var plans = [{
  id: "plan_loja",
  externalRef: "plan_loja",
  description: "Loja",
  totalInstallments: 3,
  installmentAmountCents: 5000,
  cardId: "c1"
}];
var obs = sem.annotateObservation({
  index1: 0,
  index2: 1,
  classification: "installment_related",
  pairKey: "inst:test"
}, txs, plans);

assert(obs.contextKind === "installment_related", "annotateObservation: contextKind");
assert(obs.installmentGroupFilter && obs.installmentGroupFilter.groupKey === "plan:plan_loja",
  "filtro: groupKey por planExternalRef");
assert(obs.installmentGroupFilter.transactionRefs.indexOf("tx_a") >= 0,
  "filtro: transactionRefs usa ref estável (id/externalRef)");
assert(String(obs.installmentGroupFilter.groupKey).indexOf("idx:") < 0,
  "filtro: groupKey não usa índice visual");

var enrichedPlan = {
  id: "plan_loja",
  externalRef: "plan_loja",
  planStableRef: "plan_loja",
  groupKey: "plan:plan_loja",
  totalInstallments: 3
};
assert(sem.planMatchesInstallmentGroupFilter(enrichedPlan, obs.installmentGroupFilter),
  "planMatchesInstallmentGroupFilter: plano do grupo");

var payload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Test", documentType: "credit_card_bill" },
  cards: [{ id: "c1", name: "Cartão", lastFour: "1234" }],
  installmentPlans: plans,
  transactions: txs
};
var report = imp.buildImportReport("test-0315.json", 100, payload, { valid: true, warnings: [], itemErrors: [] });
var reportPlan = (report.allInstallmentPlans || [])[0];
assert(reportPlan && reportPlan.groupKey === "plan:plan_loja", "report: plan groupKey enriquecido");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails === 0 ? 0 : 1);
