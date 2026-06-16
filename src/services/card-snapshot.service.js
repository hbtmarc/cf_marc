/**
 * Snapshots e resolvedor de cartões — Fase 0.3.6-B
 * Overlay local (gitignored). Futuro: /users/{uid}/cardSnapshots
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var CANONICAL_ALIASES = {
    bb_platinum: {
      label: "BB Platinum",
      patterns: [
        "bb platinum", "ourocard platinum", "bb ourocard", "ourocard platinum visa",
        "platinum visa", "ourocard"
      ]
    },
    nubank: {
      label: "Nubank",
      patterns: ["nubank", "nubank credito", "nubank crédito", "nubank roxinho"]
    },
    porto: {
      label: "Porto",
      patterns: ["porto seguro cartao", "porto seguro cartão", "porto seguro", "porto bank", "porto"]
    },
    mercado_pago: {
      label: "Mercado Pago",
      patterns: ["mercado pago visa", "mercado pago", "mercadopago"]
    }
  };

  function normName(s) {
    return String(s || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim();
  }

  function nameMatchesPatterns(name, patterns) {
    var n = normName(name);
    if (!n || !patterns || !patterns.length) return false;
    return patterns.some(function (p) {
      var np = normName(p);
      return np && n.indexOf(np) >= 0;
    });
  }

  function detectCanonicalKey(name) {
    var keys = Object.keys(CANONICAL_ALIASES);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (nameMatchesPatterns(name, CANONICAL_ALIASES[key].patterns)) return key;
    }
    return null;
  }

  function loadLocalSnapshots() {
    return Array.isArray(CFM.cardSnapshotsLocal) ? CFM.cardSnapshotsLocal.slice() : [];
  }

  function loadLimitOverrides() {
    return Array.isArray(CFM.cardLimitOverridesLocal) ? CFM.cardLimitOverridesLocal.slice() : [];
  }

  /**
   * Registro único: id, externalRef, aliases → card.id canônico
   */
  function buildCardRegistry(cards) {
    var cardsById = {};
    var refToId = {};
    var cardsEnriched = [];

    (cards || []).forEach(function (card) {
      if (!card) return;
      var id = card.id || card.externalRef || "";
      if (!id) return;

      var canonicalKey = card.canonicalKey || detectCanonicalKey(card.name);
      var enriched = Object.assign({}, card, {
        id: id,
        externalRef: card.externalRef || card.id || "",
        canonicalKey: canonicalKey
      });

      cardsById[id] = enriched;
      cardsEnriched.push(enriched);

      refToId[id] = id;
      if (card.externalRef) refToId[card.externalRef] = id;
      if (card.id && card.id !== id) refToId[card.id] = id;

      if (canonicalKey && CANONICAL_ALIASES[canonicalKey]) {
        CANONICAL_ALIASES[canonicalKey].patterns.forEach(function (p) {
          refToId[normName(p)] = id;
        });
        refToId[canonicalKey] = id;
      }
      refToId[normName(card.name)] = id;
    });

    return {
      cards: cardsEnriched,
      cardsById: cardsById,
      refToId: refToId,
      resolveCardId: function (rawCardRef, hintName) {
        return resolveCardId(rawCardRef, { refToId: refToId, cardsById: cardsById }, hintName);
      }
    };
  }

  function resolveCardId(rawCardRef, context, hintName) {
    if (!context) return rawCardRef || "";
    var ref = String(rawCardRef || "").trim();
    if (ref && context.refToId[ref]) return context.refToId[ref];

    var normRef = normName(ref);
    if (normRef && context.refToId[normRef]) return context.refToId[normRef];

    if (hintName) {
      var nk = detectCanonicalKey(hintName);
      if (nk && context.refToId[nk]) return context.refToId[nk];
      var nn = normName(hintName);
      if (nn && context.refToId[nn]) return context.refToId[nn];
    }

    if (ref) {
      var keys = Object.keys(context.cardsById || {});
      for (var i = 0; i < keys.length; i++) {
        var c = context.cardsById[keys[i]];
        if (!c) continue;
        if (c.externalRef === ref || c.id === ref) return c.id;
        if (nameMatchesPatterns(c.name, [ref])) return c.id;
      }
    }

    return ref;
  }

  function getEntityCardRef(entity) {
    if (!entity) return "";
    return entity.cardId || entity.cardExternalRef || entity.cardRef || "";
  }

  function cardMatchesEntry(card, entry) {
    if (!card || !entry) return false;
    if (entry.canonicalKey && card.canonicalKey && entry.canonicalKey === card.canonicalKey) return true;
    if (entry.cardId && card.id === entry.cardId) return true;
    if (entry.cardExternalRef &&
        (card.externalRef === entry.cardExternalRef || card.id === entry.cardExternalRef)) {
      return true;
    }
    var patterns = entry.cardNameIncludes || [];
    if (patterns.length && nameMatchesPatterns(card.name, patterns)) return true;
    if (entry.canonicalKey && CANONICAL_ALIASES[entry.canonicalKey]) {
      return nameMatchesPatterns(card.name, CANONICAL_ALIASES[entry.canonicalKey].patterns);
    }
    return false;
  }

  function isPlaceholderLastFour(lastFour) {
    var s = String(lastFour || "").trim();
    if (!s) return true;
    if (/^0+$/.test(s)) return true;
    if (s.length !== 4) return true;
    return false;
  }

  function formatLastFourDisplay(lastFour) {
    if (isPlaceholderLastFour(lastFour)) return null;
    return String(lastFour).trim();
  }

  function validateSnapshotConsistency(limitCents, usedCents, availableCents) {
    if (limitCents == null || usedCents == null || availableCents == null) {
      return { consistent: null, deltaCents: 0, message: "" };
    }
    var sum = usedCents + availableCents;
    var delta = Math.abs(sum - limitCents);
    if (delta <= 1) {
      return { consistent: true, deltaCents: delta, message: "Snapshot consistente" };
    }
    return {
      consistent: false,
      deltaCents: delta,
      message: "Snapshot inconsistente — usado + disponível difere do limite em " + delta + " centavos"
    };
  }

  function resolveCardSnapshot(card, snapshots, snapshotMonth) {
    var withMonth = null;
    var anyMonth  = null;
    (snapshots || []).forEach(function (snap) {
      if (!cardMatchesEntry(card, snap)) return;
      if (!anyMonth || (snap.confidence === "high" && anyMonth.confidence !== "high")) {
        anyMonth = snap;
      }
      if (snapshotMonth && snap.snapshotMonth === snapshotMonth) {
        if (!withMonth || (snap.confidence === "high" && withMonth.confidence !== "high")) {
          withMonth = snap;
        }
      }
    });
    return withMonth || anyMonth;
  }

  function mergeSnapshotOntoCard(card, snap, ov) {
    var limitCents = snap && snap.limitCents != null ? snap.limitCents : (card.limitCents || 0);
    if (ov && ov.limitCents != null) limitCents = ov.limitCents;

    var usedCents = snap && snap.usedCents != null ? snap.usedCents : null;
    var availableCents = snap && snap.availableCents != null ? snap.availableCents : null;

    if (usedCents == null && availableCents != null && limitCents) {
      usedCents = Math.max(0, limitCents - availableCents);
    }
    if (availableCents == null && usedCents != null && limitCents) {
      availableCents = Math.max(0, limitCents - usedCents);
    }

    var snapshotSource = "import_json";
    if (snap) snapshotSource = "snapshot_local";
    else if (ov) snapshotSource = "limit_override_local";

    var consistency = validateSnapshotConsistency(limitCents, usedCents, availableCents);

    return {
      limitCents:       limitCents,
      usedCents:        usedCents,
      availableCents:   availableCents,
      usagePercent:     usedCents != null ? pctUsed(usedCents, limitCents) : null,
      snapshotSource:   snapshotSource,
      snapshotMonth:    snap ? snap.snapshotMonth : "",
      snapshotDate:     snap ? snap.snapshotDate : "",
      snapshotConfidence: snap ? snap.confidence : (ov ? "high" : "import"),
      hasSnapshot:      !!(snap || ov),
      limitFromOverlay: !!(snap || ov),
      snapshotConsistent: consistency.consistent,
      snapshotConsistencyMessage: consistency.message
    };
  }

  function resolveCardAliases(card, snapshots, invoices, transactions, registry) {
    var resolvedId = card.id;
    var aliases = [card.name, card.externalRef, card.canonicalKey].filter(Boolean);
    if (card.canonicalKey && CANONICAL_ALIASES[card.canonicalKey]) {
      aliases = aliases.concat(CANONICAL_ALIASES[card.canonicalKey].patterns);
    }
    return {
      cardId: resolvedId,
      canonicalKey: card.canonicalKey,
      aliases: aliases,
      snapshot: resolveCardSnapshot(card, snapshots, null)
    };
  }

  function entityBelongsToCard(entity, card, registry) {
    if (!entity || !card) return false;
    var rawRef = getEntityCardRef(entity);
    if (rawRef) {
      var resolved = registry.resolveCardId(rawRef, entity.cardName || entity.description);
      if (resolved === card.id) return true;
    }
    if (entity.cardName && card.name && normName(entity.cardName) === normName(card.name)) return true;
    if (entity.description && card.canonicalKey) {
      if (nameMatchesPatterns(entity.description, CANONICAL_ALIASES[card.canonicalKey].patterns)) return true;
    }
    return false;
  }

  function pctUsed(used, limit) {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function buildCardSummaries(cards, context) {
    var snapshots = loadLocalSnapshots();
    var overrides = loadLimitOverrides();
    var registry = context && context.registry
      ? context.registry
      : buildCardRegistry(cards);
    var snapshotMonth = (context && context.periodEnd)
      ? String(context.periodEnd).substring(0, 7) : "";

    return registry.cards.map(function (card) {
      var snap = resolveCardSnapshot(card, snapshots, snapshotMonth);
      var ov   = null;
      (overrides || []).forEach(function (o) {
        if (cardMatchesEntry(card, o)) ov = o;
      });

      var merged = mergeSnapshotOntoCard(card, snap, ov);
      var lastFour = formatLastFourDisplay(card.lastFour || card.last4);

      return Object.assign({
        id:              card.id || "",
        externalRef:     card.externalRef || card.id || "",
        canonicalKey:    card.canonicalKey || "",
        name:            String(card.name || "").substring(0, 60),
        brand:           card.brand || "",
        lastFour:        lastFour || "",
        lastFourDisplay: lastFour ? ("···" + lastFour) : "",
        lastFourMissing: !lastFour,
        issuer:          card.issuer || card.institution || "",
        closingDay:      card.closingDay || null,
        dueDay:          card.dueDay || null,
        isActive:        card.isActive !== false
      }, merged, {
        usedPercent: merged.usagePercent,
        limitSource: merged.snapshotSource
      });
    });
  }

  function attachCardLinks(cardSummaries, invoices, transactions, installmentPlans, registry) {
    var reg = registry || { resolveCardId: function (r) { return r; } };

    return (cardSummaries || []).map(function (card) {
      var invLinked = (invoices || []).filter(function (inv) {
        return entityBelongsToCard(inv, card, reg);
      });
      var txPurchases = (transactions || []).filter(function (tx) {
        if (!tx) return false;
        if (!entityBelongsToCard(tx, card, reg)) return false;
        return tx.type === "credit_card_purchase" || tx.type === "expense" ||
          (tx.cardId || tx.cardExternalRef);
      });
      var plansLinked = (installmentPlans || []).filter(function (p) {
        return entityBelongsToCard(p, card, reg);
      });
      var futurePlans = plansLinked.filter(function (p) {
        var cur = p.currentInstallment || (p.installment && p.installment.current) || 0;
        var tot = p.totalInstallments || (p.installment && p.installment.total) || 0;
        return tot && cur && cur < tot;
      });

      var consolidatedInvoices = invLinked.filter(function (inv) {
        return !inv.isStub && !inv.referenceOnly && inv.status !== "paid";
      });
      var consolidatedTotal = consolidatedInvoices.reduce(function (s, inv) {
        return s + (inv.amountDueCents != null ? inv.amountDueCents : inv.totalCents || 0);
      }, 0);
      var purchaseTotal = txPurchases.reduce(function (s, tx) {
        return s + (tx.amountCents || 0);
      }, 0);
      var futureInstallmentTotal = futurePlans.reduce(function (s, p) {
        var amt = p.installmentAmountCents || p.installmentAmount || 0;
        return s + amt;
      }, 0);

      return Object.assign({}, card, {
        linkedInvoiceCount:        invLinked.length,
        linkedPurchaseCount:       txPurchases.length,
        linkedInstallmentCount:    plansLinked.length,
        futureInstallmentCount:    futurePlans.length,
        consolidatedInvoiceTotalCents: consolidatedTotal,
        purchaseTotalCents:        purchaseTotal,
        futureInstallmentTotalCents: futureInstallmentTotal,
        linkedInvoices: invLinked.map(function (inv) {
          return {
            id: inv.id || inv.externalRef,
            competenceMonth: inv.competenceMonth,
            status: inv.status,
            isStub: !!inv.isStub,
            referenceOnly: !!(inv.referenceOnly || inv.isStub)
          };
        })
      });
    });
  }

  function getInvoiceRefKeys(invoice) {
    if (!invoice) return [];
    var keys = [];
    ["id", "externalRef", "invoiceExternalRef"].forEach(function (f) {
      if (invoice[f]) keys.push(String(invoice[f]));
    });
    return keys;
  }

  function txMatchesInvoiceRef(tx, invRefKeys) {
    if (!tx || !invRefKeys.length) return false;
    var txRef = tx.invoiceId || tx.invoiceExternalRef || "";
    if (!txRef) return false;
    return invRefKeys.indexOf(String(txRef)) >= 0;
  }

  function isPlannedOrFutureTx(tx, invMonth) {
    if (!tx) return true;
    if (tx.status === "planned" || tx.status === "scheduled") return true;
    if (invMonth && tx.competenceMonth && tx.competenceMonth > invMonth) return true;
    return false;
  }

  function isOutOfScopeChargeTx(tx, invMonth) {
    if (!tx) return true;
    if (tx.isStub || tx.referenceOnly) return true;
    if (tx.type === "credit_card_payment") return true;
    if (tx.subtype === "credit_balance" || tx.type === "credit_balance") return true;
    if (isPlannedOrFutureTx(tx, invMonth)) return true;
    return false;
  }

  function sumPaymentTx(tx) {
    return tx.amountCents || 0;
  }

  /**
   * Conciliação de fatura — apenas transações no escopo correto.
   */
  function buildInvoiceReconciliation(invoice, transactions, context) {
    var ctx = context || {};
    var registry = ctx.registry || { resolveCardId: function (r) { return r; } };
    var isHistoricalPayment = ctx.isHistoricalPaymentForInvoice || function () { return false; };
    var isReference = !!(invoice.isStub || invoice.referenceOnly);
    var invRefKeys = getInvoiceRefKeys(invoice);
    var invMonth = invoice.competenceMonth || "";
    var rawCardRef = invoice.cardId || invoice.cardExternalRef || "";
    var resolvedCardId = registry.resolveCardId
      ? registry.resolveCardId(rawCardRef) : rawCardRef;

    var invoiceTotal = invoice.amountDueCents != null
      ? invoice.amountDueCents
      : (invoice.totalCents || 0);
    var previousBalance = invoice.previousBalanceCents || 0;

    var empty = {
      invoiceTotalCents: invoiceTotal,
      invoiceChargesCents: 0,
      invoicePaymentsCents: 0,
      linkedPurchasesCents: 0,
      linkedFeesCents: 0,
      linkedAdjustmentsCents: 0,
      linkedRefundsCents: 0,
      linkedPaymentsCents: 0,
      creditBalanceCents: invoice.creditBalanceCents || 0,
      reconciliationDeltaCents: 0,
      statementSummary: {
        previousBalanceCents: previousBalance,
        purchasesCents: 0,
        feesCents: 0,
        adjustmentsCents: 0,
        refundsCents: 0,
        paymentsCreditsCents: 0,
        chargesCents: 0,
        totalCents: invoiceTotal
      },
      confidence: "n/a",
      isPartial: false,
      linkedCount: 0,
      linkedPaymentCount: 0,
      linkedTxIndexes: [],
      linkedPaymentIndexes: [],
      message: ""
    };

    if (isReference) {
      empty.message = "Fatura de referência — sem conciliação consolidada.";
      return empty;
    }

    var hasCredit = invoice.balanceDirection === "credit" &&
      (invoice.creditBalanceCents || 0) > 0;

    var chargeLinked = [];
    var paymentLinked = [];
    var sameCardSameMonthWithoutRef = 0;

    (transactions || []).forEach(function (tx, index) {
      if (!tx) return;
      var txCardRef = tx.cardId || tx.cardExternalRef || "";
      var txCardResolved = registry.resolveCardId(txCardRef, tx.description);
      var sameCard = resolvedCardId && txCardResolved === resolvedCardId;
      var sameMonth = !invMonth || !tx.competenceMonth || tx.competenceMonth === invMonth;

      if (sameCard && sameMonth && !txMatchesInvoiceRef(tx, invRefKeys)) {
        if (tx.type === "credit_card_purchase" || tx.type === "expense") {
          sameCardSameMonthWithoutRef++;
        }
      }

      if (!txMatchesInvoiceRef(tx, invRefKeys)) return;

      if (tx.type === "credit_card_payment") {
        if (!isHistoricalPayment(tx, invMonth)) {
          paymentLinked.push({ tx: tx, index: index });
        }
        return;
      }

      if (!sameMonth) return;
      if (isOutOfScopeChargeTx(tx, invMonth)) return;
      if (hasCredit && tx.type === "income" && tx.flow === "in") return;

      chargeLinked.push({ tx: tx, index: index });
    });

    var purchases = 0, fees = 0, adjustments = 0, refunds = 0, payments = 0;
    chargeLinked.forEach(function (item) {
      var tx = item.tx;
      if (tx.type === "refund") {
        refunds += tx.amountCents || 0;
      } else if (tx.type === "fee") {
        fees += tx.amountCents || 0;
      } else if (tx.type === "adjustment") {
        adjustments += tx.amountCents || 0;
      } else if (tx.flow === "out" || tx.type === "credit_card_purchase" || tx.type === "expense") {
        purchases += tx.amountCents || 0;
      }
    });

    paymentLinked.forEach(function (item) {
      payments += sumPaymentTx(item.tx);
    });

    var invoiceChargesCents = purchases + fees + adjustments - refunds;
    var creditBalance = invoice.creditBalanceCents || 0;
    var paymentsCredits = payments + creditBalance;
    var netExpected = previousBalance + invoiceChargesCents - paymentsCredits;
    var unexplainedDelta = invoiceTotal - netExpected;
    var chargesOnlyDelta = invoiceTotal - invoiceChargesCents;
    var RECON_TOLERANCE = 5;

    var isPartial = chargeLinked.length === 0 ||
      sameCardSameMonthWithoutRef > 0 ||
      invRefKeys.length === 0;

    var confidence = "high";
    if (chargeLinked.length === 0 && paymentLinked.length === 0) confidence = "low";
    else if (isPartial) confidence = "partial";

    var explainedByPayments = Math.abs(unexplainedDelta) <= RECON_TOLERANCE;
    if (!explainedByPayments && paymentsCredits > 0) {
      if (Math.abs(Math.abs(chargesOnlyDelta) - payments) <= RECON_TOLERANCE) explainedByPayments = true;
      if (Math.abs(Math.abs(chargesOnlyDelta) - paymentsCredits) <= RECON_TOLERANCE) explainedByPayments = true;
      if (Math.abs(chargesOnlyDelta + payments) <= RECON_TOLERANCE) explainedByPayments = true;
    }

    var reconciliationDeltaCents = unexplainedDelta;

    if (hasCredit) {
      reconciliationDeltaCents = 0;
      isPartial = chargeLinked.length === 0 && sameCardSameMonthWithoutRef > 0;
      explainedByPayments = true;
    } else if (explainedByPayments) {
      reconciliationDeltaCents = 0;
    }

    var message = "";
    if (hasCredit) {
      message = "Saldo credor — não entra na conciliação de compras.";
    } else if (explainedByPayments && Math.abs(chargesOnlyDelta) > RECON_TOLERANCE) {
      message = "Conciliação explicada por pagamento/crédito.";
    } else if (isPartial && confidence !== "high") {
      message = "Conciliação parcial — nem todas as transações da fatura estão presentes no JSON.";
    } else if (Math.abs(reconciliationDeltaCents) <= RECON_TOLERANCE && chargeLinked.length > 0) {
      message = "Conciliação consistente.";
    }

    var statementSummary = {
      previousBalanceCents: previousBalance,
      purchasesCents: purchases,
      feesCents: fees,
      adjustmentsCents: adjustments,
      refundsCents: refunds,
      paymentsCreditsCents: paymentsCredits,
      chargesCents: invoiceChargesCents,
      totalCents: invoiceTotal
    };

    return {
      invoiceTotalCents: invoiceTotal,
      invoiceChargesCents: invoiceChargesCents,
      invoicePaymentsCents: payments,
      linkedPurchasesCents: purchases,
      linkedFeesCents: fees,
      linkedAdjustmentsCents: adjustments,
      linkedRefundsCents: refunds,
      linkedPaymentsCents: payments,
      creditBalanceCents: creditBalance,
      reconciliationDeltaCents: reconciliationDeltaCents,
      chargesOnlyDeltaCents: chargesOnlyDelta,
      explainedByPayments: explainedByPayments,
      statementSummary: statementSummary,
      confidence: confidence,
      isPartial: isPartial,
      linkedCount: chargeLinked.length,
      linkedPaymentCount: paymentLinked.length,
      linkedTxIndexes: chargeLinked.map(function (l) { return l.index; }),
      linkedPaymentIndexes: paymentLinked.map(function (l) { return l.index; }),
      hasCredit: hasCredit,
      message: message,
      sameCardOrphanCount: sameCardSameMonthWithoutRef
    };
  }

  function groupInvoices(allInvoices) {
    var groups = {
      consolidated: [],
      open:         [],
      paid:         [],
      reference:    []
    };

    (allInvoices || []).forEach(function (inv) {
      if (!inv) return;
      if (inv.isStub || inv.referenceOnly || inv.isReference) {
        groups.reference.push(inv);
        return;
      }
      if (inv.status === "paid") groups.paid.push(inv);
      else if (inv.status === "open") groups.open.push(inv);
      else groups.consolidated.push(inv);
    });

    return groups;
  }

  CFM.cardSnapshotService = {
    CANONICAL_ALIASES:      CANONICAL_ALIASES,
    buildCardRegistry:      buildCardRegistry,
    resolveCardId:          resolveCardId,
    resolveCardSnapshot:    resolveCardSnapshot,
    resolveCardAliases:     resolveCardAliases,
    getEntityCardRef:       getEntityCardRef,
    loadLocalSnapshots:     loadLocalSnapshots,
    buildCardSummaries:           buildCardSummaries,
    attachCardLinks:              attachCardLinks,
    groupInvoices:                groupInvoices,
    buildInvoiceReconciliation:   buildInvoiceReconciliation,
    validateSnapshotConsistency:  validateSnapshotConsistency,
    formatLastFourDisplay:        formatLastFourDisplay,
    isPlaceholderLastFour:        isPlaceholderLastFour,
    cardMatchesEntry:       cardMatchesEntry,
    detectCanonicalKey:     detectCanonicalKey,
    entityBelongsToCard:    entityBelongsToCard
  };
})(window.CFM);
