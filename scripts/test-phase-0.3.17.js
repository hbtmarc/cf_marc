/**
 * Fase 0.3.17 — Conclusão individual de grupos de parcelas.
 * Uso: node scripts/test-phase-0.3.17.js
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

var sem = CFM.importSemantics;
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

var txs = [
  { id: "tx_a", description: "Loja 1/3", amountCents: 5000, cardId: "c1", competenceMonth: "2026-04" },
  { id: "tx_b", description: "Loja 2/3", amountCents: 5000, cardId: "c1", competenceMonth: "2026-05" },
  { id: "tx_c", description: "Outra 1/2", amountCents: 7000, cardId: "c1", competenceMonth: "2026-04" },
  { id: "tx_d", description: "Outra 2/2", amountCents: 7000, cardId: "c1", competenceMonth: "2026-05" }
];

var enrichedTxs = txs.map(function (tx, i) {
  return {
    index: i,
    id: tx.id,
    stableRef: sem.getStableTransactionRef(tx, i),
    description: tx.description,
    amountFmt: fcents(tx.amountCents),
    date: tx.competenceMonth,
    cardName: "Cartão",
    installmentPlanId: ""
  };
});

var obs1 = sem.annotateObservation({
  index1: 0, index2: 1, classification: "installment_related", pairKey: "inst:g1"
}, txs, []);
var obs2 = sem.annotateObservation({
  index1: 2, index2: 3, classification: "installment_related", pairKey: "inst:g2"
}, txs, []);

var filter = sem.buildInstallmentObservationFilter([obs1, obs2], txs, []);
var groups = sem.buildInstallmentDisplayGroups(filter, [], enrichedTxs, []);
assert(groups.length === 2, "dois grupos derivados");

var actions = sem.getInstallmentGroupCardActions(groups[0]);
assert(actions.indexOf("Marcar grupo como concluído") >= 0, "grupo: botão Marcar grupo como concluído");
assert(actions.indexOf("Comparar este par") >= 0, "grupo 2 txs: Comparar este par");

var dismissed = {};
sem.dismissInstallmentGroup(groups[0], dismissed);
assert(groups[0].pairKeys[0] && dismissed[groups[0].pairKeys[0]] === true, "dismiss grupo 1");
assert(!dismissed[groups[1].pairKeys[0]], "grupo 2 intacto");

var active = sem.filterActiveInstallmentGroups(groups, dismissed);
assert(active.length === 1, "após dismiss: 1 grupo ativo");
assert(active[0].pairKeys[0] === groups[1].pairKeys[0], "grupo restante correto");

sem.dismissInstallmentGroup(groups[1], dismissed);
var active2 = sem.filterActiveInstallmentGroups(groups, dismissed);
assert(active2.length === 0, "todos grupos concluídos: lista vazia");

var globalActions = sem.getObservationActionLabels("installment_related", "global_panel");
assert(globalActions.indexOf("Marcar todas como conferidas") >= 0,
  "botão global Marcar todas preservado");

var groupCardLabel = sem.getObservationActionLabels("installment_related", "group_card");
assert(groupCardLabel.indexOf("Marcar grupo como concluído") >= 0,
  "label group_card disponível");

assert(groups[0].groupKey && groups[0].groupKey.indexOf("idx:") !== 0,
  "groupKey estável, não índice visual");
assert(groups[0].pairKeys && groups[0].pairKeys.length, "pairKeys no grupo");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails === 0 ? 0 : 1);
