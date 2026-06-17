/**
 * Fase 0.3.6-F — cartões, conciliação sem liquidação no delta, zero bloqueios.
 * Uso: node scripts/test-phase-036f.js
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
load("src/services/classification-rules.service.js");
load("src/services/card-snapshot.service.js");
load("src/schemas/import.schema.js");
load("src/services/import.service.js");

var v = CFM.validators;
var css = CFM.cardSnapshotService;
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

var registry = css.buildCardRegistry([
  { id: "nubank", name: "Nubank" },
  { id: "porto", name: "Porto Seguro" },
  { id: "mp", name: "Mercado Pago" },
  { id: "bb", name: "BB Ourocard" }
]);
var reconCtx = {
  registry: registry,
  isHistoricalPaymentForInvoice: v.isHistoricalPaymentForInvoice
};

/* ── Badge: source como objeto não vira [object Object] ── */
var labelObj = css.getSnapshotSourceLabel(
  css.normalizeSnapshotSourceKey({ type: "import", institution: "nubank" }, "import_json")
);
assert(labelObj === "Snapshot do JSON", "getSnapshotSourceLabel com source objeto");
assert(
  css.getSnapshotSourceLabel("local") === "Snapshot local",
  "label local"
);
assert(
  css.getSnapshotSourceLabel("missing") === "Snapshot ausente",
  "label ausente"
);

/* ── Caso 1: Nubank — liquidação não contamina delta ── */
var nubankInv = {
  id: "inv_nubank",
  externalRef: "inv_nubank",
  cardId: "nubank",
  competenceMonth: "2026-05",
  totalCents: 75246,
  amountDueCents: 75246
};
var nubankTx = [
  {
    type: "credit_card_purchase",
    flow: "out",
    amountCents: 75245,
    competenceMonth: "2026-05",
    invoiceId: "inv_nubank",
    cardId: "nubank"
  },
  {
    type: "credit_card_payment",
    flow: "out",
    amountCents: 275246,
    competenceMonth: "2026-05",
    invoiceId: "inv_nubank",
    cardId: "nubank",
    description: "Pagamento fatura"
  }
];
var nubRecon = css.buildInvoiceReconciliation(nubankInv, nubankTx, reconCtx);
assert(nubRecon.invoiceChargesCents === 75245, "Nubank encargos 75245");
assert(nubRecon.settlementPaymentsCents === 275246, "Nubank liquidação separada");
assert(nubRecon.hasReconciliationGap !== true, "Nubank sem hasReconciliationGap flag");
assert(
  nubRecon.reconciliationStatus === "consistent" ||
  nubRecon.reconciliationStatus === "explained_by_payment",
  "Nubank status consistente/explicado (" + nubRecon.reconciliationStatus + ")"
);
assert(Math.abs(nubRecon.reconciliationDeltaCents) <= 5, "Nubank delta <= 5¢");

/* ── Caso 2: Porto — encargos = total, liquidação externa OK ── */
var portoInv = {
  id: "inv_porto",
  externalRef: "inv_porto",
  cardId: "porto",
  competenceMonth: "2026-05",
  totalCents: 267210,
  amountDueCents: 267210
};
var portoTx = [
  {
    type: "credit_card_purchase",
    flow: "out",
    amountCents: 267210,
    competenceMonth: "2026-05",
    invoiceId: "inv_porto",
    cardId: "porto"
  },
  {
    type: "credit_card_payment",
    flow: "out",
    amountCents: 500000,
    competenceMonth: "2026-05",
    invoiceId: "inv_porto",
    cardId: "porto"
  }
];
var portoRecon = css.buildInvoiceReconciliation(portoInv, portoTx, reconCtx);
assert(portoRecon.reconciliationStatus !== "requires_review", "Porto sem requires_review");
assert(Math.abs(portoRecon.reconciliationDeltaCents) <= 5, "Porto delta <= 5¢");

/* ── Caso 3: Mercado Pago — saldo credor ── */
var mpInv = {
  id: "inv_mp",
  externalRef: "inv_mp",
  cardId: "mp",
  competenceMonth: "2026-05",
  totalCents: 0,
  amountDueCents: 0,
  balanceDirection: "credit",
  creditBalanceCents: 749,
  creditBehavior: "applies_to_next_invoice"
};
var mpTx = [
  {
    type: "credit_card_payment",
    flow: "out",
    amountCents: 9900,
    competenceMonth: "2026-05",
    invoiceId: "inv_mp",
    cardId: "mp",
    description: "Pagamento fatura abril/2026"
  }
];
var mpRecon = css.buildInvoiceReconciliation(mpInv, mpTx, reconCtx);
assert(mpRecon.reconciliationStatus === "credit_balance", "MP status credit_balance");
assert(mpRecon.settlementPaymentsCents === 0, "pagamento histórico abril excluído da liquidação maio");

/* ── Caso 4: Ourocard parcial não bloqueante ── */
var bbInv = {
  id: "inv_bb",
  externalRef: "inv_bb",
  cardId: "bb",
  competenceMonth: "2026-05",
  totalCents: 500000,
  amountDueCents: 500000
};
var bbTx = [
  {
    type: "credit_card_purchase",
    flow: "out",
    amountCents: 100000,
    competenceMonth: "2026-05",
    invoiceId: "inv_bb",
    cardId: "bb"
  },
  {
    type: "credit_card_purchase",
    flow: "out",
    amountCents: 50000,
    competenceMonth: "2026-05",
    cardId: "bb",
    description: "Compra sem ref fatura"
  }
];
var bbRecon = css.buildInvoiceReconciliation(bbInv, bbTx, reconCtx);
assert(bbRecon.isPartial === true, "Ourocard parcial");
assert(bbRecon.reconciliationStatus !== "requires_review", "Ourocard parcial não requires_review");

/* ── Integração: cardSnapshots com source objeto ── */
var payload = v.normalizeImportPayload({
  schemaVersion: "cfm.import.v1",
  source: {
    institution: "Test",
    periodEnd: "2026-05-31",
    rawHash: "sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12"
  },
  cards: [{ id: "nubank", name: "Nubank" }],
  cardSnapshots: [{
    cardExternalRef: "nubank",
    snapshotMonth: "2026-05",
    limitCents: 1245000,
    usedCents: 1060600,
    availableCents: 184400,
    source: { type: "import", label: "app export" },
    confidence: "high"
  }],
  transactions: nubankTx.concat([{
    description: "Transferência mesma titularidade aparente",
    type: "transfer",
    flow: "out",
    amountCents: 10000,
    competenceMonth: "2026-05",
    review: { required: true, reason: "Transferência enviada — mesma titularidade aparente" }
  }]),
  invoices: [nubankInv, {
    id: "inv_stub",
    cardId: "bb",
    competenceMonth: "2026-04",
    isStub: true,
    review: { required: true, reason: "stub" }
  }]
});

var report = imp.buildImportReport("t.json", 100, payload, imp.validateImportPayload(payload));
var card = report.cardSummaries[0];
assert(
  card.snapshotSourceLabel === "Snapshot do JSON" &&
  card.snapshotSourceLabel.indexOf("object") < 0,
  "badge string segura no card summary"
);
assert(report.counters.blockingConfirmCount === 0, "blockingConfirmCount = 0");

console.log(fails === 0 ? "\nALL PASS" : "\nFAILURES: " + fails);
process.exit(fails > 0 ? 1 : 0);
