/**
 * Conciliação cruzada — Fase 0.4.0 (base em memória, sem persistência).
 * Agrega candidatos e relatório explicável; semântica de status em import-semantics.js.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var STATUS_MATCHED = "matched";
  var STATUS_PARTIAL = "partial";
  var STATUS_OPEN = "open_provisional";
  var STATUS_CREDIT = "credit_balance";
  var STATUS_REFERENCE = "reference_only";
  var STATUS_UNMATCHED = "unmatched";
  var STATUS_REVIEW = "needs_review";

  function sem() {
    return CFM.importSemantics || {};
  }

  function css() {
    return CFM.cardSnapshotService || {};
  }

  function normalizeReconciliationText(str) {
    if (str == null) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getMoneyToleranceCents(invoice) {
    var s = sem();
    if (s.getToleranceCents) return s.getToleranceCents(invoice);
    if (invoice && invoice.reconciliationToleranceCents != null) {
      return invoice.reconciliationToleranceCents;
    }
    return 5;
  }

  function getInvoiceRefKeys(invoice) {
    if (!invoice) return [];
    return [invoice.id, invoice.externalRef, invoice.invoiceExternalRef]
      .filter(function (k) { return k != null && String(k).trim() !== ""; })
      .map(function (k) { return String(k); });
  }

  function txMatchesInvoiceRef(tx, invRefKeys) {
    if (!tx || !invRefKeys || !invRefKeys.length) return false;
    var txInv = tx.invoiceId || tx.invoiceExternalRef || "";
    if (txInv && invRefKeys.indexOf(String(txInv)) >= 0) return true;
    var settles = tx.settlesInvoiceId || tx.settlesInvoiceExternalRef || "";
    return settles && invRefKeys.indexOf(String(settles)) >= 0;
  }

  function isInvoicePaymentTransaction(tx) {
    if (!tx) return false;
    var s = sem();
    if (s.isExternalInvoiceSettlementTransaction &&
        s.isExternalInvoiceSettlementTransaction(tx)) {
      return true;
    }
    return tx.type === "credit_card_payment" && tx.flow === "out";
  }

  function isCreditOrRefundTransaction(tx) {
    if (!tx) return false;
    var s = sem();
    if (s.isInvoiceInternalCreditTransaction &&
        s.isInvoiceInternalCreditTransaction(tx)) {
      return true;
    }
    if (tx.type === "refund") return true;
    if (tx.flow === "in" && (tx.type === "income" || tx.subtype === "credit_balance")) {
      return true;
    }
    return false;
  }

  function isLikelyInvoiceSettlement(tx, invoice) {
    if (!tx || !invoice) return false;
    var s = sem();
    var invKeys = getInvoiceRefKeys(invoice);
    if (s.isInvoiceSettlementForInvoice &&
        s.isInvoiceSettlementForInvoice(tx, invKeys)) {
      return true;
    }
    if (isInvoicePaymentTransaction(tx) && txMatchesInvoiceRef(tx, invKeys)) {
      return true;
    }
    return false;
  }

  function getTransactionRef(tx, index) {
    if (tx && tx.stableRef) return tx.stableRef;
    var s = sem();
    if (s.getTransactionStableRef) {
      return s.getTransactionStableRef(tx, index);
    }
    return tx && (tx.id || tx.externalRef) ? String(tx.id || tx.externalRef) : "idx:" + index;
  }

  function getInvoiceTargetCents(invoice) {
    if (!invoice) return 0;
    if (invoice.amountDueCents != null) return invoice.amountDueCents;
    if (invoice.statementAmountDueCents != null) return invoice.statementAmountDueCents;
    return invoice.totalCents || 0;
  }

  function scoreInvoiceSettlementCandidate(tx, invoice, context) {
    context = context || {};
    var reasons = [];
    var score = 0;
    var invKeys = getInvoiceRefKeys(invoice);
    var tolerance = getMoneyToleranceCents(invoice);
    var target = getInvoiceTargetCents(invoice);
    var amt = tx.amountCents || 0;
    var invMonth = invoice.competenceMonth || "";
    var txMonth = tx.competenceMonth || "";

    if (context.isHistoricalPaymentForInvoice &&
        context.isHistoricalPaymentForInvoice(tx, invMonth)) {
      return { score: 0, reasonCodes: ["historical_payment_excluded"] };
    }

    if (txMatchesInvoiceRef(tx, invKeys)) {
      score += 40;
      reasons.push("linked_by_invoice_ref");
    }

    if (invMonth && txMonth && invMonth === txMonth) {
      score += 15;
      reasons.push("same_competence_month");
    }

    var registry = context.registry;
    if (registry && registry.resolveCardId) {
      var invCard = registry.resolveCardId(invoice.cardId || invoice.cardExternalRef || "");
      var txCard = registry.resolveCardId(tx.cardId || tx.cardExternalRef || "", tx.description);
      if (invCard && txCard && invCard === txCard) {
        score += 15;
        reasons.push("same_card");
      }
    }

    if (isLikelyInvoiceSettlement(tx, invoice)) {
      score += 20;
      reasons.push("settlement_semantics");
    } else if (isInvoicePaymentTransaction(tx)) {
      score += 10;
      reasons.push("payment_type");
    }

    if (target > 0 && Math.abs(amt - target) <= tolerance) {
      score += 30;
      reasons.push("amount_within_tolerance");
    } else if (target > 0 && Math.abs(amt - target) <= tolerance * 10) {
      score += 10;
      reasons.push("amount_near_target");
    }

    var desc = normalizeReconciliationText(tx.description || "");
    if (desc.indexOf("pagamento") >= 0 || desc.indexOf("fatura") >= 0 ||
        desc.indexOf("liquidacao") >= 0) {
      score += 5;
      reasons.push("description_hint");
    }

    if (tx.cashFlowTreatment === "invoice_settlement") {
      score += 10;
      reasons.push("external_settlement_flag");
    }

    if (isCreditOrRefundTransaction(tx) && !isLikelyInvoiceSettlement(tx, invoice)) {
      score = Math.max(0, score - 15);
      reasons.push("credit_not_settlement");
    }

    if (tx.type === "credit_card_purchase") {
      score = 0;
      reasons = ["purchase_not_settlement"];
    }

    return { score: Math.min(100, score), reasonCodes: reasons };
  }

  function buildInvoiceSettlementCandidates(invoice, transactions, context) {
    context = context || {};
    var candidates = [];
    (transactions || []).forEach(function (tx, index) {
      if (!tx) return;
      if (tx.type === "credit_card_purchase") return;
      var scored = scoreInvoiceSettlementCandidate(tx, invoice, context);
      if (scored.score <= 0) return;
      candidates.push({
        transactionRef: getTransactionRef(tx, index),
        transactionIndex: index,
        score: scored.score,
        reasonCodes: scored.reasonCodes,
        amountCents: tx.amountCents || 0,
        description: tx.description || ""
      });
    });
    candidates.sort(function (a, b) { return b.score - a.score; });
    return candidates;
  }

  function mapReconciliationStatus(invoice, recon) {
    if (!invoice) return STATUS_UNMATCHED;
    if (invoice.isStub || invoice.referenceOnly || invoice.isReference ||
        (recon && recon.reconciliationStatus === "reference")) {
      return STATUS_REFERENCE;
    }

    var hasCredit = invoice.balanceDirection === "credit" &&
      (invoice.creditBalanceCents || 0) > 0;
    if (hasCredit || (recon && recon.reconciliationStatus === "credit_balance")) {
      return STATUS_CREDIT;
    }

    var s = sem();
    if (s.isInvoiceOpenProvisional && s.isInvoiceOpenProvisional(invoice)) {
      return STATUS_OPEN;
    }
    if (recon && recon.reconciliationStatus === "provisional") {
      return STATUS_OPEN;
    }

    var raw = recon ? recon.reconciliationStatus : (invoice.reconciliationStatus || "");
    if (raw === "settled" || raw === "consistent" || raw === "explained_by_payment") {
      return STATUS_MATCHED;
    }
    if (raw === "partial") return STATUS_PARTIAL;
    if (raw === "requires_review") return STATUS_REVIEW;
    if (raw === "credit_balance") return STATUS_CREDIT;
    return STATUS_UNMATCHED;
  }

  function getInvoiceReconciliationStatus(invoice, recon, options) {
    options = options || {};
    var status = mapReconciliationStatus(invoice, recon);
    var tolerance = getMoneyToleranceCents(invoice);
    var delta = recon && recon.reconciliationDeltaCents != null
      ? recon.reconciliationDeltaCents
      : 0;
    var withinTol = Math.abs(delta) <= tolerance;
    var reasonCodes = [];
    var displayMessage = recon && recon.message ? recon.message : "";
    var confidence = recon && recon.confidence ? recon.confidence : "medium";

    if (status === STATUS_MATCHED) {
      if (withinTol && Math.abs(delta) > 0) {
        reasonCodes.push("within_tolerance");
        if (!displayMessage) {
          displayMessage = "Conciliada com diferença informativa dentro da tolerância.";
        }
      } else {
        reasonCodes.push("amounts_consistent");
        if (!displayMessage) displayMessage = "Conciliada — valores consistentes.";
      }
    } else if (status === STATUS_OPEN) {
      reasonCodes.push("open_provisional_invoice");
      if (!displayMessage) {
        displayMessage = "Fatura aberta ou provisória — conciliação não é pendência bloqueante.";
      }
      confidence = "medium";
    } else if (status === STATUS_CREDIT) {
      reasonCodes.push("credit_balance");
      if (!displayMessage) {
        displayMessage = "Saldo credor — abatimento futuro, não é erro de conciliação.";
      }
    } else if (status === STATUS_REFERENCE) {
      reasonCodes.push("reference_only");
      if (!displayMessage) {
        displayMessage = "Fatura de referência — sem conciliação consolidada.";
      }
    } else if (status === STATUS_PARTIAL) {
      reasonCodes.push("partial_linked_transactions");
      if (!displayMessage) {
        displayMessage = "Conciliação parcial — nem todos os lançamentos estão vinculados.";
      }
    } else if (status === STATUS_REVIEW) {
      reasonCodes.push("requires_manual_review");
      if (!displayMessage) displayMessage = "Revisão recomendada — diferença fora da tolerância.";
    } else {
      reasonCodes.push("no_settlement_match");
      if (!displayMessage) displayMessage = "Sem vínculo bancário identificado.";
      confidence = "low";
    }

    if (options.candidates && options.candidates.length) {
      reasonCodes.push("settlement_candidates:" + options.candidates.length);
    }

    return {
      status: status,
      confidence: confidence,
      amountDeltaCents: delta,
      withinTolerance: withinTol,
      reasonCodes: reasonCodes,
      displayMessage: displayMessage,
      blocking: false
    };
  }

  function buildInvoiceReconciliationEntry(invoice, transactions, context, enrichedTransactions) {
    var buildRecon = css().buildInvoiceReconciliation;
    var recon = buildRecon
      ? buildRecon(invoice, transactions, context)
      : null;
    var candidates = buildInvoiceSettlementCandidates(invoice, transactions, context);
    var candidateRefs = candidates.slice(0, 8).map(function (c) { return c.transactionRef; });
    var statusInfo = getInvoiceReconciliationStatus(invoice, recon, { candidates: candidates });

    var invRef = invoice.externalRef || invoice.id || invoice.invoiceExternalRef || "";

    return {
      invoiceRef: invRef,
      competenceMonth: invoice.competenceMonth || "",
      candidateTransactionRefs: candidateRefs,
      settlementCandidates: candidates,
      status: statusInfo.status,
      confidence: statusInfo.confidence,
      amountDeltaCents: statusInfo.amountDeltaCents,
      withinTolerance: statusInfo.withinTolerance,
      reasonCodes: statusInfo.reasonCodes,
      displayMessage: statusInfo.displayMessage,
      blocking: statusInfo.blocking,
      technicalDetails: {
        reconciliationStatus: recon ? recon.reconciliationStatus : null,
        explainedByPayments: recon ? recon.explainedByPayments : false,
        linkedSettlementCount: recon ? recon.linkedSettlementCount : 0,
        linkedPaymentCount: recon ? recon.linkedPaymentCount : 0,
        linkedChargeCount: recon ? recon.linkedCount : 0,
        toleranceCents: getMoneyToleranceCents(invoice)
      }
    };
  }

  /**
   * Relatório de conciliação em memória — não altera payload JSON.
   * @param {Object} options
   * @param {Array} options.invoices
   * @param {Array} options.transactions — transações brutas (índices de candidatos)
   * @param {Object} [options.reconContext]
   * @param {Object} [options.registry]
   * @returns {Object}
   */
  function buildReconciliationReport(options) {
    options = options || {};
    var invoices = options.invoices || [];
    var transactions = options.transactions || [];
    var context = options.reconContext || {};
    if (options.registry && !context.registry) {
      context.registry = options.registry;
    }

    var entries = invoices.map(function (inv) {
      return buildInvoiceReconciliationEntry(inv, transactions, context, options.enrichedTransactions);
    });

    var summary = {
      total: entries.length,
      matched: 0,
      partial: 0,
      openProvisional: 0,
      creditBalance: 0,
      referenceOnly: 0,
      unmatched: 0,
      needsReview: 0,
      blocking: 0
    };

    entries.forEach(function (e) {
      if (e.status === STATUS_MATCHED) summary.matched++;
      else if (e.status === STATUS_PARTIAL) summary.partial++;
      else if (e.status === STATUS_OPEN) summary.openProvisional++;
      else if (e.status === STATUS_CREDIT) summary.creditBalance++;
      else if (e.status === STATUS_REFERENCE) summary.referenceOnly++;
      else if (e.status === STATUS_REVIEW) summary.needsReview++;
      else summary.unmatched++;
      if (e.blocking) summary.blocking++;
    });

    return {
      version: "0.4.0",
      generatedInMemory: true,
      persisted: false,
      definitive: false,
      entries: entries,
      summary: summary
    };
  }

  CFM.importReconciliation = {
    normalizeReconciliationText: normalizeReconciliationText,
    getMoneyToleranceCents: getMoneyToleranceCents,
    isInvoicePaymentTransaction: isInvoicePaymentTransaction,
    isCreditOrRefundTransaction: isCreditOrRefundTransaction,
    isLikelyInvoiceSettlement: isLikelyInvoiceSettlement,
    buildInvoiceSettlementCandidates: buildInvoiceSettlementCandidates,
    scoreInvoiceSettlementCandidate: scoreInvoiceSettlementCandidate,
    getInvoiceReconciliationStatus: getInvoiceReconciliationStatus,
    buildReconciliationReport: buildReconciliationReport,
    mapReconciliationStatus: mapReconciliationStatus,
    STATUS: {
      MATCHED: STATUS_MATCHED,
      PARTIAL: STATUS_PARTIAL,
      OPEN_PROVISIONAL: STATUS_OPEN,
      CREDIT_BALANCE: STATUS_CREDIT,
      REFERENCE_ONLY: STATUS_REFERENCE,
      UNMATCHED: STATUS_UNMATCHED,
      NEEDS_REVIEW: STATUS_REVIEW
    }
  };
})(window.CFM);
