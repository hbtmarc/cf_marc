/**
 * Semântica de interpretação — Fase Nubank v2 / cfm.import.v1
 * Helpers para faturas, liquidação, observações e cartões.
 * Sem persistência. Compatível com file:// e Node (eval).
 */
window.CFM = window.CFM || {};

(function (CFM) {
  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  function getToleranceCents(invoice) {
    if (invoice && invoice.reconciliationToleranceCents != null) {
      return invoice.reconciliationToleranceCents;
    }
    return 5;
  }

  function getReconciliationDifferenceCents(invoice) {
    if (!invoice) return null;
    if (invoice.ofxDebitReconciliationDifferenceCents != null) {
      return invoice.ofxDebitReconciliationDifferenceCents;
    }
    if (invoice.reconciliationDeltaCents != null) return invoice.reconciliationDeltaCents;
    if (invoice.reconciliationDiff != null) return invoice.reconciliationDiff;
    return null;
  }

  function isInvoiceSettled(invoice) {
    if (!invoice) return false;
    return invoice.reconciliationStatus === "settled";
  }

  function isInvoiceOpenProvisional(invoice) {
    if (!invoice) return false;
    if (invoice.isStub || invoice.referenceOnly || invoice.isReference) return false;
    return invoice.status === "open" ||
      invoice.sourceStatus === "provisional" ||
      invoice.replaceWhenClosed === true;
  }

  function isInvoiceWithinTolerance(invoice) {
    if (!invoice) return false;
    if (invoice.isWithinReconciliationTolerance === true) return true;
    var diff = getReconciliationDifferenceCents(invoice);
    if (diff == null) {
      if (invoice.explainedByPayments && Math.abs(invoice.reconciliationDeltaCents || 0) <= getToleranceCents(invoice)) {
        return true;
      }
      return false;
    }
    return Math.abs(diff) <= getToleranceCents(invoice);
  }

  function isInvoiceEnrichedConfirmed(invoice) {
    return !!(invoice && (invoice.pdfSummaryConfirmed || invoice.csvTransactionsConfirmed));
  }

  function shouldSuppressPartialReconciliation(invoice) {
    if (!invoice || invoice.isStub || invoice.referenceOnly || invoice.isReference) return false;
    if (invoice.review && invoice.review.required === true) return false;

    if (invoice.reconciliationStatus === "settled" &&
        isInvoiceWithinTolerance(invoice) &&
        (isInvoiceEnrichedConfirmed(invoice) || invoice.status === "paid")) {
      return true;
    }

    if (isInvoiceSettled(invoice) && isInvoiceWithinTolerance(invoice)) return true;

    if (invoice.status === "paid" &&
        isInvoiceWithinTolerance(invoice) &&
        isInvoiceEnrichedConfirmed(invoice) &&
        !(invoice.review && invoice.review.required)) {
      return true;
    }

    return false;
  }

  function getInvoiceReconciliationLabel(invoice) {
    if (!invoice) {
      return { label: "—", severity: "info", message: "", cssClass: "info" };
    }

    if (invoice.isStub || invoice.referenceOnly || invoice.isReference) {
      return {
        label: "Referência",
        severity: "info",
        message: "Referência de vínculo — não é fatura consolidada.",
        cssClass: "info"
      };
    }

    if (isInvoiceOpenProvisional(invoice)) {
      return {
        label: "Aberta / provisória",
        severity: "info",
        message: "Fatura em aberto. Os valores serão substituídos quando a fatura fechar.",
        cssClass: "info"
      };
    }

    if (shouldSuppressPartialReconciliation(invoice) || isInvoiceSettled(invoice)) {
      return {
        label: "Conciliada",
        severity: "success",
        message: "Fatura fechada conciliada. Diferenças de centavos foram tratadas como informativas.",
        cssClass: "ok"
      };
    }

    if (!isInvoiceWithinTolerance(invoice) &&
        (invoice.hasReconciliationGap || invoice.reconciliationStatus === "requires_review")) {
      return {
        label: "Revisar conciliação",
        severity: "warning",
        message: "Há diferença fora da tolerância entre documentos e lançamentos.",
        cssClass: "gap"
      };
    }

    if (invoice.reconciliationStatus === "consistent" ||
        invoice.reconciliationStatus === "explained_by_payment" ||
        invoice.explainedByPayments) {
      return {
        label: "Conciliada",
        severity: "success",
        message: invoice.reconciliationMessage || "Conciliação consistente.",
        cssClass: "ok"
      };
    }

    if (invoice.hasCredit || invoice.reconciliationStatus === "credit_balance") {
      return {
        label: "Saldo credor",
        severity: "success",
        message: invoice.reconciliationMessage || "Saldo credor — não entra na conciliação de compras.",
        cssClass: "ok"
      };
    }

    if (invoice.reconciliationPartial) {
      return {
        label: "Parcial",
        severity: "warning",
        message: invoice.reconciliationMessage ||
          "Conciliação parcial — nem todas as transações da fatura estão presentes no JSON.",
        cssClass: "partial"
      };
    }

    return {
      label: "Parcial",
      severity: "warning",
      message: "Ausência de transações vinculadas suficientes para conciliação completa.",
      cssClass: "partial"
    };
  }

  function isInvoiceSettlementTransaction(tx) {
    if (!tx) return false;
    if (tx.type === "credit_card_payment") return true;
    if (tx.cashFlowTreatment === "invoice_settlement") return true;
    if (tx.expenseImpact === "none_when_purchases_are_counted") return true;
    if (tx.affectsInvoiceBalance === true && tx.type !== "credit_card_purchase") return true;
    return false;
  }

  function isInvoiceSettlementForInvoice(tx, invRefKeys) {
    if (!tx) return false;
    if (isInvoiceSettlementTransaction(tx)) return true;
    if (invRefKeys && invRefKeys.length) {
      var settles = tx.settlesInvoiceExternalRef || tx.settlesInvoiceId || "";
      if (settles && invRefKeys.indexOf(String(settles)) >= 0) return true;
    }
    return false;
  }

  function getTransactionDisplayType(tx) {
    if (!isInvoiceSettlementTransaction(tx)) return null;
    var label = tx.type === "credit_card_payment"
      ? "Pagamento de fatura"
      : "Liquidação de fatura";
    return { label: label, cls: "type-badge--settlement", isSettlement: true };
  }

  /**
   * Resolve status/mensagem de conciliação a partir dos totais calculados.
   * Regras centralizadas — card-snapshot.service.js só agrega lançamentos.
   */
  function resolveInvoiceReconciliationSemantics(invoice, metrics) {
    var m = metrics || {};
    var RECON_TOLERANCE = getToleranceCents(invoice);
    var chargeLinkedCount = m.chargeLinkedCount || 0;
    var settlementLinkedCount = m.settlementLinkedCount || 0;
    var statementPaymentLinkedCount = m.statementPaymentLinkedCount || 0;
    var chargesVsTotalDelta = m.chargesVsTotalDelta || 0;
    var reconciliationDeltaCents = m.reconciliationDeltaCents != null ? m.reconciliationDeltaCents : 0;
    var hasCredit = !!m.hasCredit;
    var sameCardSameMonthWithoutRef = m.sameCardSameMonthWithoutRef || 0;
    var invRefKeysCount = m.invRefKeysCount != null ? m.invRefKeysCount : 1;

    var isPartial = chargeLinkedCount === 0 ||
      sameCardSameMonthWithoutRef > 0 ||
      invRefKeysCount === 0;

    var withinTol = isInvoiceWithinTolerance(invoice) ||
      Math.abs(chargesVsTotalDelta) <= RECON_TOLERANCE;

    var enrichedSettled = isInvoiceSettled(invoice);
    var enrichedProvisional = isInvoiceOpenProvisional(invoice);
    var enrichedConfirmed = isInvoiceEnrichedConfirmed(invoice);

    if (shouldSuppressPartialReconciliation(invoice) ||
        (enrichedSettled && withinTol && enrichedConfirmed &&
         !(invoice.review && invoice.review.required))) {
      isPartial = false;
    } else if (enrichedSettled && withinTol && invoice.status === "paid") {
      isPartial = false;
    } else if (enrichedProvisional) {
      isPartial = false;
    }

    var confidence = "high";
    if (chargeLinkedCount === 0 && settlementLinkedCount === 0 &&
        statementPaymentLinkedCount === 0) {
      confidence = "low";
    } else if (isPartial) {
      confidence = "partial";
    }

    var explainedByPayments =
      Math.abs(reconciliationDeltaCents) <= RECON_TOLERANCE ||
      Math.abs(chargesVsTotalDelta) <= RECON_TOLERANCE ||
      m.explainedByPaymentsInitial === true;

    var reconciliationStatus = "requires_review";

    if (invoice.reconciliationStatus === "settled" || enrichedSettled) {
      reconciliationStatus = "settled";
      explainedByPayments = true;
      if (withinTol) {
        reconciliationDeltaCents = invoice.ofxDebitReconciliationDifferenceCents != null
          ? invoice.ofxDebitReconciliationDifferenceCents
          : reconciliationDeltaCents;
      }
    } else if (hasCredit) {
      reconciliationDeltaCents = 0;
      explainedByPayments = true;
      reconciliationStatus = "credit_balance";
    } else if (enrichedProvisional) {
      reconciliationStatus = invoice.reconciliationStatus || "provisional";
      explainedByPayments = true;
      reconciliationDeltaCents = 0;
    } else if (Math.abs(chargesVsTotalDelta) <= RECON_TOLERANCE || withinTol) {
      reconciliationDeltaCents = withinTol
        ? (invoice.ofxDebitReconciliationDifferenceCents != null
          ? invoice.ofxDebitReconciliationDifferenceCents
          : 0)
        : 0;
      explainedByPayments = true;
      reconciliationStatus = isPartial ? "partial" : "consistent";
      if (enrichedSettled || (invoice.status === "paid" && withinTol && enrichedConfirmed)) {
        reconciliationStatus = "settled";
        isPartial = false;
      }
    } else if (explainedByPayments) {
      reconciliationDeltaCents = 0;
      reconciliationStatus = "explained_by_payment";
    } else if (isPartial) {
      reconciliationStatus = "partial";
    }

    var message = "";
    if (hasCredit) {
      message = "Saldo credor — não entra na conciliação de compras.";
    } else if (reconciliationStatus === "settled" ||
        (invoice.status === "paid" && withinTol && enrichedConfirmed)) {
      message = "Fatura fechada conciliada. Diferenças de centavos foram tratadas como informativas.";
      isPartial = false;
    } else if (enrichedProvisional) {
      message = "Fatura em aberto. Os valores serão substituídos quando a fatura fechar.";
      isPartial = false;
    } else if (reconciliationStatus === "consistent") {
      message = "Conciliação consistente.";
    } else if (reconciliationStatus === "explained_by_payment") {
      message = "Conciliação explicada por pagamento/crédito.";
    } else if (reconciliationStatus === "partial" && !withinTol) {
      message = "Conciliação parcial — nem todas as transações da fatura estão presentes no JSON.";
      if (Math.abs(chargesVsTotalDelta) <= RECON_TOLERANCE) {
        reconciliationDeltaCents = 0;
      }
    } else if (reconciliationStatus === "partial" && withinTol) {
      message = "Fatura conciliada dentro da tolerância. Diferença informativa de centavos.";
      isPartial = false;
      reconciliationStatus = invoice.status === "paid" ? "settled" : "consistent";
    } else if (reconciliationStatus === "requires_review") {
      message = "Conciliação requer revisão.";
    }

    return {
      isPartial: isPartial,
      reconciliationStatus: reconciliationStatus,
      message: message,
      explainedByPayments: explainedByPayments,
      reconciliationDeltaCents: reconciliationDeltaCents,
      confidence: confidence,
      withinTolerance: withinTol
    };
  }

  function getInvoiceToleranceInformativeLabel(invoice, formatDiffFn) {
    if (!invoice || !isInvoiceWithinTolerance(invoice)) return "";
    var diff = getReconciliationDifferenceCents(invoice);
    if (diff == null || Math.abs(diff) === 0) return "";
    var fmt = formatDiffFn ? formatDiffFn(Math.abs(diff)) : String(Math.abs(diff));
    return "Diferença informativa: " + fmt + " (dentro da tolerância).";
  }

  function isCategoryOutros(tx) {
    if (!tx) return false;
    var cat = String(tx.categoryLabel || tx.category || "").trim().toLowerCase();
    return cat === "outros";
  }

  function isOutrosCategoryReview(item, tx) {
    if (!tx || !item) return false;
    return isCategoryOutros(tx) && /categoria|category/i.test(item.reason || "");
  }

  function findInstallmentPlan(plans, ref) {
    if (!ref || !plans) return null;
    var key = String(ref);
    for (var i = 0; i < plans.length; i++) {
      var p = plans[i];
      if (!p) continue;
      if (p.id === key || p.externalRef === key) return p;
    }
    return null;
  }

  function txPlanRef(tx) {
    if (!tx) return "";
    return String(tx.installmentPlanExternalRef || tx.installmentPlanId || "");
  }

  function txReviewRequired(tx) {
    return !!(tx && tx.review && tx.review.required === true);
  }

  function planObservedContainsTx(plan, tx, txIndex) {
    if (!plan || !tx) return false;
    var observed = plan.observedInstallments;
    if (!Array.isArray(observed) || !observed.length) return true;
    var keys = [
      tx.id, tx.externalRef, tx.transactionExternalRef,
      tx.installmentPlanExternalRef, tx.installmentPlanId
    ].filter(Boolean).map(String);
    if (txIndex != null) keys.push(String(txIndex));
    return observed.some(function (entry) {
      if (entry == null) return false;
      if (typeof entry === "string" || typeof entry === "number") {
        return keys.indexOf(String(entry)) >= 0 ||
          (typeof entry === "number" && txIndex != null && entry === txIndex);
      }
      if (typeof entry === "object") {
        return keys.indexOf(String(entry.id || entry.externalRef || entry.transactionExternalRef || entry.index || "")) >= 0;
      }
      return false;
    });
  }

  function isInstallmentPlanConsistent(plan) {
    if (!plan) return false;
    if (plan.review && plan.review.required === true) return false;
    var total = plan.totalInstallments || 0;
    var current = plan.currentInstallment || 0;
    if (total > 0 && current > total) return false;
    if (plan.remainingInstallments != null && plan.futureInstallments != null) {
      if (Number(plan.remainingInstallments) + Number(plan.currentInstallment || 0) > total && total > 0) {
        return false;
      }
    }
    return true;
  }

  function isInstallmentSimilarityInformational(pair, transactions, installmentPlans) {
    return isInstallmentRelatedPairConsistent(pair, transactions, installmentPlans);
  }

  function descriptionsSimilarBase(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var val = CFM.validators;
    if (val && val.descriptionsSimilar) return val.descriptionsSimilar(a, b);
    var minLen = Math.min(a.length, b.length);
    if (minLen >= 6) {
      var prefix = Math.min(12, minLen);
      return a.substring(0, prefix) === b.substring(0, prefix);
    }
    return false;
  }

  function normalizeMerchantBase(description) {
    if (CFM.merchantClassificationRules &&
        CFM.merchantClassificationRules.normalizeMerchantDescription) {
      return CFM.merchantClassificationRules.normalizeMerchantDescription(description);
    }
    return String(description || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bparcela?\s*\d+\s*[/\\]\s*\d+\b/g, " ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function amountsEquivalent(a, b) {
    if (a == null || b == null) return false;
    if (a === b) return true;
    return Math.abs(a - b) <= Math.max(10, Math.round(Math.abs(a) * 0.01));
  }

  function hasInstallmentIndicator(tx, installmentPlans) {
    if (!tx) return false;
    if (txPlanRef(tx)) return true;
    if (tx.installment && (tx.installment.current || tx.installment.total)) return true;
    var desc = String(tx.description || "");
    if (/parcela?\s*\d+\s*[/\\]\s*\d+/i.test(desc)) return true;
    if (/parcelamento/i.test(desc)) return true;
    var ref = txPlanRef(tx);
    if (ref && installmentPlans) {
      var plan = findInstallmentPlan(installmentPlans, ref);
      if (plan && (Array.isArray(plan.observedInstallments) ||
          plan.futureInstallments != null || plan.remainingInstallments != null)) {
        return true;
      }
    }
    return false;
  }

  function isInstallmentRelatedPairConsistent(pair, transactions, installmentPlans) {
    if (!pair || !transactions) return false;

    var indices = [pair.index1, pair.index2, pair.indexA, pair.indexB];
    var refs = [];
    var txs = [];
    var i, idx, tx, ref, plan;

    for (i = 0; i < indices.length; i++) {
      idx = indices[i];
      if (idx == null) continue;
      tx = transactions[idx];
      if (!tx) return false;
      if (txReviewRequired(tx)) return false;
      txs.push(tx);
      ref = txPlanRef(tx);
      if (ref) {
        refs.push(ref);
        plan = findInstallmentPlan(installmentPlans, ref);
        if (!plan) return false;
        if (!isInstallmentPlanConsistent(plan)) return false;
        if (!planObservedContainsTx(plan, tx, idx) &&
            Array.isArray(plan.observedInstallments) &&
            plan.observedInstallments.length > 0) {
          return false;
        }
      }
    }

    if (refs.length >= 2 && refs[0] !== refs[1]) {
      plan = findInstallmentPlan(installmentPlans, refs[0]);
      if (!plan || !findInstallmentPlan(installmentPlans, refs[1])) return false;
    }

    if (refs.length >= 1) return true;

    if (txs.length < 2) return false;

    for (i = 0; i < txs.length; i++) {
      if (!hasInstallmentIndicator(txs[i], installmentPlans)) return false;
    }

    var base0 = normalizeMerchantBase(txs[0].description);
    var amount0 = txs[0].amountCents;
    if (!base0 || amount0 == null) return false;

    for (i = 1; i < txs.length; i++) {
      if (!descriptionsSimilarBase(base0, normalizeMerchantBase(txs[i].description))) {
        return false;
      }
      if (!amountsEquivalent(amount0, txs[i].amountCents)) return false;
      if (txs[i].competenceMonth && txs[0].competenceMonth &&
          txs[i].competenceMonth === txs[0].competenceMonth) {
        return false;
      }
    }

    return true;
  }

  function isSimilarityBlocking(pair, classification, transactions, installmentPlans) {
    var obs = Object.assign({}, pair, {
      classification: (pair && pair.classification) || classification || ""
    });
    return isObservationBlocking(obs, transactions, installmentPlans);
  }

  function getObservationClassification(obs) {
    if (!obs) return "";
    return String(obs.classification || obs.type || "").trim();
  }

  function observationIndices(obs) {
    if (!obs) return [];
    return [obs.index1, obs.index2, obs.indexA, obs.indexB].filter(function (i) {
      return i != null;
    });
  }

  function observationHasReviewRequired(obs, transactions) {
    if (obs && obs.required === true) return true;
    if (obs && obs.review && obs.review.required === true) return true;
    var indices = observationIndices(obs);
    for (var i = 0; i < indices.length; i++) {
      if (txReviewRequired(transactions[indices[i]])) return true;
    }
    return false;
  }

  function isStructuralErrorClassification(classification) {
    return classification === "invalid_reference" ||
      classification === "broken_reference" ||
      classification === "structural_error" ||
      classification === "schema_error";
  }

  /**
   * Observação bloqueia importação somente com sinal explícito de erro/revisão obrigatória.
   */
  function isObservationBlocking(obs, transactions, installmentPlans) {
    if (!obs) return false;

    var classification = getObservationClassification(obs);

    if (obs.informational === true) return false;
    if (obs.severity === "info") return false;
    if (obs.tier === "informational" || obs.tier === "attention") return false;

    if (classification === "recurring_candidate" || classification === "recurrence_candidate") {
      return false;
    }
    if (classification === "repeated_purchase") return false;
    if (classification === "category_review") return false;
    if (classification === "installment_related" &&
        isInstallmentSimilarityInformational(obs, transactions, installmentPlans)) {
      return false;
    }

    var reviewRequired = observationHasReviewRequired(obs, transactions);

    if (obs.severity === "error") return true;
    if (obs.required === true) return true;
    if (reviewRequired) return true;
    if (classification === "exact_duplicate") return true;
    if (isStructuralErrorClassification(classification)) return true;

    if (obs.blocking === true && (reviewRequired || obs.severity === "error")) {
      return true;
    }

    return false;
  }

  function isObservationInformational(obs, transactions, installmentPlans) {
    if (!obs) return false;
    if (isObservationBlocking(obs, transactions, installmentPlans)) return false;

    var classification = getObservationClassification(obs);

    if (classification === "repeated_purchase") return true;
    if (classification === "category_review") return true;
    if (obs.informational === true || obs.severity === "info") return true;
    if (classification === "installment_related" &&
        isInstallmentSimilarityInformational(obs, transactions, installmentPlans)) {
      return true;
    }
    return false;
  }

  function isObservationAttention(obs, transactions, installmentPlans) {
    if (!obs) return false;
    if (isObservationBlocking(obs, transactions, installmentPlans)) return false;
    if (isObservationInformational(obs, transactions, installmentPlans)) return false;

    var classification = getObservationClassification(obs);

    if (classification === "recurring_candidate" || classification === "recurrence_candidate") {
      return true;
    }
    if (classification === "probable_duplicate") return true;
    if (classification === "similar_transfer") return true;
    if (classification === "installment_related") return true;
    if (obs.attention === true || obs.severity === "warning") return true;
    if ((obs.confidence === "high" || obs.confidence === "medium") &&
        classification !== "repeated_purchase" &&
        classification !== "category_review") {
      return true;
    }
    return false;
  }

  function getObservationTier(obs, transactions, installmentPlans) {
    if (isObservationBlocking(obs, transactions, installmentPlans)) return "blocking";
    if (isObservationInformational(obs, transactions, installmentPlans)) return "informational";
    if (isObservationAttention(obs, transactions, installmentPlans)) return "attention";
    return "informational";
  }

  function annotateObservation(obs, transactions, installmentPlans) {
    var copy = Object.assign({}, obs);
    var classification = getObservationClassification(copy);
    var tier = getObservationTier(copy, transactions, installmentPlans);

    copy.tier = tier;
    copy.blocking = tier === "blocking";
    copy.attention = tier === "attention";
    copy.informational = tier === "informational";

    if (tier === "informational") {
      copy.severity = "info";
    } else if (tier === "attention") {
      copy.severity = copy.severity || "warning";
    }

    if (classification === "recurring_candidate") {
      copy.classificationLabel = copy.classificationLabel || "Recorrência candidata";
      copy.tier = "attention";
      copy.attention = true;
      copy.blocking = false;
      copy.informational = false;
      copy.severity = "warning";
    }

    return copy;
  }

  function rebuildObservationCounts(similarityReport, groups, transactions, installmentPlans) {
    var g = groups || similarityReport.groups || {};
    var blocking = 0;
    var attention = 0;
    var informational = 0;

    function countList(list, defaultClassification) {
      (list || []).forEach(function (pair) {
        var obs = annotateObservation(
          Object.assign({}, pair, {
            classification: pair.classification || defaultClassification || ""
          }),
          transactions,
          installmentPlans
        );
        if (obs.tier === "blocking") blocking++;
        else if (obs.tier === "attention") attention++;
        else informational++;
      });
    }

    countList(similarityReport.exactDuplicates || g.exact_duplicate, "exact_duplicate");
    countList(similarityReport.probableDuplicates || g.probable_duplicate, "probable_duplicate");
    countList(similarityReport.installmentRelated || g.installment_related, "installment_related");
    countList(similarityReport.recurringCandidates || g.recurring_candidate, "recurring_candidate");
    countList(similarityReport.similarTransfers || g.similar_transfer, "similar_transfer");
    countList(similarityReport.repeatedPurchases || g.repeated_purchase, "repeated_purchase");
    countList(similarityReport.informationalInstallments, "installment_related");
    countList(similarityReport.categoryReviewHints, "category_review");

    similarityReport.blockingSimilarityCount = blocking;
    similarityReport.attentionSimilarityCount = attention;
    similarityReport.informationalSimilarityCount = informational;
    similarityReport.informationalCount = informational;
    similarityReport.similaritiesTotal = blocking + attention + informational;
    similarityReport.duplicateOnlyCount =
      (similarityReport.exactDuplicates || g.exact_duplicate || []).length +
      (similarityReport.probableDuplicates || g.probable_duplicate || []).length;
    similarityReport.classifiedCount =
      (similarityReport.installmentRelated || []).length +
      (similarityReport.recurringCandidates || []).length +
      (similarityReport.similarTransfers || []).length +
      (similarityReport.informationalInstallments || []).length;

    return similarityReport;
  }

  function buildObservationBanner(blocking, attention, informational) {
    var counts = blocking + " bloqueantes · " + attention + " atenções · " +
      informational + " informativos";
    if (blocking > 0) {
      return {
        noticeClass: "notice--warning",
        icon: "⚠️",
        text: "Existem pendências que bloqueiam a importação.",
        counts: counts
      };
    }
    return {
      noticeClass: "notice--info",
      icon: "ℹ️",
      text: "Nenhum bloqueio encontrado. " + attention +
        " item(ns) merece(m) atenção e " + informational + " são informativos.",
      counts: counts
    };
  }

  function formatCardAliasesNote(card) {
    var aliases = [];
    if (card && Array.isArray(card.cardAliases)) aliases = card.cardAliases;
    else if (card && Array.isArray(card.aliases)) aliases = card.aliases;
    if (!aliases.length) return "";
    var last4s = aliases.map(function (a) {
      if (typeof a === "string") return a;
      if (a && a.lastFour) return a.lastFour;
      if (a && a.last4) return a.last4;
      return "";
    }).filter(Boolean);
    if (!last4s.length) return "";
    return "Finais observados no PDF: " + last4s.join(", ");
  }

  CFM.importSemantics = {
    isInvoiceSettled:                    isInvoiceSettled,
    isInvoiceOpenProvisional:            isInvoiceOpenProvisional,
    isInvoiceWithinTolerance:            isInvoiceWithinTolerance,
    shouldSuppressPartialReconciliation: shouldSuppressPartialReconciliation,
    getInvoiceReconciliationLabel:       getInvoiceReconciliationLabel,
    resolveInvoiceReconciliationSemantics: resolveInvoiceReconciliationSemantics,
    getInvoiceToleranceInformativeLabel: getInvoiceToleranceInformativeLabel,
    isInvoiceSettlementTransaction:      isInvoiceSettlementTransaction,
    isInvoiceSettlementForInvoice:       isInvoiceSettlementForInvoice,
    getTransactionDisplayType:           getTransactionDisplayType,
    isCategoryOutros:                    isCategoryOutros,
    isOutrosCategoryReview:              isOutrosCategoryReview,
    isInstallmentSimilarityInformational:isInstallmentSimilarityInformational,
    isInstallmentRelatedPairConsistent: isInstallmentRelatedPairConsistent,
    isObservationBlocking:               isObservationBlocking,
    isObservationAttention:              isObservationAttention,
    isObservationInformational:          isObservationInformational,
    getObservationTier:                  getObservationTier,
    annotateObservation:                 annotateObservation,
    rebuildObservationCounts:            rebuildObservationCounts,
    buildObservationBanner:              buildObservationBanner,
    isSimilarityBlocking:                isSimilarityBlocking,
    formatCardAliasesNote:               formatCardAliasesNote,
    getReconciliationDifferenceCents:    getReconciliationDifferenceCents,
    getToleranceCents:                   getToleranceCents
  };
})(window.CFM);
