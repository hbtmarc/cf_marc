/**
 * Normalização de payload para persistência local — Fase 0.5.0
 */
window.CFM = window.CFM || {};

(function (CFM) {
  function entityId(value, fallback) {
    var s = value != null ? String(value).trim() : "";
    return s || fallback || "";
  }

  /**
   * Assinatura estável do lote importado (deduplicação).
   * @param {Object} report
   * @returns {string}
   */
  function buildBatchSignature(report) {
    if (!report) return "";
    var src = report.source || {};
    var hashPart = src.rawHash || src.canonicalFingerprint || "";
    return [
      report.fileName || "",
      hashPart,
      src.generatedAt || "",
      src.institution || "",
      src.periodStart || "",
      src.periodEnd || "",
      String(report.importBatchId || "")
    ].join("::");
  }

  function slimCard(card, batchId) {
    if (!card) return null;
    var id = entityId(card.id || card.canonicalKey, card.name);
    if (!id) return null;
    return {
      id: id,
      batchId: batchId,
      name: card.name || "",
      brand: card.brand || "",
      lastFour: card.lastFour || card.lastFourDisplay || "",
      limitCents: card.limitCents,
      usedCents: card.usedCents,
      availableCents: card.availableCents,
      hasSnapshot: !!card.hasSnapshot
    };
  }

  function slimInvoice(inv, batchId) {
    if (!inv || inv.isReference || inv.isStub || inv.referenceOnly) return null;
    var id = entityId(inv.externalRef || inv.id, "inv-" + batchId);
    return {
      id: id,
      batchId: batchId,
      cardId: inv.cardId || inv.cardExternalRef || "",
      cardName: inv.cardName || "",
      competenceMonth: inv.competenceMonth || "",
      status: inv.status || "",
      totalCents: inv.totalCents != null ? inv.totalCents : 0,
      amountDueCents: inv.amountDueCents != null ? inv.amountDueCents : 0,
      reconciliationStatus: inv.reconciliationStatus || ""
    };
  }

  function slimTransaction(tx, batchId) {
    if (!tx) return null;
    var id = entityId(tx.stableRef || tx.id || tx.externalRef, "");
    if (!id) return null;
    return {
      id: id,
      batchId: batchId,
      externalRef: tx.externalRef || "",
      description: tx.description || "",
      amountCents: tx.amountCents || 0,
      flow: tx.flow || "",
      type: tx.type || "",
      date: tx.date || "",
      competenceMonth: tx.competenceMonth || "",
      cardId: tx.cardId || "",
      cardName: tx.cardName || "",
      invoiceId: tx.invoiceId || "",
      categoryLabel: tx.categoryLabel || tx.category || "",
      status: "active"
    };
  }

  function slimInstallmentPlan(plan, batchId) {
    if (!plan) return null;
    var id = entityId(plan.externalRef || plan.id || plan.planStableRef, "");
    if (!id) return null;
    return {
      id: id,
      batchId: batchId,
      description: plan.description || "",
      cardId: plan.cardId || "",
      cardName: plan.cardName || "",
      totalInstallments: plan.totalInstallments || 0,
      currentInstallment: plan.currentInstallment || 0,
      installmentAmountCents: plan.installmentAmountCents ||
        (plan.installmentAmtFmt ? null : 0)
    };
  }

  function slimRecurringRule(rule, batchId) {
    if (!rule) return null;
    var id = entityId(rule.externalRef || rule.id || rule.ruleId, "");
    if (!id) return null;
    return {
      id: id,
      batchId: batchId,
      description: rule.description || "",
      frequency: rule.frequency || "",
      amountCents: rule.expectedAmountCents || rule.amountCents || 0,
      flow: rule.flow || "",
      active: rule.active !== false,
      candidate: !!rule.candidate
    };
  }

  /**
   * @param {Object} report Relatório validado do importador
   * @param {Object} decisions
   * @param {Object} decisions.ignoredTransactions map ref→true
   * @param {Object} decisions.dismissedObservations map pairKey→true
   * @returns {Object}
   */
  function buildImportBatchPayload(report, decisions) {
    decisions = decisions || {};
    var ignored = decisions.ignoredTransactions || {};
    var dismissed = decisions.dismissedObservations || {};
    var batchId = report.importBatchId || ("batch-" + Date.now());
    var signature = buildBatchSignature(report);
    var src = report.source || {};
    var onlyNewRefs = decisions.onlyNewTransactionRefs || null;

    var cards = {};
    (report.cardSummaries || []).forEach(function (card) {
      var slim = slimCard(card, batchId);
      if (slim) cards[slim.id] = slim;
    });

    var invoices = {};
    (report.allInvoices || []).forEach(function (inv) {
      var slim = slimInvoice(inv, batchId);
      if (slim) invoices[slim.id] = slim;
    });

    var transactions = {};
    (report.allTransactions || []).forEach(function (tx) {
      if (!tx || tx.isInvalid) return;
      if (ignored[tx.stableRef]) return;
      if (onlyNewRefs && !onlyNewRefs[tx.stableRef]) return;
      var slim = slimTransaction(tx, batchId);
      if (slim) transactions[slim.id] = slim;
    });

    var installmentPlans = {};
    (report.allInstallmentPlans || []).forEach(function (plan) {
      var slim = slimInstallmentPlan(plan, batchId);
      if (slim) installmentPlans[slim.id] = slim;
    });

    var recurringRules = {};
    (report.allRecurringRules || []).forEach(function (rule) {
      var slim = slimRecurringRule(rule, batchId);
      if (slim) recurringRules[slim.id] = slim;
    });

    if (decisions.onlyNewTransactionRefs) {
      var cardIds = {};
      var invoiceIds = {};
      Object.keys(transactions).forEach(function (id) {
        var tx = transactions[id];
        if (tx.cardId) cardIds[tx.cardId] = true;
        if (tx.invoiceId) invoiceIds[tx.invoiceId] = true;
      });
      cards = filterObjectByKeys(cards, function (card) {
        return cardIds[card.id];
      });
      invoices = filterObjectByKeys(invoices, function (inv) {
        return cardIds[inv.cardId] || invoiceIds[inv.id];
      });
      installmentPlans = filterObjectByKeys(installmentPlans, function (plan) {
        return cardIds[plan.cardId];
      });
      recurringRules = {};
    }

    var counts = {
      cards: Object.keys(cards).length,
      invoices: Object.keys(invoices).length,
      transactions: Object.keys(transactions).length,
      installmentPlans: Object.keys(installmentPlans).length,
      recurringRules: Object.keys(recurringRules).length,
      dismissedObservations: Object.keys(dismissed).length,
      ignoredTransactions: Object.keys(ignored).length
    };

    return {
      batchId: batchId,
      signature: signature,
      batch: {
        id: batchId,
        fileName: report.fileName || "",
        sourceName: src.institution || src.label || "",
        generatedAt: src.generatedAt || "",
        rawHash: src.rawHash || src.canonicalFingerprint || "",
        importedAt: new Date().toISOString(),
        counts: counts,
        status: "active",
        signature: signature
      },
      cards: cards,
      invoices: invoices,
      transactions: transactions,
      installmentPlans: installmentPlans,
      recurringRules: recurringRules,
      reviewHistory: {
        dismissedObservationKeys: Object.keys(dismissed).filter(Boolean),
        ignoredTransactionRefs: Object.keys(ignored).filter(Boolean)
      }
    };
  }

  function filterObjectByKeys(obj, predicate) {
    var out = {};
    Object.keys(obj || {}).forEach(function (key) {
      if (predicate(obj[key], key)) out[key] = obj[key];
    });
    return out;
  }

  function applyEntityResolutionMaps(payload, entityResolution) {
    if (!payload || !entityResolution) return payload;
    var cardMap = entityResolution.cardIdMap || {};
    var invoiceMap = entityResolution.invoiceIdMap || {};
    var planMap = entityResolution.planIdMap || {};
    var ruleMap = entityResolution.ruleIdMap || {};

    function remapId(map, incomingId) {
      if (!incomingId || !map[incomingId]) return incomingId;
      return map[incomingId].existingId || incomingId;
    }

    Object.keys(payload.transactions || {}).forEach(function (id) {
      var tx = payload.transactions[id];
      if (!tx) return;
      if (tx.cardId) tx.cardId = remapId(cardMap, tx.cardId);
      if (tx.invoiceId) tx.invoiceId = remapId(invoiceMap, tx.invoiceId);
    });

    payload.cards = filterObjectByKeys(payload.cards || {}, function (card, id) {
      var mapping = cardMap[id];
      return !(mapping && mapping.existingId && mapping.existingId !== id);
    });

    payload.invoices = filterObjectByKeys(payload.invoices || {}, function (inv, id) {
      var mapping = invoiceMap[id];
      return !(mapping && mapping.existingId && mapping.existingId !== id);
    });

    payload.installmentPlans = filterObjectByKeys(payload.installmentPlans || {}, function (plan, id) {
      var mapping = planMap[id];
      return !(mapping && mapping.existingId && mapping.existingId !== id);
    });

    payload.recurringRules = filterObjectByKeys(payload.recurringRules || {}, function (rule, id) {
      var mapping = ruleMap[id];
      return !(mapping && mapping.existingId && mapping.existingId !== id);
    });

    return payload;
  }

  function buildIncrementalImportPayload(report, decisions, diffResult) {
    var onlyNewRefs = {};
    (diffResult.safeNewTransactions || diffResult.newTransactions || []).forEach(function (tx) {
      if (tx && tx.stableRef) onlyNewRefs[tx.stableRef] = true;
    });
    var mergedDecisions = Object.assign({}, decisions || {}, {
      onlyNewTransactionRefs: onlyNewRefs
    });
    var payload = buildImportBatchPayload(report, mergedDecisions);
    if (diffResult && diffResult.entityResolution) {
      payload = applyEntityResolutionMaps(payload, diffResult.entityResolution);
      payload.counts = {
        cards: Object.keys(payload.cards || {}).length,
        invoices: Object.keys(payload.invoices || {}).length,
        transactions: Object.keys(payload.transactions || {}).length,
        installmentPlans: Object.keys(payload.installmentPlans || {}).length,
        recurringRules: Object.keys(payload.recurringRules || {}).length,
        dismissedObservations: Object.keys((decisions && decisions.dismissedObservations) || {}).length,
        ignoredTransactions: Object.keys((decisions && decisions.ignoredTransactions) || {}).length
      };
    }
    return payload;
  }

  CFM.importPersistence = {
    buildBatchSignature: buildBatchSignature,
    buildImportBatchPayload: buildImportBatchPayload,
    buildIncrementalImportPayload: buildIncrementalImportPayload,
    applyEntityResolutionMaps: applyEntityResolutionMaps
  };
})(window.CFM);
