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

  function isInvoiceInternalCreditTransaction(tx) {
    if (!tx) return false;
    if (tx.type === "credit_card_payment" && tx.flow === "in") return true;
    if (tx.flow === "in" && tx.invoiceBalanceEffect === "decreases_amount_due") return true;
    if (tx.type === "credit_card_payment" &&
        tx.invoiceBalanceEffect === "decreases_amount_due" &&
        tx.cashFlowTreatment !== "invoice_settlement") {
      return true;
    }
    return false;
  }

  function isExternalInvoiceSettlementTransaction(tx) {
    if (!tx) return false;
    if (isInvoiceInternalCreditTransaction(tx) && tx.cashFlowTreatment !== "invoice_settlement") {
      return false;
    }
    if (tx.cashFlowTreatment === "invoice_settlement") return true;
    if (tx.type === "credit_card_payment" && tx.flow === "out") return true;
    if (tx.expenseImpact === "none_when_purchases_are_counted" && tx.flow === "out") return true;
    if (tx.affectsInvoiceBalance === true && tx.flow === "out" &&
        tx.type !== "credit_card_purchase") {
      return true;
    }
    return false;
  }

  function isInvoiceSettlementTransaction(tx) {
    if (!tx) return false;
    return isInvoiceInternalCreditTransaction(tx) ||
      isExternalInvoiceSettlementTransaction(tx);
  }

  function isInvoiceSettlementForInvoice(tx, invRefKeys) {
    if (!tx) return false;
    if (isExternalInvoiceSettlementTransaction(tx)) return true;
    if (invRefKeys && invRefKeys.length) {
      var settles = tx.settlesInvoiceExternalRef || tx.settlesInvoiceId || "";
      if (settles && invRefKeys.indexOf(String(settles)) >= 0) return true;
    }
    return false;
  }

  function getTransactionDisplayType(tx) {
    if (isInvoiceInternalCreditTransaction(tx)) {
      return {
        label: "Crédito na fatura",
        cls: "type-badge--invoice-credit",
        isSettlement: false,
        isInvoiceCredit: true
      };
    }
    if (isExternalInvoiceSettlementTransaction(tx)) {
      var label = tx.type === "credit_card_payment"
        ? "Pagamento de fatura"
        : "Liquidação de fatura";
      return { label: label, cls: "type-badge--settlement", isSettlement: true };
    }
    return null;
  }

  function getInvoicePaymentBreakdown(invoice) {
    return (invoice && invoice.paymentBreakdown) || {};
  }

  function pickInvoiceCents(primary, fallback) {
    if (primary != null) return primary;
    if (fallback != null) return fallback;
    return 0;
  }

  function getInvoiceDisplayAmounts(invoice, recon) {
    var pb = getInvoicePaymentBreakdown(invoice);
    var charges = pickInvoiceCents(
      invoice && invoice.invoiceChargesCents,
      recon && recon.invoiceChargesCents
    );
    var internalCredits = pickInvoiceCents(
      invoice && invoice.invoicePaymentsCreditsCents,
      pickInvoiceCents(pb.invoiceStatementCreditsCents, recon && recon.invoicePaymentsCreditsCents)
    );
    var externalSettlement = pickInvoiceCents(
      invoice && invoice.settlementPaymentsCents,
      pickInvoiceCents(pb.externalSettlementPaymentsCents, recon && recon.settlementPaymentsCents)
    );
    var amountDue = pickInvoiceCents(
      invoice && invoice.amountDueCents,
      pickInvoiceCents(invoice && invoice.statementAmountDueCents, recon && recon.invoiceTotalCents)
    );
    return {
      amountDueCents: amountDue,
      chargesCents: charges,
      internalCreditsCents: internalCredits,
      externalSettlementCents: externalSettlement,
      previousBalanceCents: pickInvoiceCents(invoice && invoice.previousBalanceCents, 0),
      statementAmountDueCents: pickInvoiceCents(
        invoice && invoice.statementAmountDueCents,
        amountDue
      ),
      paymentOnInvoiceCents: pickInvoiceCents(pb.invoiceStatementPaymentCreditsCents, 0),
      refundCreditsCents: pickInvoiceCents(pb.refundCreditsCents, 0)
    };
  }

  function hasInternalInvoiceCredits(invoice) {
    if (!invoice) return false;
    var pb = getInvoicePaymentBreakdown(invoice);
    var amounts = getInvoiceDisplayAmounts(invoice, null);
    return amounts.internalCreditsCents > 0 ||
      amounts.paymentOnInvoiceCents > 0 ||
      pb.invoiceStatementCreditsCents > 0 ||
      pb.invoiceStatementPaymentCreditsCents > 0;
  }

  function hasExternalSettlement(invoice) {
    if (!invoice) return false;
    return getInvoiceDisplayAmounts(invoice, null).externalSettlementCents > 0;
  }

  function getInvoiceCreditLabel(invoice) {
    if (!invoice) return "Créditos/Pagamentos na fatura";
    if (invoice.status === "paid" || invoice.reconciliationStatus === "settled") {
      return "Créditos internos da fatura";
    }
    return "Créditos/Pagamentos na fatura";
  }

  function getInvoiceSettlementLabel(invoice) {
    if (!hasExternalSettlement(invoice)) return "";
    return "Liquidação externa/BB";
  }

  function getInvoicePaymentBreakdownRows(invoice, formatFn) {
    var pb = getInvoicePaymentBreakdown(invoice);
    var fmt = formatFn || function (c) { return String(c); };
    var rows = [];

    if (pb.invoiceStatementPaymentCreditsCents > 0) {
      rows.push({
        label: "Pagamento lançado na fatura",
        cents: pb.invoiceStatementPaymentCreditsCents,
        fmt: fmt(pb.invoiceStatementPaymentCreditsCents)
      });
    }
    if (pb.refundCreditsCents > 0) {
      rows.push({
        label: "Estornos/créditos",
        cents: pb.refundCreditsCents,
        fmt: fmt(pb.refundCreditsCents)
      });
    }
    if (pb.invoiceStatementCreditsCents > 0 &&
        !pb.invoiceStatementPaymentCreditsCents) {
      rows.push({
        label: "Créditos internos da fatura",
        cents: pb.invoiceStatementCreditsCents,
        fmt: fmt(pb.invoiceStatementCreditsCents)
      });
    }
    return rows;
  }

  function getInvoicePrimaryDisplay(invoice, recon, transactions, formatFn) {
    var fmt = formatFn || function (c) { return String(c); };
    var amounts = getInvoiceDisplayAmounts(invoice, recon);
    var isPaid = isInvoicePaidForDisplay(invoice);
    var isOpen = isInvoiceOpenProvisional(invoice) || (invoice && invoice.status === "open");
    var primaryCents = 0;
    var secondary = [];

    if (isPaid && invoice) {
      if (invoice.totalCents > 0) primaryCents = invoice.totalCents;
      else if (invoice.statementTotalCents > 0) primaryCents = invoice.statementTotalCents;
      else if (amounts.chargesCents > 0) primaryCents = amounts.chargesCents;
      else if (invoice.chargesCents > 0) primaryCents = invoice.chargesCents;
      else if (invoice.expensesCents > 0) primaryCents = invoice.expensesCents;
      else if (invoice.debitsCents > 0) primaryCents = invoice.debitsCents;
      else if (recon && recon.linkedPurchasesCents > 0) primaryCents = recon.linkedPurchasesCents;
      else if (recon && recon.invoiceChargesCents > 0) primaryCents = recon.invoiceChargesCents;
      else {
        var linkedSum = sumLinkedPurchaseOutflows(invoice, transactions);
        if (linkedSum > 0) primaryCents = linkedSum;
        else if (amounts.externalSettlementCents > 0) primaryCents = amounts.externalSettlementCents;
        else primaryCents = amounts.amountDueCents;
      }

      if (amounts.chargesCents > 0) {
        secondary.push({ label: "Compras/encargos", fmt: fmt(amounts.chargesCents) });
      }
      var payCred = amounts.internalCreditsCents + amounts.externalSettlementCents;
      if (payCred > 0) {
        secondary.push({ label: "Pagamentos/créditos", fmt: fmt(payCred) });
      }
      var finalBal = amounts.amountDueCents != null
        ? amounts.amountDueCents
        : amounts.statementAmountDueCents;
      if (finalBal === 0 && primaryCents > 0) {
        secondary.push({ label: "Saldo final", fmt: fmt(0) });
      }
      if (invoice.hasCredit && invoice.creditBalanceCents > 0) {
        secondary.push({
          label: "Saldo positivo",
          fmt: fmt(invoice.creditBalanceCents),
          note: "será abatido da próxima fatura"
        });
      }
    } else if (invoice) {
      primaryCents = amounts.amountDueCents || amounts.statementAmountDueCents ||
        invoice.totalCents || invoice.amountDueCents || 0;
      if (amounts.chargesCents > 0 && amounts.chargesCents !== primaryCents) {
        secondary.push({ label: "Compras/encargos", fmt: fmt(amounts.chargesCents) });
      }
    }

    return {
      primaryCents: primaryCents,
      primaryFmt: fmt(primaryCents),
      primaryLabel: "Total da fatura",
      statusHint: isPaid ? "Fatura quitada" : (isOpen ? "Fatura aberta" : ""),
      secondaryLines: secondary,
      isPaid: isPaid,
      isOpen: isOpen
    };
  }

  function isInvoicePaidForDisplay(invoice) {
    if (!invoice) return false;
    if (invoice.status === "paid") return true;
    if (invoice.reconciliationStatus === "settled") return true;
    if (isInvoiceSettled(invoice)) return true;
    if (invoice.explainedByPayments && invoice.status !== "open") return true;
    if ((invoice.amountDueCents === 0 || invoice.statementAmountDueCents === 0) &&
        invoice.status === "paid") return true;
    return false;
  }

  function sumLinkedPurchaseOutflows(invoice, transactions) {
    if (!invoice || !transactions) return 0;
    var invKeys = [invoice.id, invoice.externalRef, invoice.invoiceExternalRef].filter(Boolean);
    var sum = 0;
    transactions.forEach(function (tx) {
      if (!tx || tx.flow !== "out") return;
      if (tx.type === "credit_card_payment" || tx.type === "refund") return;
      if (isInvoiceInternalCreditTransaction(tx) || isExternalInvoiceSettlementTransaction(tx)) return;
      var txInv = tx.invoiceId || tx.invoiceExternalRef || "";
      if (invKeys.indexOf(txInv) < 0) return;
      sum += tx.amountCents || 0;
    });
    return sum;
  }

  function txInstallmentCurrent(tx) {
    if (!tx) return null;
    if (tx.installment && tx.installment.current != null) return Number(tx.installment.current);
    var m = String(tx.description || "").match(/(?:parcela?\s*)?(\d+)\s*[/\\]\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function txInstallmentTotal(tx) {
    if (!tx) return null;
    if (tx.installment && tx.installment.total != null) return Number(tx.installment.total);
    var m = String(tx.description || "").match(/(?:parcela?\s*)?(\d+)\s*[/\\]\s*(\d+)/i);
    return m ? parseInt(m[2], 10) : null;
  }

  function shouldSuppressRepeatedPurchasePair(pair, transactions, installmentPlans) {
    if (!pair || !transactions) return false;
    var pseudo = Object.assign({}, pair, { classification: "installment_related" });
    if (isInstallmentRelatedPairConsistent(pseudo, transactions, installmentPlans)) return true;

    var indices = observationIndices(pair);
    if (indices.length < 2) return false;
    var txA = transactions[indices[0]];
    var txB = transactions[indices[1]];
    if (!txA || !txB) return false;

    var refA = txPlanRef(txA);
    var refB = txPlanRef(txB);
    if (refA && refB && refA === refB) return true;

    if (hasInstallmentIndicator(txA, installmentPlans) &&
        hasInstallmentIndicator(txB, installmentPlans)) {
      return true;
    }

    var curA = txInstallmentCurrent(txA);
    var curB = txInstallmentCurrent(txB);
    var totA = txInstallmentTotal(txA);
    var totB = txInstallmentTotal(txB);
    if (curA != null && curB != null && curA !== curB && totA && totA === totB) return true;

    var cardA = txA.cardId || txA.cardExternalRef || "";
    var cardB = txB.cardId || txB.cardExternalRef || "";
    if (cardA && cardA === cardB &&
        amountsEquivalent(txA.amountCents, txB.amountCents) &&
        descriptionsSimilarBase(
          normalizeMerchantBase(txA.description),
          normalizeMerchantBase(txB.description)
        )) {
      if (curA != null && curB != null && curA !== curB) return true;
      if (/parcela?\s*\d+\s*[/\\]\s*\d+/i.test(txA.description || "") ||
          /parcela?\s*\d+\s*[/\\]\s*\d+/i.test(txB.description || "")) {
        return true;
      }
    }

    return false;
  }

  function findTransactionByRef(transactions, ref) {
    if (!ref || !transactions) return null;
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (!tx) continue;
      if (getTransactionStableRef(tx, i) === ref) return tx;
      if (tx.id === ref || tx.externalRef === ref || tx.transactionExternalRef === ref) return tx;
    }
    return null;
  }

  function getRecurringDisplayAmount(rule, transactions) {
    if (!rule) return { amountCents: null, label: "Valor a confirmar", hasValue: false };

    var cents = rule.amountCents || rule.expectedAmountCents || rule.valueCents ||
      rule.monthlyAmountCents || rule.lastAmountCents || rule.averageAmountCents || 0;
    if (cents > 0) return { amountCents: cents, label: null, hasValue: true };

    var refs = rule.transactionRefs || rule.linkedTransactionRefs || rule.sourceTransactionRefs || [];
    if (!Array.isArray(refs)) refs = [refs];
    for (var r = 0; r < refs.length; r++) {
      var linked = findTransactionByRef(transactions, refs[r]);
      if (linked && linked.amountCents > 0) {
        return { amountCents: linked.amountCents, label: null, hasValue: true };
      }
    }

    if (rule.description && transactions && transactions.length) {
      var base = normalizeMerchantBase(rule.description);
      var ruleFlow = rule.flow || "out";
      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        if (!tx || (tx.flow || "out") !== ruleFlow) continue;
        if (!descriptionsSimilarBase(base, normalizeMerchantBase(tx.description))) continue;
        if (tx.amountCents > 0) {
          return { amountCents: tx.amountCents, label: null, hasValue: true };
        }
      }
    }

    return { amountCents: null, label: "Valor a confirmar", hasValue: false };
  }

  function getRecurringConfidenceLabel(rule) {
    if (!rule || rule.confidence == null || rule.confidence === "") return "";
    var c = Number(rule.confidence);
    if (!isNaN(c) && c >= 90) return "Confirmada pelo histórico";
    if (!isNaN(c) && c >= 70) return "Boa consistência";
    if (rule.confidence === "high") return "Confirmada pelo histórico";
    if (rule.confidence === "medium") return "Boa consistência";
    return "";
  }

  function getTransactionCompareHint(txA, txB) {
    if (!txA || !txB) return "";
    if (txA.amountCents === txB.amountCents &&
        normalizeMerchantBase(txA.description) === normalizeMerchantBase(txB.description)) {
      return "Possível repetição: mesmo valor e nome parecido, mas em datas diferentes.";
    }
    if (txA.amountCents === txB.amountCents) {
      return "Mesmo valor — confira se foram compras distintas ou duplicata.";
    }
    return "Confira data, fatura e cartão antes de decidir.";
  }

  function getTransactionTypeLabel(type, tx) {
    var display = getTransactionDisplayType(tx || { type: type });
    if (display && display.label) return display.label;
    var map = {
      credit_card_purchase: "Compra no cartão",
      credit_card_payment: "Pagamento de fatura",
      income: "Receita",
      expense: "Despesa",
      transfer: "Transferência",
      refund: "Reembolso",
      fee: "Tarifa",
      adjustment: "Ajuste"
    };
    return map[type] || type || "Lançamento";
  }

  function getTransactionInstallmentLabel(tx) {
    if (!tx) return "";
    var cur = txInstallmentCurrent(tx);
    var tot = txInstallmentTotal(tx);
    if (cur != null && tot != null) return "Parcela " + cur + "/" + tot;
    if (tx.installmentPlanId || tx.installmentPlanExternalRef) return "Parcelamento";
    return "";
  }

  function isRecurringRuleCandidate(rule) {
    if (!rule) return false;
    if (rule.candidate === true) return true;
    if (rule.status === "candidate") return true;
    if (rule.recurrenceKind === "candidate") return true;
    if (String(rule.externalRef || "").indexOf("_candidate") >= 0) return true;
    return false;
  }

  /**
   * Recorrência confirmada pelo usuário no JSON (não deve gerar observação candidata).
   */
  function isRecurringRuleUserConfirmed(rule) {
    if (!rule || isRecurringRuleCandidate(rule)) return false;
    if (rule.status !== "active") return false;
    if (rule.active === false) return false;
    if (rule.userConfirmed !== true) return false;
    if (rule.candidate === true) return false;
    return true;
  }

  function isRecurringRuleActive(rule) {
    if (!rule || isRecurringRuleCandidate(rule)) return false;
    if (isRecurringRuleUserConfirmed(rule)) return true;
    if (rule.status === "active" && rule.active !== false) return true;
    if (rule.status === "inactive" || rule.status === "candidate") return false;
    return rule.isActive !== false;
  }

  function getRecurringRuleDisplayState(rule) {
    if (isRecurringRuleCandidate(rule)) return "candidate";
    if (isRecurringRuleActive(rule)) return "active";
    return "inactive";
  }

  function getRecurringRuleBadges(rule) {
    var state = getRecurringRuleDisplayState(rule);
    if (state === "candidate") {
      return [
        { label: "Candidata", cls: "status-chip--open", kind: "state" },
        { label: "Atenção", cls: "confidence-badge--warning", kind: "attention" }
      ];
    }
    if (state === "active") {
      return [{ label: "Ativa", cls: "status-chip--paid", kind: "state" }];
    }
    return [{ label: "Inativa", cls: "status-chip--other", kind: "state" }];
  }

  function getRecurringRuleImportImpact(rule) {
    return {
      blocksImport: false,
      isConfirmed: isRecurringRuleUserConfirmed(rule) || isRecurringRuleActive(rule),
      isCandidate: isRecurringRuleCandidate(rule),
      showNonBlockingNote: isRecurringRuleCandidate(rule)
    };
  }

  function getTransactionRecurrenceRuleRef(tx) {
    if (!tx) return "";
    return String(
      tx.recurrenceRuleExternalRef ||
      tx.recurringRuleExternalRef ||
      tx.recurrenceRuleId ||
      ""
    ).trim();
  }

  function buildRecurringRuleLookup(recurringRules) {
    var byRef = {};
    var confirmedByMerchantAmount = [];

    (recurringRules || []).forEach(function (rule) {
      if (!rule) return;
      var ref = String(rule.externalRef || rule.id || "").trim();
      if (ref) byRef[ref] = rule;
      if (rule.id && String(rule.id).trim() && !byRef[rule.id]) {
        byRef[rule.id] = rule;
      }
      if (!isRecurringRuleUserConfirmed(rule)) return;
      var amount = rule.expectedAmountCents != null
        ? rule.expectedAmountCents
        : rule.amountCents;
      if (amount == null) return;
      var merchant = normalizeMerchantBase(
        rule.description || rule.sourcePattern || rule.merchantPattern || ""
      );
      if (!merchant) return;
      confirmedByMerchantAmount.push({
        merchant: merchant,
        amountCents: amount,
        rule: rule
      });
    });

    return { byRef: byRef, confirmedByMerchantAmount: confirmedByMerchantAmount };
  }

  function matchesConfirmedRecurringMerchantAmount(tx, lookup) {
    if (!tx || !lookup || !lookup.confirmedByMerchantAmount) return false;
    var amount = tx.amountCents;
    if (amount == null) return false;
    var merchant = normalizeMerchantBase(tx.description || tx.merchantName || "");
    if (!merchant) return false;

    for (var i = 0; i < lookup.confirmedByMerchantAmount.length; i++) {
      var entry = lookup.confirmedByMerchantAmount[i];
      if (!amountsEquivalent(entry.amountCents, amount)) continue;
      if (merchant === entry.merchant) return true;
      if (descriptionsSimilarBase(merchant, entry.merchant)) return true;
    }
    return false;
  }

  function isTransactionRecurrenceConfirmed(tx, lookup) {
    if (!tx) return false;
    if (tx.userConfirmedRecurring === true) return true;
    if (tx.recurrenceStatus === "confirmed_active") return true;

    var ref = getTransactionRecurrenceRuleRef(tx);
    if (ref && lookup && lookup.byRef && lookup.byRef[ref]) {
      if (isRecurringRuleUserConfirmed(lookup.byRef[ref])) return true;
    }

    return matchesConfirmedRecurringMerchantAmount(tx, lookup);
  }

  function shouldSuppressRecurringCandidatePair(pair, transactions, lookup) {
    if (!pair || !transactions) return false;
    var indices = [pair.index1, pair.index2, pair.indexA, pair.indexB];
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (idx == null) continue;
      if (isTransactionRecurrenceConfirmed(transactions[idx], lookup)) return true;
    }
    return false;
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

  function getTransactionStableRef(tx, index) {
    if (!tx) return index != null ? "idx:" + index : "";
    return String(
      tx.id || tx.externalRef || tx.transactionExternalRef ||
      (index != null ? "idx:" + index : "")
    ).trim();
  }

  function getStableTransactionRef(tx, index) {
    return getTransactionStableRef(tx, index);
  }

  function matchTransactionRef(tx, ref) {
    if (!tx || ref == null || ref === "") return false;
    var needle = String(ref).trim();
    if (tx.stableRef === needle) return true;
    if (tx.id && String(tx.id) === needle) return true;
    if (tx.externalRef && String(tx.externalRef) === needle) return true;
    if (needle.indexOf("idx:") === 0 && tx.index != null) {
      return needle === ("idx:" + tx.index);
    }
    return false;
  }

  function findEnrichedTransactionByRef(transactions, ref) {
    if (!ref) return null;
    for (var i = 0; i < (transactions || []).length; i++) {
      if (matchTransactionRef(transactions[i], ref)) return transactions[i];
    }
    return null;
  }

  function pushUniqueRef(list, value) {
    if (!value) return;
    var v = String(value).trim();
    if (v && list.indexOf(v) < 0) list.push(v);
  }

  function getObservationTransactionRefs(obs) {
    var refs = [];
    if (!obs) return refs;
    if (obs.transactionRef1) refs.push(obs.transactionRef1);
    if (obs.transactionRef2 && obs.transactionRef2 !== obs.transactionRef1) {
      refs.push(obs.transactionRef2);
    }
    return refs;
  }

  function extractObservationRefBundle(obs, transactions, installmentPlans) {
    var stableRefs = [];
    var externalRefs = [];
    var transactionRefs = [];
    var installmentPlanRefs = [];
    var groupKeys = [];
    getObservationTransactionRefs(obs).forEach(function (ref) {
      pushUniqueRef(transactionRefs, ref);
      pushUniqueRef(stableRefs, ref);
    });
    observationIndices(obs).forEach(function (idx) {
      var tx = transactions && transactions[idx];
      if (!tx) return;
      var sref = getStableTransactionRef(tx, idx);
      var eref = tx.externalRef || tx.transactionExternalRef || "";
      pushUniqueRef(stableRefs, sref);
      pushUniqueRef(transactionRefs, sref);
      if (eref) pushUniqueRef(externalRefs, eref);
      if (tx.id) pushUniqueRef(externalRefs, tx.id);
      var pref = txPlanRef(tx);
      if (pref) pushUniqueRef(installmentPlanRefs, pref);
      var gk = buildInstallmentGroupKeyFromTx(tx, installmentPlans);
      if (gk) pushUniqueRef(groupKeys, gk);
    });
    if (obs.installmentGroupFilter) {
      var gf = obs.installmentGroupFilter;
      (gf.transactionRefs || []).forEach(function (ref) {
        pushUniqueRef(transactionRefs, ref);
        pushUniqueRef(stableRefs, ref);
      });
      (gf.installmentPlanRefs || []).forEach(function (ref) {
        pushUniqueRef(installmentPlanRefs, ref);
      });
      if (gf.groupKey) pushUniqueRef(groupKeys, gf.groupKey);
    }
    return {
      stableRefs: stableRefs,
      externalRefs: externalRefs,
      transactionRefs: transactionRefs,
      installmentPlanRefs: installmentPlanRefs,
      groupKeys: groupKeys
    };
  }

  function enrichObservationTransactionRefs(obs, transactions) {
    var copy = Object.assign({}, obs);
    var i1 = obs.index1 != null ? obs.index1 : obs.indexA;
    var i2 = obs.index2 != null ? obs.index2 : obs.indexB;
    var tx1 = transactions && i1 != null ? transactions[i1] : null;
    var tx2 = transactions && i2 != null ? transactions[i2] : null;
    copy.transactionRef1 = getStableTransactionRef(tx1, i1);
    copy.transactionRef2 = getStableTransactionRef(tx2, i2);
    copy.displayIndex1 = i1;
    copy.displayIndex2 = i2;
    var refs = [copy.transactionRef1, copy.transactionRef2].filter(Boolean).sort();
    copy.pairKey = (copy.classification || "observation") + ":" + refs.join("|");
    return copy;
  }

  var PT_MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  function formatCompetenceHuman(month) {
    if (!month) return "";
    var parts = String(month).split("-");
    if (parts.length !== 2) return month;
    var m = parseInt(parts[1], 10);
    var name = PT_MONTHS[m - 1] || parts[1];
    return name + "/" + parts[0];
  }

  function getInvoiceHumanLabel(invoiceRef, invoiceLookup) {
    if (!invoiceRef) return "";
    var inv = invoiceLookup && invoiceLookup[invoiceRef];
    if (inv) {
      if (inv.competenceMonth) return formatCompetenceHuman(inv.competenceMonth);
      if (inv.competenceFmt) return inv.competenceFmt;
    }
    var match = String(invoiceRef).match(/(\d{4})-(\d{2})$/);
    if (match) return formatCompetenceHuman(match[1] + "-" + match[2]);
    return "";
  }

  function isTechnicalSourceLabel(label) {
    if (!label) return false;
    return /importad[oa]\s*(do|de)\s*json/i.test(String(label));
  }

  function getObservationContextKind(obs) {
    if (!obs) return "generic";
    if (obs.contextKind) return obs.contextKind;
    var cls = getObservationClassification(obs);
    var type = String(obs.type || obs.observationType || "").trim();
    if (cls === "repeated_purchase" || type === "repeated_purchase") return "repeated_purchase";
    if (cls === "installment_related" || type === "installment_related" ||
        type === "installment_match" || type === "installment_group") {
      return "installment_related";
    }
    if (cls === "recurring_candidate" || type === "recurring_candidate") return "recurring_candidate";
    if (type === "security" || cls === "privacy" || cls === "privacy_alert") return "security";
    if (obs.informational || obs.severity === "info" || cls === "category_review") return "info";
    return "generic";
  }

  function buildInstallmentGroupKeyFromTx(tx, installmentPlans) {
    if (!tx) return "";
    var planRef = txPlanRef(tx);
    if (planRef) return "plan:" + planRef;
    if (tx.installmentGroupKey) return "group:" + String(tx.installmentGroupKey);
    if (tx.planExternalRef) return "plan:" + String(tx.planExternalRef);
    var card = tx.cardId || tx.cardExternalRef || "";
    var base = normalizeMerchantBase(tx.description);
    var tot = txInstallmentTotal(tx);
    var amt = tx.amountCents;
    if (card && base && tot != null && amt != null) {
      return "derived:" + card + "|" + base + "|" + tot + "|" + amt;
    }
    return "";
  }

  function buildInstallmentGroupFilter(obs, transactions, installmentPlans) {
    var indices = observationIndices(obs);
    var planRefs = [];
    var transactionRefs = [];
    var groupKeys = [];
    indices.forEach(function (idx) {
      var tx = transactions && transactions[idx];
      if (!tx) return;
      transactionRefs.push(getStableTransactionRef(tx, idx));
      var pref = txPlanRef(tx);
      if (pref && planRefs.indexOf(pref) < 0) planRefs.push(pref);
      var gk = buildInstallmentGroupKeyFromTx(tx, installmentPlans);
      if (gk && groupKeys.indexOf(gk) < 0) groupKeys.push(gk);
    });
    var groupKey = planRefs.length ? ("plan:" + planRefs[0]) : (groupKeys[0] || "");
    if (!groupKey && transactionRefs.length) {
      groupKey = "txset:" + transactionRefs.slice().sort().join("|");
    }
    var stableRefs = transactionRefs.slice();
    var externalRefs = [];
    indices.forEach(function (idx) {
      var tx = transactions && transactions[idx];
      if (!tx) return;
      if (tx.externalRef) pushUniqueRef(externalRefs, tx.externalRef);
      if (tx.id) pushUniqueRef(externalRefs, tx.id);
    });
    return {
      kind: "installment_group",
      groupKey: groupKey,
      installmentPlanRefs: planRefs,
      transactionRefs: transactionRefs,
      stableRefs: stableRefs,
      externalRefs: externalRefs,
      groupKeys: groupKeys.length ? groupKeys.slice() : (groupKey ? [groupKey] : []),
      sourceObservationKey: obs.pairKey || ""
    };
  }

  function buildInstallmentObservationFilter(observations, transactions, installmentPlans) {
    var pairKeys = [];
    var observationKeys = [];
    var stableRefs = [];
    var externalRefs = [];
    var transactionRefs = [];
    var installmentPlanRefs = [];
    var groupKeys = [];
    var obsSnapshots = [];
    (observations || []).forEach(function (obs) {
      if (!obs) return;
      var pk = obs.pairKey || "";
      pushUniqueRef(pairKeys, pk);
      pushUniqueRef(observationKeys, pk);
      var bundle = extractObservationRefBundle(obs, transactions, installmentPlans);
      bundle.stableRefs.forEach(function (ref) { pushUniqueRef(stableRefs, ref); });
      bundle.externalRefs.forEach(function (ref) { pushUniqueRef(externalRefs, ref); });
      bundle.transactionRefs.forEach(function (ref) { pushUniqueRef(transactionRefs, ref); });
      bundle.installmentPlanRefs.forEach(function (ref) { pushUniqueRef(installmentPlanRefs, ref); });
      bundle.groupKeys.forEach(function (ref) { pushUniqueRef(groupKeys, ref); });
      obsSnapshots.push(obs);
    });
    return {
      mode: "all_related_observations",
      source: "observations",
      observationKeys: observationKeys,
      pairKeys: pairKeys,
      transactionRefs: transactionRefs,
      stableRefs: stableRefs,
      externalRefs: externalRefs,
      installmentPlanRefs: installmentPlanRefs,
      groupKeys: groupKeys,
      observations: obsSnapshots,
      observationCount: obsSnapshots.length
    };
  }

  function planMatchesObservationFilter(plan, filter, transactions) {
    if (!plan || !filter) return false;
    var planRef = plan.planStableRef || plan.externalRef || plan.id || "";
    if (filter.installmentPlanRefs && filter.installmentPlanRefs.length) {
      for (var i = 0; i < filter.installmentPlanRefs.length; i++) {
        if (filter.installmentPlanRefs[i] === planRef ||
            filter.installmentPlanRefs[i] === plan.id ||
            filter.installmentPlanRefs[i] === plan.externalRef) {
          return true;
        }
      }
    }
    if (filter.groupKeys && filter.groupKeys.length) {
      for (var g = 0; g < filter.groupKeys.length; g++) {
        if (plan.groupKey === filter.groupKeys[g]) return true;
        if (filter.groupKeys[g].indexOf("plan:") === 0) {
          var pref = filter.groupKeys[g].slice(5);
          if (pref && (planRef === pref || plan.id === pref || plan.externalRef === pref)) {
            return true;
          }
        }
        if (filter.groupKeys[g].indexOf("derived:") === 0 && plan.groupKey === filter.groupKeys[g]) {
          return true;
        }
      }
    }
    if (filter.transactionRefs && filter.transactionRefs.length && transactions) {
      for (var t = 0; t < filter.transactionRefs.length; t++) {
        var tx = findEnrichedTransactionByRef(transactions, filter.transactionRefs[t]);
        if (!tx) continue;
        var txPlan = tx.installmentPlanId || "";
        if (txPlan && (txPlan === planRef || txPlan === plan.id || txPlan === plan.externalRef)) {
          return true;
        }
      }
    }
    return planMatchesInstallmentGroupFilter(plan, filter);
  }

  function resolvePlansForObservationFilter(filter, plans, transactions) {
    if (!filter || !plans) return [];
    var matched = [];
    (plans || []).forEach(function (plan) {
      if (planMatchesObservationFilter(plan, filter, transactions)) matched.push(plan);
    });
    return matched;
  }

  function buildObservationDerivedGroup(obs, transactions, installmentPlans) {
    var refs = getObservationTransactionRefs(obs);
    var txs = refs.map(function (ref) {
      return findEnrichedTransactionByRef(transactions, ref);
    }).filter(Boolean);
    var gf = obs.installmentGroupFilter || {};
    var groupKey = gf.groupKey || ("obs:" + (obs.pairKey || refs.slice().sort().join("|")));
    var pairKey = obs.pairKey || "";
    return {
      groupKey: groupKey,
      pairKey: pairKey,
      observationKeys: pairKey ? [pairKey] : [],
      pairKeys: pairKey ? [pairKey] : [],
      transactionRefs: refs,
      stableRefs: refs.slice(),
      externalRefs: gf.externalRefs || [],
      installmentPlanRefs: gf.installmentPlanRefs || [],
      source: "observation-derived",
      title: obs.description1 || (txs[0] && txs[0].description) || "Parcelas relacionadas",
      description1: obs.description1 || "",
      description2: obs.description2 || "",
      amountFmt: obs.amountFmt || "",
      date1: obs.date1 || "",
      date2: obs.date2 || "",
      transactions: txs,
      fallbackLabel: "Grupo identificado nas observações",
      badgeLabel: "Grupo identificado nas observações"
    };
  }

  function buildObservationDerivedGroups(filter, transactions, installmentPlans) {
    return (filter && filter.observations ? filter.observations : []).map(function (obs) {
      return buildObservationDerivedGroup(obs, transactions, installmentPlans);
    });
  }

  function observationLinksToPlan(obs, plan, transactions) {
    if (!obs || !plan) return false;
    var planRef = plan.planStableRef || plan.externalRef || plan.id || "";
    var gf = obs.installmentGroupFilter;
    if (gf && gf.installmentPlanRefs) {
      for (var i = 0; i < gf.installmentPlanRefs.length; i++) {
        if (gf.installmentPlanRefs[i] === planRef ||
            gf.installmentPlanRefs[i] === plan.id ||
            gf.installmentPlanRefs[i] === plan.externalRef) {
          return true;
        }
      }
    }
    if (gf && planMatchesInstallmentGroupFilter(plan, gf)) return true;
    var refs = getObservationTransactionRefs(obs);
    for (var t = 0; t < refs.length; t++) {
      var tx = findEnrichedTransactionByRef(transactions, refs[t]);
      if (!tx) continue;
      var txPlan = tx.installmentPlanId || "";
      if (txPlan && (txPlan === planRef || txPlan === plan.id || txPlan === plan.externalRef)) {
        return true;
      }
    }
    return false;
  }

  function buildInstallmentDisplayGroups(filter, plans, transactions, installmentPlans) {
    if (!filter || !filter.observations || !filter.observations.length) return [];
    var groups = [];
    var usedPairKeys = {};
    var matchedPlans = resolvePlansForObservationFilter(filter, plans || [], transactions || []);

    matchedPlans.forEach(function (plan) {
      var planRef = plan.planStableRef || plan.externalRef || plan.id || "";
      var groupKey = plan.groupKey || ("plan:" + planRef);
      var linkedObs = filter.observations.filter(function (obs) {
        return observationLinksToPlan(obs, plan, transactions);
      });
      var pairKeys = [];
      linkedObs.forEach(function (obs) {
        if (obs.pairKey && pairKeys.indexOf(obs.pairKey) < 0) pairKeys.push(obs.pairKey);
        if (obs.pairKey) usedPairKeys[obs.pairKey] = true;
      });
      var txRefs = [];
      linkedObs.forEach(function (obs) {
        getObservationTransactionRefs(obs).forEach(function (ref) {
          pushUniqueRef(txRefs, ref);
        });
      });
      var txs = txRefs.map(function (ref) {
        return findEnrichedTransactionByRef(transactions, ref);
      }).filter(Boolean);
      groups.push({
        groupKey: groupKey,
        pairKey: pairKeys[0] || "",
        observationKeys: pairKeys.slice(),
        pairKeys: pairKeys.slice(),
        transactionRefs: txRefs,
        stableRefs: txRefs.slice(),
        externalRefs: [],
        installmentPlanRefs: planRef ? [planRef] : [],
        source: "plan-matched",
        title: plan.description || "Parcelamento",
        amountFmt: plan.installmentAmtFmt || "",
        plan: plan,
        transactions: txs,
        fallbackLabel: plan.kindLabel || "Plano de parcelas",
        badgeLabel: plan.kindLabel || "Plano de parcelas"
      });
    });

    filter.observations.forEach(function (obs) {
      if (obs.pairKey && usedPairKeys[obs.pairKey]) return;
      groups.push(buildObservationDerivedGroup(obs, transactions, installmentPlans));
    });

    return groups;
  }

  function getInstallmentGroupDismissKeys(group) {
    if (!group) return [];
    if (group.pairKeys && group.pairKeys.length) return group.pairKeys.slice();
    if (group.observationKeys && group.observationKeys.length) return group.observationKeys.slice();
    if (group.pairKey) return [group.pairKey];
    return [];
  }

  function dismissInstallmentGroup(group, dismissedMap) {
    var keys = getInstallmentGroupDismissKeys(group);
    keys.forEach(function (key) {
      if (key) dismissedMap[key] = true;
    });
    return keys;
  }

  function filterActiveInstallmentGroups(groups, dismissedMap) {
    return (groups || []).filter(function (group) {
      var keys = getInstallmentGroupDismissKeys(group);
      if (!keys.length) return true;
      return keys.some(function (key) { return !dismissedMap[key]; });
    });
  }

  function getInstallmentGroupCardActions(group) {
    var txCount = (group && group.transactionRefs) ? group.transactionRefs.length : 0;
    var actions = ["Marcar grupo como concluído"];
    if (txCount === 2) {
      actions.unshift("Comparar este par");
    } else if (txCount > 2) {
      actions.unshift("Ver lançamentos do grupo");
    }
    return actions;
  }

  function getObservationActionLabels(contextKind, scope) {
    scope = scope || "card";
    if (contextKind === "installment_related") {
      if (scope === "section") return ["Ver todas as parcelas relacionadas"];
      if (scope === "card") return ["Comparar este par", "Marcar como conferido"];
      if (scope === "compare_panel") {
        return ["Parcelas corretas", "Não é parcelamento", "Revisar depois", "Limpar comparação"];
      }
      if (scope === "global_panel") {
        return ["Marcar todas como conferidas", "Revisar depois", "Limpar filtro"];
      }
      if (scope === "group_card") {
        return ["Marcar grupo como concluído"];
      }
    }
    if (contextKind === "repeated_purchase") {
      if (scope === "card") return ["Comparar compras", "Marcar como conferido"];
      if (scope === "compare_panel") {
        return ["São compras diferentes", "É duplicata", "Revisar depois", "Limpar comparação"];
      }
    }
    return [];
  }

  function planMatchesInstallmentGroupFilter(plan, filter) {
    if (!plan || !filter) return false;
    var planRef = plan.externalRef || plan.id || plan.planStableRef || "";
    if (filter.installmentPlanRefs && filter.installmentPlanRefs.length) {
      for (var i = 0; i < filter.installmentPlanRefs.length; i++) {
        if (filter.installmentPlanRefs[i] === planRef ||
            filter.installmentPlanRefs[i] === plan.id ||
            filter.installmentPlanRefs[i] === plan.externalRef) {
          return true;
        }
      }
    }
    if (filter.groupKey && plan.groupKey === filter.groupKey) return true;
    if (filter.groupKey && filter.groupKey.indexOf("plan:") === 0) {
      var ref = filter.groupKey.slice(5);
      if (ref && (planRef === ref || plan.id === ref || plan.externalRef === ref)) return true;
    }
    if (filter.groupKey && filter.groupKey.indexOf("derived:") === 0 && plan.groupKey === filter.groupKey) {
      return true;
    }
    return false;
  }

  function getObservationUiCopy(obs) {
    var classification = getObservationClassification(obs);
    var contextKind = getObservationContextKind(obs);
    if (contextKind === "repeated_purchase" || classification === "repeated_purchase") {
      return {
        title: "Compra semelhante encontrada",
        description: "Encontramos lançamentos parecidos em datas diferentes. Confira se são compras distintas.",
        impact: "Apenas informativo — não bloqueia a importação."
      };
    }
    if (classification === "recurring_candidate") {
      return {
        title: "Recorrência candidata",
        description: "Despesa repetida em meses diferentes — confira se é assinatura ou compra avulsa.",
        impact: "Merece conferência — não bloqueia a importação."
      };
    }
    if (classification === "exact_duplicate") {
      return {
        title: "Duplicata exata",
        description: "Dois lançamentos idênticos foram detectados.",
        impact: "Bloqueia a importação até revisar."
      };
    }
    if (classification === "probable_duplicate") {
      return {
        title: "Duplicata provável",
        description: "Lançamentos muito parecidos — confira se não é repetição.",
        impact: obs.tier === "attention"
          ? "Merece conferência — não bloqueia a importação."
          : "Bloqueia a importação até revisar."
      };
    }
    if (contextKind === "installment_related" || classification === "installment_related") {
      return {
        title: "Parcelas relacionadas",
        description: "Parcelas vinculadas a planos consistentes — não indicam erro.",
        cardDescription: "Parcelas vinculadas a um plano consistente.",
        impact: "Apenas informativo — não bloqueia a importação."
      };
    }
    if (classification === "category_review") {
      return {
        title: "Categoria a revisar",
        description: "Categoria genérica — ajuste apenas se quiser refinar.",
        impact: "Apenas informativo — não bloqueia a importação."
      };
    }
    if (classification === "similar_transfer") {
      return {
        title: "Transferência semelhante",
        description: "Transferências parecidas em valor ou descrição.",
        impact: obs.tier === "attention"
          ? "Merece conferência — não bloqueia a importação."
          : "Bloqueia a importação até revisar."
      };
    }
    return {
      title: obs.classificationLabel || "Observação",
      description: "",
      impact: obs.informational
        ? "Apenas informativo — não bloqueia a importação."
        : (obs.attention ? "Merece conferência." : "Bloqueia a importação.")
    };
  }

  function annotateObservation(obs, transactions, installmentPlans) {
    var copy = enrichObservationTransactionRefs(obs, transactions);
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

    copy.contextKind = getObservationContextKind(copy);
    if (copy.contextKind === "installment_related") {
      copy.installmentGroupFilter = buildInstallmentGroupFilter(
        copy, transactions, installmentPlans
      );
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
        icon: "warning",
        text: "Existem pendências que bloqueiam a importação.",
        counts: counts
      };
    }
    return {
      noticeClass: "notice--info",
      icon: "info",
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
    isInvoiceInternalCreditTransaction:  isInvoiceInternalCreditTransaction,
    isExternalInvoiceSettlementTransaction: isExternalInvoiceSettlementTransaction,
    isInvoiceSettlementForInvoice:       isInvoiceSettlementForInvoice,
    getInvoiceDisplayAmounts:            getInvoiceDisplayAmounts,
    getInvoicePrimaryDisplay:            getInvoicePrimaryDisplay,
    isInvoicePaidForDisplay:             isInvoicePaidForDisplay,
    getInvoiceCreditLabel:               getInvoiceCreditLabel,
    getInvoiceSettlementLabel:           getInvoiceSettlementLabel,
    getInvoicePaymentBreakdownRows:      getInvoicePaymentBreakdownRows,
    hasExternalSettlement:               hasExternalSettlement,
    hasInternalInvoiceCredits:           hasInternalInvoiceCredits,
    getRecurringRuleDisplayState:        getRecurringRuleDisplayState,
    isRecurringRuleCandidate:            isRecurringRuleCandidate,
    isRecurringRuleActive:               isRecurringRuleActive,
    getRecurringRuleBadges:              getRecurringRuleBadges,
    getRecurringRuleImportImpact:        getRecurringRuleImportImpact,
    getRecurringDisplayAmount:           getRecurringDisplayAmount,
    getRecurringConfidenceLabel:         getRecurringConfidenceLabel,
    shouldSuppressRepeatedPurchasePair:  shouldSuppressRepeatedPurchasePair,
    getTransactionCompareHint:           getTransactionCompareHint,
    getTransactionTypeLabel:             getTransactionTypeLabel,
    getTransactionInstallmentLabel:      getTransactionInstallmentLabel,
    txInstallmentCurrent:                txInstallmentCurrent,
    txInstallmentTotal:                  txInstallmentTotal,
    isRecurringRuleUserConfirmed:        isRecurringRuleUserConfirmed,
    buildRecurringRuleLookup:            buildRecurringRuleLookup,
    isTransactionRecurrenceConfirmed:    isTransactionRecurrenceConfirmed,
    shouldSuppressRecurringCandidatePair: shouldSuppressRecurringCandidatePair,
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
    getTransactionStableRef:             getTransactionStableRef,
    getStableTransactionRef:             getStableTransactionRef,
    matchTransactionRef:                 matchTransactionRef,
    findEnrichedTransactionByRef:        findEnrichedTransactionByRef,
    getObservationTransactionRefs:       getObservationTransactionRefs,
    enrichObservationTransactionRefs:    enrichObservationTransactionRefs,
    formatCompetenceHuman:               formatCompetenceHuman,
    getInvoiceHumanLabel:                getInvoiceHumanLabel,
    isTechnicalSourceLabel:              isTechnicalSourceLabel,
    getObservationUiCopy:                getObservationUiCopy,
    getObservationContextKind:           getObservationContextKind,
    buildInstallmentGroupFilter:         buildInstallmentGroupFilter,
    buildInstallmentObservationFilter:   buildInstallmentObservationFilter,
    buildInstallmentGroupKeyFromTx:      buildInstallmentGroupKeyFromTx,
    planMatchesInstallmentGroupFilter:   planMatchesInstallmentGroupFilter,
    planMatchesObservationFilter:        planMatchesObservationFilter,
    resolvePlansForObservationFilter:    resolvePlansForObservationFilter,
    buildObservationDerivedGroups:       buildObservationDerivedGroups,
    buildObservationDerivedGroup:        buildObservationDerivedGroup,
    buildInstallmentDisplayGroups:       buildInstallmentDisplayGroups,
    getInstallmentGroupDismissKeys:      getInstallmentGroupDismissKeys,
    dismissInstallmentGroup:             dismissInstallmentGroup,
    filterActiveInstallmentGroups:       filterActiveInstallmentGroups,
    getInstallmentGroupCardActions:      getInstallmentGroupCardActions,
    getObservationActionLabels:          getObservationActionLabels,
    rebuildObservationCounts:            rebuildObservationCounts,
    buildObservationBanner:              buildObservationBanner,
    isSimilarityBlocking:                isSimilarityBlocking,
    formatCardAliasesNote:               formatCardAliasesNote,
    getReconciliationDifferenceCents:    getReconciliationDifferenceCents,
    getToleranceCents:                   getToleranceCents
  };
})(window.CFM);
