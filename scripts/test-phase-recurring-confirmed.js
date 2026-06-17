/**
 * Regressão — recorrências confirmadas não geram observação candidata.
 * Uso: node scripts/test-phase-recurring-confirmed.js
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

function assertNotContains(haystack, needle, ctx) {
  assert(String(haystack || "").indexOf(needle) < 0, "não contém \"" + needle + "\" em " + ctx);
}

function assertContains(haystack, needle, ctx) {
  assert(String(haystack || "").indexOf(needle) >= 0, "contém \"" + needle + "\" em " + ctx);
}

function confirmedTx(base, month) {
  return Object.assign({}, base, {
    competenceMonth: month,
    transactionDate: month + "-15",
    recurring: true,
    recurrenceFrequency: "monthly",
    userConfirmedRecurring: true,
    recurrenceStatus: "confirmed_active"
  });
}

function confirmedRule(ref, description, amountCents) {
  return {
    id: ref,
    externalRef: ref,
    description: description,
    expectedAmountCents: amountCents,
    type: "expense",
    flow: "out",
    frequency: "monthly",
    status: "active",
    active: true,
    userConfirmed: true,
    candidate: false,
    review: { required: false }
  };
}

var APPLE_6690_REF = "rr_apple_icloud_6690";
var APPLE_999_REF = "rr_apple_gmail_999";
var IFOOD_REF = "rr_ifood_club_595";

var payload = {
  schemaVersion: "cfm.import.v1",
  source: { institution: "Test Bank", periodStart: "2026-05", periodEnd: "2026-06" },
  accounts: [{ id: "acc1", name: "Conta", externalRef: "acc1" }],
  cards: [],
  invoices: [],
  installmentPlans: [],
  recurringRules: [
    confirmedRule(APPLE_6690_REF, "Apple.Com/Bill", 6690),
    confirmedRule(APPLE_999_REF, "Apple.Com/Bill.", 999),
    confirmedRule(IFOOD_REF, "Ifd*Ifood Club", 595)
  ],
  transactions: [
    confirmedTx({
      description: "Apple.Com/Bill",
      type: "expense",
      flow: "out",
      amountCents: 6690,
      accountId: "acc1",
      recurrenceRuleExternalRef: APPLE_6690_REF
    }, "2026-05"),
    confirmedTx({
      description: "Apple.Com/Bill",
      type: "expense",
      flow: "out",
      amountCents: 6690,
      accountId: "acc1",
      recurrenceRuleExternalRef: APPLE_6690_REF
    }, "2026-06"),
    confirmedTx({
      description: "Apple.Com/Bill.",
      type: "expense",
      flow: "out",
      amountCents: 999,
      accountId: "acc1",
      recurrenceRuleExternalRef: APPLE_999_REF
    }, "2026-05"),
    confirmedTx({
      description: "Apple.Com/Bill.",
      type: "expense",
      flow: "out",
      amountCents: 999,
      accountId: "acc1",
      recurrenceRuleExternalRef: APPLE_999_REF
    }, "2026-06"),
    confirmedTx({
      description: "Ifd*Ifood Club",
      type: "expense",
      flow: "out",
      amountCents: 595,
      accountId: "acc1",
      recurrenceRuleExternalRef: IFOOD_REF
    }, "2026-05"),
    confirmedTx({
      description: "Ifd*Ifood Club",
      type: "expense",
      flow: "out",
      amountCents: 595,
      accountId: "acc1",
      recurrenceRuleExternalRef: IFOOD_REF
    }, "2026-06")
  ]
};

var validation = { valid: true, itemErrors: [], warnings: [] };
var report = imp.buildImportReport("fixture-recurring-confirmed.json", 1000, payload, validation);

function candidateDescriptions() {
  return (report.recurringCandidates || []).map(function (p) {
    return String(p.description1 || p.description || "") + " " +
      String(p.description2 || "");
  }).join(" | ");
}

function ruleDescriptions() {
  return (report.allRecurringRules || []).map(function (r) {
    return String(r.description || "");
  }).join(" | ");
}

assert(sem.isTransactionRecurrenceConfirmed(payload.transactions[0], sem.buildRecurringRuleLookup(payload.recurringRules)),
  "tx Apple 66,90 confirmada");
assert(sem.isRecurringRuleUserConfirmed(payload.recurringRules[0]),
  "regra Apple 66,90 confirmada");

assert((report.recurringCandidates || []).length === 0,
  "nenhuma recorrência candidata em Observações");

assertNotContains(candidateDescriptions(), "Apple.Com/Bill", "Observações recurringCandidates");
assertNotContains(candidateDescriptions(), "Ifd*Ifood Club", "Observações recurringCandidates");
assertContains(ruleDescriptions(), "Apple.Com/Bill", "Recorrências tab");
assertContains(ruleDescriptions(), "Ifd*Ifood Club", "Recorrências tab");

assert(report.counters.attentionSimilarityCount === 0,
  "0 atenções de semelhança");

var apple6690Rule = (report.allRecurringRules || []).filter(function (r) {
  return String(r.description || "").indexOf("Apple.Com/Bill") >= 0 &&
    r.expectedAmountCents === 6690;
})[0];
assert(apple6690Rule && apple6690Rule.isActive, "Apple 66,90 ativa em Recorrências");
assert(apple6690Rule && sem.getRecurringRuleDisplayState(apple6690Rule) === "active",
  "Apple 66,90 display active");

var banner = sem.buildObservationBanner(
  report.counters.blockingSimilarityCount || 0,
  report.counters.attentionSimilarityCount || 0,
  report.counters.informationalSimilarityCount || 0
);
assertNotContains(banner.text, "3 item", "banner sem 3 atenções");
assert(banner.text.indexOf("0 item") >= 0 || banner.text.indexOf("merece(m) atenção e") >= 0,
  "banner coerente com 0 atenções");

assert((report.counters.blockingSimilarityCount || 0) === 0, "0 bloqueantes");

if (fails > 0) {
  console.error("\n" + fails + " failure(s)");
  process.exit(1);
}
console.log("\nALL PASS");
