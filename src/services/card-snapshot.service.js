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

  function resolveCardSnapshot(card, snapshots, snapshotMonth) {
    var month = snapshotMonth || "";
    var best = null;
    (snapshots || []).forEach(function (snap) {
      if (!cardMatchesEntry(card, snap)) return;
      if (month && snap.snapshotMonth && snap.snapshotMonth !== month) return;
      if (!best || (snap.confidence === "high" && best.confidence !== "high")) best = snap;
      else if (!best) best = snap;
    });
    return best;
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

      var limitCents = snap ? snap.limitCents : (card.limitCents || 0);
      if (ov && ov.limitCents != null) limitCents = ov.limitCents;

      var usedCents = snap ? snap.usedCents : null;
      var availableCents = snap ? snap.availableCents : null;

      if (usedCents == null && availableCents != null && limitCents) {
        usedCents = Math.max(0, limitCents - availableCents);
      }
      if (availableCents == null && usedCents != null && limitCents) {
        availableCents = Math.max(0, limitCents - usedCents);
      }

      var limitSource = "import_json";
      if (snap) limitSource = "snapshot_local";
      else if (ov) limitSource = "limit_override_local";
      if (snap && ov && ov.limitCents != null) limitSource = "snapshot_local";

      return {
        id:              card.id || "",
        externalRef:     card.externalRef || card.id || "",
        canonicalKey:    card.canonicalKey || "",
        name:            String(card.name || "").substring(0, 60),
        brand:           card.brand || "",
        lastFour:        card.lastFour || card.last4 || "",
        issuer:          card.issuer || card.institution || "",
        closingDay:      card.closingDay || null,
        dueDay:          card.dueDay || null,
        isActive:        card.isActive !== false,
        limitCents:      limitCents,
        usedCents:       usedCents,
        availableCents:  availableCents,
        usedPercent:     usedCents != null ? pctUsed(usedCents, limitCents) : null,
        hasSnapshot:     !!(snap || ov),
        snapshotMonth:   snap ? snap.snapshotMonth : snapshotMonth,
        snapshotDate:    snap ? snap.snapshotDate : "",
        limitSource:     limitSource,
        snapshotConfidence: snap ? snap.confidence : (ov ? "high" : "import"),
        limitFromOverlay: !!(snap || ov)
      };
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
    buildCardSummaries:     buildCardSummaries,
    attachCardLinks:        attachCardLinks,
    groupInvoices:          groupInvoices,
    cardMatchesEntry:       cardMatchesEntry,
    detectCanonicalKey:     detectCanonicalKey,
    entityBelongsToCard:    entityBelongsToCard
  };
})(window.CFM);
