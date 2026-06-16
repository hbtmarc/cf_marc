/**
 * Schema canônico — cfm.import.v1
 * Validação local no navegador. Sem persistência.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var SCHEMA_VERSION = "cfm.import.v1";

  var VALID_FLOWS = ["in", "out", "neutral"];

  var VALID_TX_TYPES = [
    "income", "expense", "transfer", "credit_card_purchase",
    "credit_card_payment", "adjustment", "fee", "refund"
  ];

  var MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
  var DATE_REGEX  = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  var SHA256_REGEX = /^sha256:[a-f0-9]{64}$/i;

  /* ── helpers ── */
  function isPositiveInteger(v) {
    return typeof v === "number" && Number.isInteger(v) && v > 0;
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  /* ── source ── */
  function validateSource(source, fatal) {
    if (!source || typeof source !== "object") {
      fatal.push("source: objeto obrigatório.");
      return;
    }
    if (!isNonEmptyString(source.institution)) {
      fatal.push("source.institution: nome da instituição é obrigatório.");
    }
    if (!isNonEmptyString(source.documentType)) {
      fatal.push("source.documentType: tipo do documento é obrigatório (ex: bank_statement, credit_card_bill).");
    }
    if (source.periodStart !== undefined && !DATE_REGEX.test(source.periodStart)) {
      fatal.push("source.periodStart: deve ser data válida no formato YYYY-MM-DD.");
    }
    if (source.periodEnd !== undefined && !DATE_REGEX.test(source.periodEnd)) {
      fatal.push("source.periodEnd: deve ser data válida no formato YYYY-MM-DD.");
    }
    if (source.rawHash !== undefined) {
      if (!isNonEmptyString(source.rawHash)) {
        fatal.push("source.rawHash: quando presente, deve ser string não vazia.");
      } else if (!SHA256_REGEX.test(source.rawHash.trim())) {
        fatal.push("source.rawHash: deve ser SHA-256 no formato sha256:<64 hex> (use source.canonicalFingerprint para impressões legíveis).");
      }
    }
    if (source.externalRef !== undefined && !isNonEmptyString(source.externalRef)) {
      fatal.push("source.externalRef: quando presente, deve ser string não vazia.");
    }
  }

  /* ── transaction ── */
  function validateTransaction(tx, index, itemErrors, warnings) {
    var base = "transactions[" + index + "]";

    if (!tx || typeof tx !== "object") {
      itemErrors.push({ index: index, msg: base + ": objeto inválido." });
      return;
    }

    if (!isNonEmptyString(tx.description)) {
      itemErrors.push({ index: index, msg: base + ": description obrigatória." });
    }

    if (!isPositiveInteger(tx.amountCents)) {
      itemErrors.push({ index: index, msg: base + ": amountCents deve ser inteiro positivo (centavos)." });
    }

    if (VALID_FLOWS.indexOf(tx.flow) === -1) {
      itemErrors.push({ index: index, msg: base + ': flow deve ser "in", "out" ou "neutral".' });
    }

    if (!isNonEmptyString(tx.type)) {
      itemErrors.push({ index: index, msg: base + ": type obrigatório — use: " + VALID_TX_TYPES.join(", ") + "." });
    } else if (VALID_TX_TYPES.indexOf(tx.type) === -1) {
      itemErrors.push({ index: index, msg: base + ': type inválido ("' + tx.type + '") — use: ' + VALID_TX_TYPES.join(", ") + "." });
    }

    if (!isNonEmptyString(tx.competenceMonth)) {
      itemErrors.push({ index: index, msg: base + ": competenceMonth obrigatório (formato YYYY-MM)." });
    } else if (!MONTH_REGEX.test(tx.competenceMonth)) {
      itemErrors.push({ index: index, msg: base + ": competenceMonth inválido — use YYYY-MM." });
    }

    /* traceabilidade — aviso, não erro fatal */
    var txSource = tx.source && typeof tx.source === "object" ? tx.source : null;
    var hasTrace = isNonEmptyString(tx.externalRef) ||
      (txSource && isNonEmptyString(txSource.rawHash) && SHA256_REGEX.test(txSource.rawHash.trim())) ||
      (tx.rawHash && SHA256_REGEX.test(String(tx.rawHash).trim())) ||
      (txSource && isNonEmptyString(txSource.canonicalFingerprint)) ||
      (txSource && isNonEmptyString(txSource.rawFingerprint));
    if (!hasTrace) {
      warnings.push(base + ": sem externalRef nem rastreio (rawHash SHA-256 ou fingerprint) — rastreabilidade reduzida.");
    }

    if (tx.rawHash !== undefined && isNonEmptyString(tx.rawHash) && !SHA256_REGEX.test(tx.rawHash.trim())) {
      warnings.push(base + ": rawHash legível será normalizado para source.canonicalFingerprint/rawFingerprint.");
    }
    if (txSource && txSource.rawHash !== undefined && isNonEmptyString(txSource.rawHash) &&
        !SHA256_REGEX.test(txSource.rawHash.trim())) {
      warnings.push(base + ": source.rawHash legível será normalizado para fingerprint.");
    }

    /* revisão solicitada */
    if (tx.review && tx.review.required === true) {
      var reason = isNonEmptyString(tx.review.reason) ? tx.review.reason : "revisão solicitada pela origem";
      warnings.push(base + " pendente de revisão: " + reason + ".");
    }
  }

  /* ── card ── */
  function validateCard(card, index, warnings) {
    if (!card || typeof card !== "object") return;
    var last = card.lastFour !== undefined ? card.lastFour : card.last4;
    if (last !== undefined && String(last).length > 4) {
      warnings.push("cards[" + index + "]: lastFour/last4 deve ter no máximo 4 caracteres.");
    }
  }

  /* ── recurring rule ── */
  function validateRecurringRule(rule, index, warnings) {
    if (!rule || typeof rule !== "object") return;
    var base = "recurringRules[" + index + "]";
    if (!isNonEmptyString(rule.externalRef) && !isNonEmptyString(rule.id)) {
      warnings.push(base + ": externalRef recomendado.");
    }
    if (rule.rawHash !== undefined && isNonEmptyString(rule.rawHash) && !SHA256_REGEX.test(rule.rawHash.trim())) {
      warnings.push(base + ": rawHash legível deve ir em source.canonicalFingerprint.");
    }
    if (rule.amountCents != null && rule.expectedAmountCents == null) {
      warnings.push(base + ": amountCents legado — será migrado para expectedAmountCents.");
    }
    if (rule.cadence) {
      warnings.push(base + ": cadence legado — use frequency.");
    }
  }

  /* ── arrays ── */
  function validateArray(name, arr, fatal) {
    if (arr === undefined) return;
    if (!Array.isArray(arr)) {
      fatal.push(name + ": deve ser um array quando presente.");
    }
  }

  /* ── main ── */
  function validate(data) {
    var fatal     = [];
    var itemErrors = [];
    var warnings  = [];

    if (!data || typeof data !== "object") {
      return { valid: false, fatal: ["Payload deve ser um objeto JSON."], itemErrors: [], warnings: [] };
    }

    if (data.schemaVersion !== SCHEMA_VERSION) {
      fatal.push(
        'schemaVersion deve ser "' + SCHEMA_VERSION + '".' +
        (data.schemaVersion ? ' Recebido: "' + data.schemaVersion + '".' : " Campo ausente.")
      );
    }

    validateSource(data.source, fatal);
    validateArray("accounts",        data.accounts,        fatal);
    validateArray("cards",           data.cards,           fatal);
    validateArray("invoices",        data.invoices,        fatal);
    validateArray("transactions",    data.transactions,    fatal);
    validateArray("installmentPlans",data.installmentPlans,fatal);
    validateArray("recurringRules",  data.recurringRules,  fatal);

    if (Array.isArray(data.transactions)) {
      data.transactions.forEach(function (tx, i) {
        validateTransaction(tx, i, itemErrors, warnings);
      });
    }

    if (Array.isArray(data.cards)) {
      data.cards.forEach(function (card, i) {
        validateCard(card, i, warnings);
      });
    }

    if (Array.isArray(data.recurringRules)) {
      data.recurringRules.forEach(function (rule, i) {
        validateRecurringRule(rule, i, warnings);
      });
    }

    if (data.review !== undefined && typeof data.review !== "object") {
      fatal.push("review: quando presente, deve ser objeto.");
    }

    return {
      valid:      fatal.length === 0,
      fatal:      fatal,
      itemErrors: itemErrors,
      warnings:   warnings
    };
  }

  CFM.importSchema = {
    SCHEMA_VERSION:  SCHEMA_VERSION,
    VALID_FLOWS:     VALID_FLOWS,
    VALID_TX_TYPES:  VALID_TX_TYPES,
    validate:        validate
  };
})(window.CFM);
