/**
 * Contrato canônico cfm.import.v1 — Fase 0.3.9
 * Validação objetiva para importador + Gerador JSON.
 * Sem persistência. Compatível com navegador (CFM) e Node (eval).
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var SCHEMA_VERSION = "cfm.import.v1";
  var SHA256_REGEX = /^sha256:[a-f0-9]{64}$/i;
  var MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
  var DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var VALID_FLOWS = ["in", "out", "neutral"];
  var VALID_TX_TYPES = [
    "income", "expense", "transfer", "credit_card_purchase",
    "credit_card_payment", "adjustment", "fee", "refund"
  ];
  var RECURRING_CANONICAL_FIELDS = [
    "externalRef", "description", "type", "flow", "frequency",
    "expectedAmountCents", "categoryLabel", "startCompetenceMonth",
    "sourcePattern", "sourceInstitution", "review"
  ];
  var FORBIDDEN_ROOT_KEYS = ["cpf", "ssn", "fullCardNumber", "cardNumber", "password", "pin"];

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  function isNonNegativeInt(v) {
    return typeof v === "number" && Number.isInteger(v) && v >= 0;
  }

  function isPositiveInt(v) {
    return typeof v === "number" && Number.isInteger(v) && v > 0;
  }

  function entityPath(name, index, id) {
    var base = name + "[" + index + "]";
    return id ? base + " (" + id + ")" : base;
  }

  function makeIssue(code, entity, id, message, generatorFix, severity) {
    return {
      code: code,
      entity: entity,
      id: id || "",
      message: message,
      generatorFix: generatorFix || "",
      severity: severity || "blocking"
    };
  }

  function pushIssue(list, issue) {
    list.push(issue);
  }

  function buildCardRefMap(cards) {
    var map = {};
    (cards || []).forEach(function (c) {
      if (!c) return;
      if (c.id) map[c.id] = c.id;
      if (c.externalRef) map[c.externalRef] = c.id || c.externalRef;
    });
    return map;
  }

  function snapshotMatchesCard(snap, card, cardRefs) {
    if (!snap || !card) return false;
    var cardId = snap.cardId || "";
    var ext = snap.cardExternalRef || snap.cardRef || "";
    if (cardId && (card.id === cardId || cardRefs[cardId])) return true;
    if (ext && (card.externalRef === ext || card.id === ext || cardRefs[ext])) return true;
    return false;
  }

  function looksLikeFullCardNumber(value) {
    if (!isNonEmptyString(value)) return false;
    var digits = String(value).replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19;
  }

  function validateRoot(payload, blocking, warnings, fixes) {
    if (!payload || typeof payload !== "object") {
      pushIssue(blocking, makeIssue(
        "PAYLOAD_INVALID",
        "root",
        "",
        "Payload deve ser um objeto JSON.",
        "Emitir um objeto JSON raiz válido.",
        "blocking"
      ));
      return;
    }

    if (payload.schemaVersion !== SCHEMA_VERSION) {
      pushIssue(blocking, makeIssue(
        "SCHEMA_VERSION",
        "schemaVersion",
        "",
        'schemaVersion deve ser "' + SCHEMA_VERSION + '".',
        'Definir schemaVersion exatamente como "' + SCHEMA_VERSION + '".',
        "blocking"
      ));
    }

    FORBIDDEN_ROOT_KEYS.forEach(function (key) {
      if (payload[key] !== undefined) {
        pushIssue(blocking, makeIssue(
          "FORBIDDEN_FIELD",
          "root." + key,
          "",
          "Campo proibido na raiz: " + key + ".",
          "Remover campo sensível/proibido " + key + " do JSON exportado.",
          "blocking"
        ));
      }
    });

    ["accounts", "cards", "cardSnapshots", "invoices", "transactions",
      "installmentPlans", "recurringRules"].forEach(function (name) {
      if (payload[name] !== undefined && !Array.isArray(payload[name])) {
        pushIssue(blocking, makeIssue(
          "ARRAY_EXPECTED",
          name,
          "",
          name + " deve ser array quando presente.",
          "Emitir " + name + " como array (use [] se vazio).",
          "blocking"
        ));
      }
    });
  }

  function validateSource(source, blocking, warnings, fixes) {
    if (!source || typeof source !== "object") {
      pushIssue(blocking, makeIssue(
        "SOURCE_MISSING",
        "source",
        "",
        "Objeto source é obrigatório.",
        "Incluir source com institution, documentType e metadados de exportação.",
        "blocking"
      ));
      return;
    }

    if (!isNonEmptyString(source.institution)) {
      pushIssue(blocking, makeIssue(
        "SOURCE_INSTITUTION",
        "source.institution",
        "",
        "source.institution é obrigatório.",
        "Preencher source.institution com nome da instituição.",
        "blocking"
      ));
    }

    if (!isNonEmptyString(source.documentType)) {
      pushIssue(blocking, makeIssue(
        "SOURCE_DOCUMENT_TYPE",
        "source.documentType",
        "",
        "source.documentType é obrigatório.",
        "Preencher source.documentType (ex.: credit_card_bill, bank_statement).",
        "blocking"
      ));
    }

    if (source.rawHash !== undefined && isNonEmptyString(source.rawHash) &&
        !SHA256_REGEX.test(source.rawHash.trim())) {
      pushIssue(blocking, makeIssue(
        "SOURCE_RAW_HASH_FORMAT",
        "source.rawHash",
        "",
        "source.rawHash deve ser sha256:<64 hex>.",
        "Mover impressão legível de source.rawHash para source.canonicalFingerprint e manter rawHash apenas como SHA-256.",
        "blocking"
      ));
    }

    if (source.periodStart !== undefined && !DATE_REGEX.test(source.periodStart)) {
      pushIssue(warnings, makeIssue(
        "SOURCE_PERIOD",
        "source.periodStart",
        "",
        "source.periodStart deve usar YYYY-MM-DD.",
        "Normalizar source.periodStart para YYYY-MM-DD.",
        "warning"
      ));
    }
  }

  function validateCards(cards, blocking, warnings, fixes) {
    (cards || []).forEach(function (card, i) {
      if (!card || typeof card !== "object") return;
      var path = entityPath("cards", i, card.id);
      if (!isNonEmptyString(card.id)) {
        pushIssue(blocking, makeIssue(
          "CARD_ID",
          path,
          "",
          "cards[].id deve ser string estável não vazia.",
          "Emitir cards[].id estável para cada cartão.",
          "blocking"
        ));
      }
      var last = card.lastFour !== undefined ? card.lastFour : card.last4;
      if (last !== undefined) {
        if (String(last).length > 4) {
          pushIssue(blocking, makeIssue(
            "CARD_LAST4",
            path + ".lastFour",
            card.id || "",
            "lastFour/last4 deve ter no máximo 4 caracteres.",
            "Enviar apenas os 4 últimos dígitos em cards[].lastFour.",
            "blocking"
          ));
        }
        if (looksLikeFullCardNumber(last)) {
          pushIssue(blocking, makeIssue(
            "CARD_FULL_NUMBER",
            path + ".lastFour",
            card.id || "",
            "Número completo de cartão detectado em lastFour.",
            "Nunca emitir número completo — usar apenas lastFour com 4 dígitos.",
            "blocking"
          ));
        }
      }
      if (card.usedCents != null || card.availableCents != null) {
        pushIssue(warnings, makeIssue(
          "CARD_POSITION_ON_CARD",
          path,
          card.id || "",
          "Limite/usado/disponível não devem ficar em cards[] — use cardSnapshots[].",
          "Mover posição de limite para cardSnapshots[]; manter cards[] apenas como cadastro estrutural.",
          "warning"
        ));
      }
    });
  }

  function validateCardSnapshots(payload, blocking, warnings, fixes) {
    var cards = payload.cards || [];
    var cardRefs = buildCardRefMap(cards);
    var snaps = payload.cardSnapshots || [];
    var css = CFM.cardSnapshotService || {};

    snaps.forEach(function (snap, i) {
      if (!snap || typeof snap !== "object") return;
      var ref = snap.cardId || snap.cardExternalRef || snap.cardRef || "";
      var path = entityPath("cardSnapshots", i, ref);

      if (!isNonEmptyString(snap.cardId) && !isNonEmptyString(snap.cardExternalRef) &&
          !isNonEmptyString(snap.cardRef)) {
        pushIssue(blocking, makeIssue(
          "SNAPSHOT_CARD_REF",
          path,
          "",
          "cardSnapshots[] deve referenciar cartão via cardId ou cardExternalRef.",
          "Preencher cardSnapshots[].cardId (ou cardExternalRef) com id estável de cards[].",
          "blocking"
        ));
      }

      var resolved = false;
      cards.forEach(function (card) {
        if (snapshotMatchesCard(snap, card, cardRefs)) resolved = true;
      });
      if (!resolved && cards.length > 0) {
        pushIssue(blocking, makeIssue(
          "SNAPSHOT_UNRESOLVED",
          path,
          ref,
          "cardSnapshots[] não resolve para nenhum cards[].id/externalRef.",
          "Garantir que cardSnapshots[].cardId aponte para cards[].id existente.",
          "blocking"
        ));
      }

      ["limitCents", "usedCents", "availableCents"].forEach(function (field) {
        if (snap[field] != null && !isNonNegativeInt(snap[field])) {
          pushIssue(blocking, makeIssue(
            "SNAPSHOT_CENTS",
            path + "." + field,
            ref,
            field + " deve ser inteiro >= 0.",
            "Emitir " + field + " em centavos inteiros não negativos.",
            "blocking"
          ));
        }
      });

      if (snap.source != null && typeof snap.source !== "string") {
        pushIssue(blocking, makeIssue(
          "SNAPSHOT_SOURCE_OBJECT",
          path + ".source",
          ref,
          "cardSnapshots[].source deve ser string, não objeto.",
          "Emitir cardSnapshots[].source como string (ex.: import_json, manual).",
          "blocking"
        ));
      }

      if (css.validateSnapshotConsistency &&
          snap.limitCents != null && snap.usedCents != null && snap.availableCents != null) {
        var c = css.validateSnapshotConsistency(snap.limitCents, snap.usedCents, snap.availableCents);
        if (c.consistent === false) {
          pushIssue(blocking, makeIssue(
            "SNAPSHOT_ARITHMETIC",
            path,
            ref,
            "usedCents + availableCents difere de limitCents (tolerância 1 centavo).",
            "Recalcular limitCents, usedCents e availableCents para used + available ≈ limit.",
            "blocking"
          ));
        }
      }
    });

    if (cards.length > 0 && snaps.length > 0) {
      cards.forEach(function (card) {
        if (!card || !card.id) return;
        var hasSnap = snaps.some(function (s) { return snapshotMatchesCard(s, card, cardRefs); });
        if (!hasSnap) {
          pushIssue(warnings, makeIssue(
            "SNAPSHOT_MISSING",
            "cards",
            card.id,
            "Cartão sem cardSnapshots correspondente — UI exibirá snapshot ausente.",
            "Emitir cardSnapshots[] para cada cartão exportado (id: " + card.id + ").",
            "warning"
          ));
        }
      });
    }
  }

  function validateInvoices(invoices, blocking, warnings, fixes) {
    (invoices || []).forEach(function (inv, i) {
      if (!inv || typeof inv !== "object") return;
      var path = entityPath("invoices", i, inv.id || inv.externalRef);
      var isStub = inv.isStub === true || inv.referenceOnly === true;

      if (!isNonEmptyString(inv.competenceMonth)) {
        pushIssue(blocking, makeIssue(
          "INVOICE_COMPETENCE",
          path,
          inv.id || "",
          "invoices[].competenceMonth é obrigatório (YYYY-MM).",
          "Preencher competenceMonth em todas as faturas.",
          "blocking"
        ));
      } else if (!MONTH_REGEX.test(inv.competenceMonth)) {
        pushIssue(blocking, makeIssue(
          "INVOICE_COMPETENCE_FORMAT",
          path,
          inv.id || "",
          "competenceMonth inválido — use YYYY-MM.",
          "Normalizar invoices[].competenceMonth para YYYY-MM.",
          "blocking"
        ));
      }

      if (isStub && !inv.isStub && !inv.referenceOnly) {
        pushIssue(warnings, makeIssue(
          "INVOICE_STUB_FLAG",
          path,
          inv.id || "",
          "Fatura parece referência/stub mas não marca isStub/referenceOnly.",
          "Marcar stubs com isStub: true ou referenceOnly: true.",
          "warning"
        ));
      }

      if (inv.creditBalanceCents != null && inv.creditBalanceCents > 0 &&
          inv.balanceDirection && inv.balanceDirection !== "credit") {
        pushIssue(warnings, makeIssue(
          "INVOICE_CREDIT_DIRECTION",
          path,
          inv.id || "",
          "Saldo credor deve usar balanceDirection: \"credit\".",
          "Definir balanceDirection: \"credit\" quando creditBalanceCents > 0.",
          "warning"
        ));
      }

      if (!isStub && inv.totalCents == null && inv.amountDueCents == null) {
        pushIssue(warnings, makeIssue(
          "INVOICE_AMOUNT",
          path,
          inv.id || "",
          "Fatura consolidada sem totalCents/amountDueCents.",
          "Preencher amountDueCents ou totalCents em faturas consolidadas.",
          "warning"
        ));
      }
    });
  }

  function validateTransactions(transactions, blocking, warnings, fixes) {
    (transactions || []).forEach(function (tx, i) {
      if (!tx || typeof tx !== "object") return;
      var path = entityPath("transactions", i, tx.id || tx.externalRef);

      if (!isPositiveInt(tx.amountCents)) {
        pushIssue(blocking, makeIssue(
          "TX_AMOUNT",
          path,
          tx.id || "",
          "amountCents deve ser inteiro positivo.",
          "Emitir transactions[].amountCents sempre positivo (centavos).",
          "blocking"
        ));
      }

      if (VALID_FLOWS.indexOf(tx.flow) === -1) {
        pushIssue(blocking, makeIssue(
          "TX_FLOW",
          path,
          tx.id || "",
          'flow deve ser "in", "out" ou "neutral".',
          "Normalizar transactions[].flow para in/out/neutral.",
          "blocking"
        ));
      }

      if (!isNonEmptyString(tx.type) || VALID_TX_TYPES.indexOf(tx.type) === -1) {
        pushIssue(blocking, makeIssue(
          "TX_TYPE",
          path,
          tx.id || "",
          "type deve usar valor canônico.",
          "Usar type canônico: " + VALID_TX_TYPES.join(", ") + ".",
          "blocking"
        ));
      }

      if (tx.type === "credit_card_purchase" && !tx.cardId && !tx.cardExternalRef) {
        pushIssue(warnings, makeIssue(
          "TX_CARD_LINK",
          path,
          tx.id || "",
          "Compra no cartão sem cardId/cardExternalRef.",
          "Adicionar cardId nas compras credit_card_purchase quando o cartão for identificável.",
          "warning"
        ));
      }

      if ((tx.type === "credit_card_purchase" || tx.invoiceId || tx.invoiceExternalRef) &&
          !tx.invoiceId && !tx.invoiceExternalRef && tx.type === "credit_card_purchase") {
        /* only warn if purchase might need invoice - skip aggressive */
      }

      if (tx.rawHash !== undefined && isNonEmptyString(tx.rawHash) && !SHA256_REGEX.test(tx.rawHash.trim())) {
        pushIssue(blocking, makeIssue(
          "TX_RAW_HASH",
          path + ".rawHash",
          tx.id || "",
          "rawHash legível detectado — use SHA-256 ou canonicalFingerprint.",
          "Mover impressão legível para source.canonicalFingerprint; rawHash apenas sha256:<64 hex>.",
          "blocking"
        ));
      }

      if (tx.source && tx.source.rawHash !== undefined && isNonEmptyString(tx.source.rawHash) &&
          !SHA256_REGEX.test(tx.source.rawHash.trim())) {
        pushIssue(blocking, makeIssue(
          "TX_SOURCE_RAW_HASH",
          path + ".source.rawHash",
          tx.id || "",
          "source.rawHash legível na transação.",
          "Mover impressão legível para source.canonicalFingerprint.",
          "blocking"
        ));
      }
    });
  }

  function validateInstallmentPlans(plans, blocking, warnings, fixes) {
    (plans || []).forEach(function (plan, i) {
      if (!plan || typeof plan !== "object") return;
      var path = entityPath("installmentPlans", i, plan.id || plan.externalRef);

      if (!isPositiveInt(plan.totalInstallments)) {
        pushIssue(warnings, makeIssue(
          "PLAN_TOTAL",
          path,
          plan.id || "",
          "totalInstallments recomendado para agrupamento de parcelas.",
          "Preencher installmentPlans[].totalInstallments.",
          "warning"
        ));
      }

      if (plan.kind === "financing" || /banco\s*pan|auto\s*pan/i.test(plan.description || "")) {
        if (plan.kind !== "financing") {
          pushIssue(warnings, makeIssue(
            "PLAN_FINANCING_KIND",
            path,
            plan.id || "",
            "Financiamento deve usar kind: \"financing\".",
            "Classificar financiamentos (ex.: Banco Pan) com kind: \"financing\".",
            "warning"
          ));
        }
      }
    });
  }

  function validateRecurringRules(rules, blocking, warnings, fixes) {
    (rules || []).forEach(function (rule, i) {
      if (!rule || typeof rule !== "object") return;
      var path = entityPath("recurringRules", i, rule.externalRef || rule.id);

      if (rule.cadence) {
        pushIssue(blocking, makeIssue(
          "REC_CADENCE",
          path,
          rule.externalRef || rule.id || "",
          "Campo legado cadence detectado.",
          "Remover cadence e manter somente frequency.",
          "blocking"
        ));
      }

      if (rule.amountCents != null && rule.expectedAmountCents == null) {
        pushIssue(blocking, makeIssue(
          "REC_AMOUNT_FIELD",
          path,
          rule.externalRef || rule.id || "",
          "Usar expectedAmountCents em vez de amountCents.",
          "Trocar recurringRules[].amountCents por expectedAmountCents.",
          "blocking"
        ));
      }

      if (!isNonEmptyString(rule.externalRef) && !isNonEmptyString(rule.id)) {
        pushIssue(warnings, makeIssue(
          "REC_EXTERNAL_REF",
          path,
          "",
          "externalRef recomendado em recurringRules[].",
          "Preencher recurringRules[].externalRef estável.",
          "warning"
        ));
      }

      if (rule.category && !rule.categoryLabel) {
        pushIssue(warnings, makeIssue(
          "REC_CATEGORY_LABEL",
          path,
          rule.externalRef || rule.id || "",
          "Preferir categoryLabel em vez de category.",
          "Renomear recurringRules[].category para categoryLabel.",
          "warning"
        ));
      }
    });
  }

  function collectGeneratorFixes(blocking, warnings) {
    var seen = {};
    var fixes = [];
    (blocking.concat(warnings)).forEach(function (item) {
      if (!item.generatorFix || seen[item.generatorFix]) return;
      seen[item.generatorFix] = true;
      fixes.push(item.generatorFix);
    });
    return fixes;
  }

  function countArrays(payload) {
    return {
      accounts:         Array.isArray(payload.accounts)         ? payload.accounts.length         : 0,
      cards:            Array.isArray(payload.cards)            ? payload.cards.length            : 0,
      cardSnapshots:    Array.isArray(payload.cardSnapshots)    ? payload.cardSnapshots.length    : 0,
      invoices:         Array.isArray(payload.invoices)         ? payload.invoices.length         : 0,
      transactions:     Array.isArray(payload.transactions)     ? payload.transactions.length     : 0,
      installmentPlans: Array.isArray(payload.installmentPlans) ? payload.installmentPlans.length : 0,
      recurringRules:   Array.isArray(payload.recurringRules)   ? payload.recurringRules.length   : 0
    };
  }

  /**
   * Valida contrato cfm.import.v1 além do schema básico.
   * @param {object} payload — JSON já parseado (preferir normalizado)
   * @param {object} options — { skipSchema?: boolean }
   */
  function validate(payload, options) {
    var opts = options || {};
    var blocking = [];
    var warnings = [];

    validateRoot(payload, blocking, warnings, []);
    if (blocking.length && !payload.schemaVersion) {
      return {
        valid: false,
        blockingIssues: blocking,
        warnings: warnings,
        generatorFixes: collectGeneratorFixes(blocking, warnings),
        counts: countArrays(payload || {})
      };
    }

    validateSource(payload.source, blocking, warnings, []);
    validateCards(payload.cards, blocking, warnings, []);
    validateCardSnapshots(payload, blocking, warnings, []);
    validateInvoices(payload.invoices, blocking, warnings, []);
    validateTransactions(payload.transactions, blocking, warnings, []);
    validateInstallmentPlans(payload.installmentPlans, blocking, warnings, []);
    validateRecurringRules(payload.recurringRules, blocking, warnings, []);

    var val = CFM.validators || {};
    if (val.countBadRawHashes) {
      var badHash = val.countBadRawHashes(payload);
      if (badHash > 0) {
        pushIssue(blocking, makeIssue(
          "BAD_RAW_HASH",
          "source/transactions/recurringRules",
          "",
          badHash + " rawHash legível(is) detectado(s).",
          "Normalizar todos os rawHash para sha256:<64 hex> ou mover para canonicalFingerprint.",
          "blocking"
        ));
      }
    }

    if (val.scanForSensitiveData) {
      var privacy = val.scanForSensitiveData(payload);
      privacy.forEach(function (alert) {
        pushIssue(blocking, makeIssue(
          "PRIVACY_" + String(alert.type || "SENSITIVE").toUpperCase(),
          alert.context || "payload",
          "",
          alert.label + " detectado em " + alert.context + ".",
          "Remover dado sensível do JSON exportado; sanitizar antes de emitir.",
          "blocking"
        ));
      });
    }

    if (val.validateBrokenReferences && !opts.skipBrokenRefs) {
      var broken = val.validateBrokenReferences(payload, opts.refOptions || {});
      broken.forEach(function (msg) {
        pushIssue(blocking, makeIssue(
          "BROKEN_REF",
          msg.split(":")[0] || "references",
          "",
          msg,
          "Corrigir FK quebrada — alinhar ids entre entidades relacionadas.",
          "blocking"
        ));
      });
    }

    if (!opts.skipSchema && CFM.importSchema && CFM.importSchema.validate) {
      var schemaResult = CFM.importSchema.validate(payload);
      (schemaResult.fatal || []).forEach(function (msg) {
        pushIssue(blocking, makeIssue(
          "SCHEMA_FATAL",
          "schema",
          "",
          msg,
          "Corrigir erro estrutural reportado pelo schema.",
          "blocking"
        ));
      });
      (schemaResult.itemErrors || []).forEach(function (err) {
        pushIssue(blocking, makeIssue(
          "SCHEMA_TX",
          "transactions[" + err.index + "]",
          "",
          err.msg,
          "Corrigir transação inválida conforme schema cfm.import.v1.",
          "blocking"
        ));
      });
    }

    return {
      valid: blocking.length === 0,
      blockingIssues: blocking,
      warnings: warnings,
      generatorFixes: collectGeneratorFixes(blocking, warnings),
      counts: countArrays(payload || {}),
      canonicalFields: {
        recurringRules: RECURRING_CANONICAL_FIELDS
      }
    };
  }

  CFM.importContract = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    RECURRING_CANONICAL_FIELDS: RECURRING_CANONICAL_FIELDS,
    validate: validate
  };
})(window.CFM);
