/**
 * Diff de reimportação — Fase 0.5.2 + identidade semântica 0.5.3/0.5.4
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var SHA256_HEX = /^sha256:[a-f0-9]{64}$/i;

  function stripAccents(value) {
    var s = String(value || "");
    if (s.normalize) {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    return s;
  }

  function normalizeDescription(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeInstitution(value) {
    return stripAccents(String(value || ""))
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {string} rawHash
   * @returns {Object}
   */
  function parseLegacyRawHash(rawHash) {
    if (!rawHash) return { kind: "none" };
    var s = String(rawHash).trim();
    if (!/^sha256:/i.test(s)) return { kind: "none", raw: s };
    var payload = s.slice(7);
    if (SHA256_HEX.test(s)) {
      return { kind: "sha256", hash: s, isRealHash: true };
    }
    var parts = payload.split("|");
    return {
      kind: "legacyCanonicalFingerprint",
      raw: payload,
      isRealHash: false,
      institution: parts[0] || "",
      documentType: parts[1] || "",
      date: parts[2] || "",
      amountCents: parts[3] != null && parts[3] !== "" ? parseInt(parts[3], 10) : null,
      flow: parts[4] || "",
      normalizedDescription: normalizeTransactionMerchant(parts.slice(5).join("|") || "")
    };
  }

  function normalizeTransactionMerchant(description) {
    var s = stripAccents(String(description || "").toLowerCase());
    s = s.replace(/^compra com cart[aã]o\s*-\s*/i, "");
    s = s.replace(/^parcelamento de compra\s*/i, "");
    s = s.replace(/["']/g, "");
    s = s.replace(/\*/g, " ");
    s = s.replace(/[^\w\s]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/\bapple\s*com\s*bill\b/g, "apple com bill");
    s = s.replace(/\bdl\s*uber\s*rides\b/g, "dl uber rides");
    s = s.replace(/\bebn\s*spotify\b/g, "spotify");
    s = s.replace(/\bopenai\s*chatgpt\b(?:\s*subscription)?/g, "openai chatgpt");
    s = s.replace(/\bgithub\s*inc\b/g, "github inc");
    s = s.replace(/\bpagamento fatura nubank\b/g, "pagamento fatura nubank");
    s = s.replace(/\bbanco pan auto pan\b/g, "banco pan auto pan");
    return s;
  }

  function extractLastFour(value) {
    var s = String(value || "");
    var m = s.match(/(\d{4})\b/);
    return m ? m[1] : "";
  }

  function normalizeCardIdentity(cardExternalRef, card, tx) {
    var id = cardExternalRef || (tx && tx.cardId) || (card && (card.id || card.canonicalKey)) || "";
    var s = String(id).toLowerCase();
    var name = stripAccents(String((card && card.name) || (tx && tx.cardName) || "").toLowerCase());
    var lastFour = extractLastFour((card && (card.lastFour || card.lastFourDisplay)) || "") ||
      extractLastFour(s) ||
      extractLastFour(name);

    if (/bb.*ourocard|card_bb_ourocard/.test(s) || /ourocard/.test(name)) {
      return "bb_ourocard_platinum_visa";
    }
    if (/nubank_credit|nubank/.test(s) || /nubank/.test(name)) {
      return "nubank_credit";
    }
    if (/porto.*2128|porto_seguro_visa_2128|porto_credit_visa_gold_2128/.test(s) || /porto/.test(name)) {
      return "porto_visa:2128";
    }
    if (/mercado\s*pago|3209|mp.*3209/.test(s + " " + name)) {
      return "mercado_pago:3209";
    }
    if (lastFour) return s + ":" + lastFour;
    return s || "unknown";
  }

  function normalizeCardName(name) {
    return stripAccents(String(name || "").toLowerCase())
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isLegacyCardRef(ref) {
    var s = String(ref || "").toLowerCase();
    return /_multi$|_0000$|card_nubank_credit_multi|card_bb_ourocard_platinum_visa_0000|porto_seguro_visa_2128|cardsnapshots/i.test(s);
  }

  function buildCardSemanticKey(card) {
    if (!card) return "";
    var identity = normalizeCardIdentity(card.id || card.externalRef || card.canonicalKey, card, null);
    if (identity === "nubank_credit" || identity === "bb_ourocard_platinum_visa" ||
        /^porto_visa:|^mercado_pago:/.test(identity)) {
      return "card::" + identity;
    }
    if (identity && identity !== "unknown" && identity.indexOf(":") >= 0) {
      return "card::" + identity;
    }
    var name = normalizeCardName(card.name);
    var brand = String(card.brand || "").toLowerCase();
    var last4 = extractLastFour(card.lastFour || card.lastFourDisplay || card.last4 || "") ||
      extractLastFour(card.id || "") ||
      extractLastFour(name);
    return ["card", identity, name, brand, last4].join("::");
  }

  function buildInvoiceSemanticKey(inv, cardSemanticKey) {
    if (!inv) return "";
    var cardKey = cardSemanticKey ||
      normalizeCardIdentity(inv.cardId || inv.cardExternalRef, null, null);
    return "inv::" + cardKey + "::" + String(inv.competenceMonth || "");
  }

  function buildPlanSemanticKey(plan, cardSemanticKey) {
    if (!plan) return "";
    var cardKey = cardSemanticKey || normalizeCardIdentity(plan.cardId, null, null);
    var desc = normalizeTransactionMerchant(plan.description || plan.merchantName || "");
    return "plan::" + cardKey + "::" + desc + "::" + String(plan.totalInstallments || 0);
  }

  function buildRecurringSemanticKey(rule) {
    if (!rule) return "";
    return "rule::" + normalizeTransactionMerchant(rule.description || rule.merchantName || "") +
      "::" + String(rule.frequency || "").toLowerCase() + "::" +
      String(rule.expectedAmountCents || rule.amountCents || 0) + "::" +
      String(rule.flow || "out");
  }

  function bucketToArray(bucket) {
    if (!bucket) return [];
    if (Array.isArray(bucket)) return bucket;
    return Object.keys(bucket).map(function (id) {
      return bucket[id];
    });
  }

  function cardsByIdFromList(cards) {
    var map = {};
    (cards || []).forEach(function (c) {
      if (c && c.id) map[c.id] = c;
    });
    return map;
  }

  function buildTransactionContext(tx, cardsById, defaultSource) {
    var card = tx && tx.cardId ? (cardsById || {})[tx.cardId] : null;
    return {
      source: {
        institution: (tx && tx.institution) ||
          (defaultSource && defaultSource.institution) ||
          (card && card.name) ||
          "",
        documentType: (defaultSource && defaultSource.documentType) || ""
      },
      card: card
    };
  }

  function getTypeFamily(tx) {
    var type = String((tx && tx.type) || "").toLowerCase();
    if (/credit_card_purchase|purchase|card_purchase/.test(type)) return "card_purchase";
    if (/expense|debit_card_purchase|bank_expense/.test(type)) return "bank_expense";
    if (/credit_card_payment|invoice_payment|card_payment|bill_payment/.test(type)) return "card_payment";
    if (/income/.test(type)) return "income";
    if (/refund|credit/.test(type)) return "refund";
    if (/fee|tarifa|encargo/.test(type)) return "fee";
    if (/transfer|pix|ted|doc/.test(type)) return "transfer";
    return type || "unknown";
  }

  function getSourceFamily(source, tx) {
    var dt = String((source && source.documentType) || "").toLowerCase();
    if (/bank_statement|bank/.test(dt)) return "bank_statement";
    if (/credit_card|card_invoice|bill/.test(dt)) return "credit_card_invoice";
    if (/open_invoice|card_open/.test(dt)) return "card_open_invoice";
    var typeFamily = getTypeFamily(tx);
    if (typeFamily === "card_purchase" || typeFamily === "card_payment") return "credit_card_invoice";
    if (typeFamily === "bank_expense" || typeFamily === "transfer") return "bank_statement";
    return "unknown";
  }

  function parseInstallmentFromDescription(description) {
    var m = String(description || "").match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return "";
    return m[1] + "/" + m[2];
  }

  function buildSemanticTransactionKey(tx, context) {
    if (!tx) return "";
    context = context || {};
    var source = context.source || {};
    var institution = normalizeInstitution(source.institution || tx.institution || "");
    var cardIdentity = normalizeCardIdentity(tx.cardExternalRef || tx.cardId, context.card, tx);
    var date = tx.date || tx.transactionDate || tx.dueDate || "";
    var posted = tx.postedDate || "";
    var amount = tx.amountCents != null ? tx.amountCents : 0;
    var flow = tx.flow || "";
    var installment = "";
    if (tx.installmentCurrent && tx.installmentTotal) {
      installment = tx.installmentCurrent + "/" + tx.installmentTotal;
    } else {
      installment = parseInstallmentFromDescription(tx.description);
    }
    return [
      getSourceFamily(source, tx),
      institution,
      cardIdentity,
      date,
      posted,
      String(amount),
      flow,
      getTypeFamily(tx),
      normalizeTransactionMerchant(tx.description),
      installment,
      tx.competenceMonth || ""
    ].join("::");
  }

  function buildFallbackIdentity(tx) {
    return buildSemanticTransactionKey(tx, {});
  }

  function getPrimaryIdentityKey(tx) {
    if (!tx) return "";
    if (tx.externalRef) return "ext:" + String(tx.externalRef).trim();
    if (tx.id) return "id:" + String(tx.id).trim();
    if (tx.canonicalFingerprint) return "fp:" + String(tx.canonicalFingerprint).trim();
    if (tx.stableRef && String(tx.stableRef).indexOf("idx:") !== 0) {
      return "ref:" + String(tx.stableRef).trim();
    }
    return "sem:" + buildSemanticTransactionKey(tx, {});
  }

  function getTransactionIdentityKeys(tx, context) {
    var keys = [];
    var seen = {};
    var txContext = buildTransactionContext(tx, context.cardsById, context.source);
    function push(key) {
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    }
    if (tx.externalRef) push("ext:" + String(tx.externalRef).trim());
    if (tx.id) push("id:" + String(tx.id).trim());
    if (tx.canonicalFingerprint) push("fp:" + String(tx.canonicalFingerprint).trim());
    if (tx.stableRef) push("ref:" + String(tx.stableRef).trim());
    push("sem:" + buildSemanticTransactionKey(tx, txContext));
    return keys;
  }

  function getStoredTransactionKeys(stored, context) {
    var keys = [];
    if (stored.id) keys.push("ref:" + String(stored.id).trim());
    if (stored.externalRef) keys.push("ext:" + String(stored.externalRef).trim());
    keys.push("sem:" + buildSemanticTransactionKey(stored, context));
    return keys;
  }

  function indexStoredTransactions(storedTransactions, cardsById, defaultSource) {
    var index = {};
    (storedTransactions || []).forEach(function (stored) {
      var ctx = buildTransactionContext(stored, cardsById, defaultSource);
      getStoredTransactionKeys(stored, ctx).forEach(function (key) {
        if (!index[key]) index[key] = stored;
      });
    });
    return index;
  }

  function indexSemanticKeys(storedTransactions, cardsById, defaultSource) {
    var index = {};
    (storedTransactions || []).forEach(function (stored) {
      var ctx = buildTransactionContext(stored, cardsById, defaultSource);
      var key = buildSemanticTransactionKey(stored, ctx);
      if (key && !index[key]) index[key] = stored;
    });
    return index;
  }

  function daysApart(dateA, dateB) {
    if (!dateA || !dateB) return 999;
    var a = new Date(dateA);
    var b = new Date(dateB);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 999;
    return Math.abs(a.getTime() - b.getTime()) / 86400000;
  }

  function merchantSimilarity(a, b) {
    var na = normalizeTransactionMerchant(a);
    var nb = normalizeTransactionMerchant(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return 0.9;
    return 0;
  }

  function transactionsEquivalent(incoming, stored) {
    return (incoming.amountCents || 0) === (stored.amountCents || 0) &&
      String(incoming.flow || "") === String(stored.flow || "") &&
      normalizeTransactionMerchant(incoming.description) ===
        normalizeTransactionMerchant(stored.description);
  }

  function findStrongMatch(tx, index, context) {
    var keys = getTransactionIdentityKeys(tx, context);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (index[keys[i]]) return { stored: index[keys[i]], matchKey: keys[i] };
    }
    return null;
  }

  function findPossibleDuplicate(incoming, storedTransactions, context) {
    var best = null;
    var incomingMerchant = normalizeTransactionMerchant(incoming.description);
    (storedTransactions || []).forEach(function (stored) {
      if ((incoming.amountCents || 0) !== (stored.amountCents || 0)) return;
      if (String(incoming.flow || "") !== String(stored.flow || "")) return;
      if (getTypeFamily(incoming) !== getTypeFamily(stored)) return;

      var cardA = normalizeCardIdentity(incoming.cardId, null, incoming);
      var cardB = normalizeCardIdentity(stored.cardId, null, stored);
      if (cardA !== "unknown" && cardB !== "unknown" && cardA !== cardB) return;

      var sim = merchantSimilarity(incoming.description, stored.description);
      if (sim < 0.85) return;

      var sameDate = incoming.date && stored.date && incoming.date === stored.date;
      var closeDate = daysApart(incoming.date, stored.date) <= 3;
      var sameCompetence = incoming.competenceMonth && incoming.competenceMonth === stored.competenceMonth;
      if (!sameDate && !closeDate && !sameCompetence) return;

      if (sameDate && incomingMerchant === normalizeTransactionMerchant(stored.description)) {
        best = stored;
        return;
      }
      if (closeDate || sameCompetence) best = stored;
    });
    return best;
  }

  function compareTransactionIdentity(existingTx, incomingTx, context) {
    context = context || {};
    var index = context.strongIndex || {};
    var semanticIndex = context.semanticIndex || {};
    var txContext = buildTransactionContext(incomingTx, context.cardsById, context.source);
    var strong = findStrongMatch(incomingTx, index, context);
    if (strong) {
      if (transactionsEquivalent(incomingTx, strong.stored)) {
        return {
          status: "already_imported",
          stored: strong.stored,
          matchKey: strong.matchKey,
          reason: "strong_identity"
        };
      }
      return {
        status: "changed_existing",
        stored: strong.stored,
        transaction: incomingTx,
        matchKey: strong.matchKey,
        reason: "strong_identity_changed"
      };
    }

    var semanticKey = buildSemanticTransactionKey(incomingTx, txContext);
    if (semanticKey && semanticIndex[semanticKey]) {
      var semStored = semanticIndex[semanticKey];
      if (transactionsEquivalent(incomingTx, semStored)) {
        return {
          status: "already_imported",
          stored: semStored,
          matchKey: "sem:" + semanticKey,
          reason: "semantic_key"
        };
      }
      return {
        status: "changed_existing",
        stored: semStored,
        transaction: incomingTx,
        matchKey: "sem:" + semanticKey,
        reason: "semantic_key_changed"
      };
    }

    var legacy = parseLegacyRawHash(incomingTx.rawHash || incomingTx.sourceRawHash || "");
    if (legacy.kind === "legacyCanonicalFingerprint") {
      var legacyMatch = null;
      (context.storedTransactions || []).some(function (stored) {
        var amount = incomingTx.amountCents != null ? incomingTx.amountCents : legacy.amountCents;
        if ((stored.amountCents || 0) !== (amount || 0)) return false;
        if (legacy.flow && stored.flow && legacy.flow !== stored.flow) return false;
        if (legacy.date && stored.date && legacy.date !== stored.date) return false;
        if (legacy.normalizedDescription &&
            merchantSimilarity(legacy.normalizedDescription, stored.description) >= 0.85) {
          legacyMatch = {
            status: "legacy_overlap",
            stored: stored,
            transaction: incomingTx,
            reason: "legacy_raw_hash"
          };
          return true;
        }
        return false;
      });
      if (legacyMatch) return legacyMatch;
    }

    var possible = findPossibleDuplicate(incomingTx, context.storedTransactions, context);
    if (possible) {
      return {
        status: "possible_duplicate",
        stored: possible,
        transaction: incomingTx,
        reason: "amount_merchant_date"
      };
    }

    return { status: "safe_new", transaction: incomingTx, reason: "no_match" };
  }

  function buildContentSignature(report) {
    var src = report && report.source ? report.source : {};
    var parsed = parseLegacyRawHash(src.rawHash || src.canonicalFingerprint || "");
    if (parsed.kind === "sha256") return parsed.hash;
    if (parsed.kind === "legacyCanonicalFingerprint") return "legacy:" + parsed.raw;
    var keys = (report.allTransactions || [])
      .filter(function (tx) { return tx && !tx.isInvalid; })
      .map(function (tx) { return buildSemanticTransactionKey(tx, { source: src }); })
      .sort()
      .join("|");
    return "txset:" + keys;
  }

  function getAllStoredTransactions(appData) {
    appData = appData || {};
    return bucketToArray(appData.transactions);
  }

  function getActiveEntityBuckets(activeData) {
    var store = CFM.localStoreService || CFM.localStore;
    var app = store && store.loadAppData ? store.loadAppData() : {};
    if (activeData && activeData.hasData) {
      return {
        cards: bucketToArray(activeData.cards),
        invoices: bucketToArray(activeData.invoices),
        transactions: bucketToArray(activeData.transactions),
        installmentPlans: bucketToArray(activeData.installmentPlans),
        recurringRules: bucketToArray(activeData.recurringRules)
      };
    }
    return {
      cards: bucketToArray(app.cards),
      invoices: bucketToArray(app.invoices),
      transactions: bucketToArray(app.transactions),
      installmentPlans: bucketToArray(app.installmentPlans),
      recurringRules: bucketToArray(app.recurringRules)
    };
  }

  function buildDiffContext(report, activeData) {
    var source = report && report.source ? report.source : {};
    var buckets = getActiveEntityBuckets(activeData);
    var storedTransactions = buckets.transactions;
    var cardsById = cardsByIdFromList(buckets.cards);
    return {
      source: source,
      storedTransactions: storedTransactions,
      storedCards: buckets.cards,
      storedInvoices: buckets.invoices,
      storedPlans: buckets.installmentPlans,
      storedRules: buckets.recurringRules,
      cardsById: cardsById,
      strongIndex: indexStoredTransactions(storedTransactions, cardsById, source),
      semanticIndex: indexSemanticKeys(storedTransactions, cardsById, source)
    };
  }

  function findExistingCardBySemanticKey(card, storedCards) {
    if (!card) return null;
    var key = buildCardSemanticKey(card);
    var identity = normalizeCardIdentity(card.id || card.externalRef, card, null);
    var match = null;
    (storedCards || []).some(function (stored) {
      if (buildCardSemanticKey(stored) === key) {
        match = stored;
        return true;
      }
      if (normalizeCardIdentity(stored.id, stored, null) === identity) {
        match = stored;
        return true;
      }
      return false;
    });
    return match;
  }

  function findExistingInvoiceBySemanticKey(inv, storedInvoices, cardIdMap) {
    if (!inv) return null;
    var incomingCardId = inv.cardId || inv.cardExternalRef || "";
    var resolvedCardId = (cardIdMap[incomingCardId] && cardIdMap[incomingCardId].existingId) ||
      incomingCardId;
    var cardKey = normalizeCardIdentity(resolvedCardId, null, null);
    var key = buildInvoiceSemanticKey({ competenceMonth: inv.competenceMonth, cardId: resolvedCardId }, cardKey);
    var match = null;
    (storedInvoices || []).some(function (stored) {
      var storedCardId = (cardIdMap[stored.cardId] && cardIdMap[stored.cardId].existingId) || stored.cardId;
      var storedKey = buildInvoiceSemanticKey(
        { competenceMonth: stored.competenceMonth, cardId: storedCardId },
        normalizeCardIdentity(storedCardId, null, null)
      );
      if (storedKey === key) {
        match = stored;
        return true;
      }
      return false;
    });
    return match;
  }

  function findExistingPlanBySemanticKey(plan, storedPlans, cardIdMap) {
    if (!plan) return null;
    var incomingCardId = plan.cardId || "";
    var resolvedCardId = (cardIdMap[incomingCardId] && cardIdMap[incomingCardId].existingId) ||
      incomingCardId;
    var key = buildPlanSemanticKey(
      Object.assign({}, plan, { cardId: resolvedCardId }),
      normalizeCardIdentity(resolvedCardId, null, null)
    );
    var match = null;
    (storedPlans || []).some(function (stored) {
      var storedCardId = (cardIdMap[stored.cardId] && cardIdMap[stored.cardId].existingId) || stored.cardId;
      var storedKey = buildPlanSemanticKey(
        Object.assign({}, stored, { cardId: storedCardId }),
        normalizeCardIdentity(storedCardId, null, null)
      );
      if (storedKey === key) {
        match = stored;
        return true;
      }
      return false;
    });
    return match;
  }

  function findExistingRuleBySemanticKey(rule, storedRules) {
    if (!rule) return null;
    var key = buildRecurringSemanticKey(rule);
    var match = null;
    (storedRules || []).some(function (stored) {
      if (buildRecurringSemanticKey(stored) === key) {
        match = stored;
        return true;
      }
      return false;
    });
    return match;
  }

  function buildEntityResolution(report, activeData) {
    var buckets = getActiveEntityBuckets(activeData);
    var cardIdMap = {};
    var invoiceIdMap = {};
    var planIdMap = {};
    var ruleIdMap = {};
    var equivalentEntities = [];

    (report.cardSummaries || []).forEach(function (card) {
      var incomingId = card.id || card.canonicalKey || card.externalRef || "";
      if (!incomingId) return;
      var existing = findExistingCardBySemanticKey(card, buckets.cards);
      if (existing) {
        cardIdMap[incomingId] = {
          existingId: existing.id,
          semanticKey: buildCardSemanticKey(card),
          equivalent: existing.id !== incomingId
        };
        if (existing.id !== incomingId) {
          equivalentEntities.push({
            type: "card",
            incomingId: incomingId,
            existingId: existing.id,
            label: card.name || incomingId
          });
        }
      } else {
        cardIdMap[incomingId] = {
          existingId: null,
          semanticKey: buildCardSemanticKey(card),
          equivalent: false
        };
      }
    });

    (report.allInvoices || []).forEach(function (inv) {
      if (!inv || inv.isReference || inv.isStub || inv.referenceOnly) return;
      var incomingId = inv.externalRef || inv.id || "";
      if (!incomingId) return;
      var existing = findExistingInvoiceBySemanticKey(inv, buckets.invoices, cardIdMap);
      if (existing) {
        invoiceIdMap[incomingId] = {
          existingId: existing.id,
          semanticKey: buildInvoiceSemanticKey(inv),
          equivalent: existing.id !== incomingId
        };
        if (existing.id !== incomingId) {
          equivalentEntities.push({
            type: "invoice",
            incomingId: incomingId,
            existingId: existing.id,
            label: inv.competenceMonth || incomingId
          });
        }
      } else {
        invoiceIdMap[incomingId] = { existingId: null, semanticKey: buildInvoiceSemanticKey(inv), equivalent: false };
      }
    });

    (report.allInstallmentPlans || []).forEach(function (plan) {
      var incomingId = plan.externalRef || plan.id || plan.planStableRef || "";
      if (!incomingId) return;
      var existing = findExistingPlanBySemanticKey(plan, buckets.installmentPlans, cardIdMap);
      if (existing) {
        planIdMap[incomingId] = {
          existingId: existing.id,
          semanticKey: buildPlanSemanticKey(plan),
          equivalent: existing.id !== incomingId
        };
        if (existing.id !== incomingId) {
          equivalentEntities.push({
            type: "installmentPlan",
            incomingId: incomingId,
            existingId: existing.id,
            label: plan.description || incomingId
          });
        }
      } else {
        planIdMap[incomingId] = { existingId: null, semanticKey: buildPlanSemanticKey(plan), equivalent: false };
      }
    });

    (report.allRecurringRules || []).forEach(function (rule) {
      var incomingId = rule.externalRef || rule.id || rule.ruleId || "";
      if (!incomingId) return;
      var existing = findExistingRuleBySemanticKey(rule, buckets.recurringRules);
      if (existing) {
        ruleIdMap[incomingId] = {
          existingId: existing.id,
          semanticKey: buildRecurringSemanticKey(rule),
          equivalent: existing.id !== incomingId
        };
        if (existing.id !== incomingId) {
          equivalentEntities.push({
            type: "recurringRule",
            incomingId: incomingId,
            existingId: existing.id,
            label: rule.description || incomingId
          });
        }
      } else {
        ruleIdMap[incomingId] = { existingId: null, semanticKey: buildRecurringSemanticKey(rule), equivalent: false };
      }
    });

    return {
      cardIdMap: cardIdMap,
      invoiceIdMap: invoiceIdMap,
      planIdMap: planIdMap,
      ruleIdMap: ruleIdMap,
      equivalentEntities: equivalentEntities,
      equivalentEntityCount: equivalentEntities.length
    };
  }

  function isReadableLegacyFingerprint(parsed) {
    return !!(parsed && parsed.kind === "legacyCanonicalFingerprint" &&
      String(parsed.raw || "").indexOf("|") >= 0);
  }

  function detectLegacyImportSignals(report, summary, entityResolution) {
    var src = report && report.source ? report.source : {};
    var fileName = String(report.fileName || "").toLowerCase();
    var parsed = parseLegacyRawHash(src.rawHash || src.canonicalFingerprint || "");
    var total = summary.totalIncoming || 0;
    var matched = summary.alreadyImportedTransactions.length +
      summary.possibleDuplicates.length +
      summary.changedExisting.length;
    var overlapRatio = total > 0 ? matched / total : 0;
    var oldCardRefs = false;
    var legacyRefCount = 0;

    (report.allTransactions || []).some(function (tx) {
      if (isLegacyCardRef(tx && tx.cardId)) {
        legacyRefCount++;
        oldCardRefs = true;
        return false;
      }
      return false;
    });
    var legacyRefRatio = total > 0 ? legacyRefCount / total : 0;
    var legacyFileName = /cardsnapshots|import_v1|_legacy|v1_cardsnap/i.test(fileName);

    return {
      legacyHash: isReadableLegacyFingerprint(parsed),
      legacyFileName: legacyFileName,
      oldCardRefs: oldCardRefs,
      legacyRefRatio: legacyRefRatio,
      equivalentEntities: (entityResolution.equivalentEntityCount || 0) > 0,
      highOverlap: overlapRatio >= 0.35,
      overlapRatio: overlapRatio,
      active: isReadableLegacyFingerprint(parsed) ||
        legacyFileName ||
        ((entityResolution.equivalentEntityCount || 0) > 0 && overlapRatio >= 0.25 &&
          (legacyFileName || isReadableLegacyFingerprint(parsed) || legacyRefRatio >= 0.5)) ||
        (legacyRefRatio >= 0.6 && overlapRatio >= 0.45)
    };
  }

  function refineTransactionClassification(tx, result, context, entityResolution, legacyImportSignals) {
    if (!tx || !result) return result;
    var incomingCardId = tx.cardId || "";
    var cardMapping = entityResolution.cardIdMap[incomingCardId];

    if (result.status === "safe_new" && cardMapping && cardMapping.existingId &&
        cardMapping.existingId !== incomingCardId) {
      var retried = compareTransactionIdentity(null,
        Object.assign({}, tx, { cardId: cardMapping.existingId }), context);
      if (retried.status !== "safe_new") return retried;
    }

    if (result.status !== "safe_new") return result;

    if (legacyImportSignals) {
      var possible = findPossibleDuplicate(tx, context.storedTransactions, context);
      if (possible) {
        return {
          status: "possible_duplicate",
          stored: possible,
          transaction: tx,
          reason: "legacy_proximity"
        };
      }
      return {
        status: "unsafe_legacy_candidate",
        transaction: tx,
        reason: cardMapping && cardMapping.existingId ? "equivalent_card_unmatched_tx" : "legacy_unverified_new"
      };
    }

    if (cardMapping && cardMapping.existingId && cardMapping.existingId !== incomingCardId) {
      var prox = findPossibleDuplicate(tx, context.storedTransactions, context);
      if (prox) {
        return {
          status: "possible_duplicate",
          stored: prox,
          transaction: tx,
          reason: "equivalent_card_proximity"
        };
      }
    }

    return result;
  }

  function resolveStatus(summary, hasStoredData) {
    if (!hasStoredData) return "fresh";

    var total = summary.totalIncoming || 0;
    var matched = summary.alreadyImportedTransactions.length +
      summary.possibleDuplicates.length +
      summary.changedExisting.length +
      summary.unsafeLegacyCandidates.length;
    var overlapRatio = total > 0 ? matched / total : 0;

    if (summary.safeNewTransactions.length === 0 && summary.unsafeLegacyCandidates.length === 0) {
      if (summary.legacyImportSignals && summary.legacyImportSignals.active) {
        return "legacy_overlap_blocked";
      }
      if (total > 0 && matched >= total && summary.possibleDuplicates.length === 0) {
        return "no_new_occurrences";
      }
      if (summary.legacyOverlapCount > 0 || overlapRatio >= 0.5) {
        return summary.legacyImportSignals && summary.legacyImportSignals.active
          ? "legacy_overlap_blocked"
          : "legacy_overlap";
      }
      return "no_new_occurrences";
    }

    if (summary.changedExisting.length > 0 && !summary.changedExistingResolved) {
      return "requires_review";
    }

    if (summary.legacyImportSignals && summary.legacyImportSignals.active && (
      overlapRatio >= 0.25 ||
      summary.equivalentEntityCount > 0 ||
      summary.possibleDuplicates.length > 0 ||
      summary.unsafeLegacyCandidates.length > 0 ||
      summary.safeNewTransactions.length > 0
    )) {
      return "legacy_overlap_blocked";
    }

    if (summary.safeNewTransactions.length > 0 &&
        summary.unsafeLegacyCandidates.length === 0 &&
        summary.changedExisting.length === 0 &&
        summary.possibleDuplicates.length === 0 &&
        !(summary.legacyImportSignals && summary.legacyImportSignals.active)) {
      summary.safeIncremental = true;
      return "incremental";
    }

    if (summary.safeNewTransactions.length > 0) {
      return summary.legacyImportSignals && summary.legacyImportSignals.active
        ? "legacy_overlap_blocked"
        : "requires_review";
    }

    return "legacy_overlap_blocked";
  }

  function resolveConfidence(summary) {
    if (summary.legacyImportSignals && summary.legacyImportSignals.active) return "high";
    if (summary.legacyOverlapCount > 0 || summary.alreadyImportedTransactions.length > 5) return "high";
    if (summary.possibleDuplicates.length > 0 || summary.unsafeLegacyCandidates.length > 0) return "medium";
    return "high";
  }

  function buildSummaryMessage(summary, status) {
    if (status === "incremental" && summary.safeIncremental) {
      return "Importação incremental segura: " + summary.safeNewTransactions.length +
        " lançamento(s) novo(s). " + summary.alreadyImportedTransactions.length +
        " já existem.";
    }
    if (status === "incremental") {
      return "Encontramos " + summary.safeNewTransactions.length + " lançamento(s) novo(s). " +
        summary.alreadyImportedTransactions.length + " lançamento(s) já existem e " +
        summary.possibleDuplicates.length + " possível(is) duplicidade(s) não serão importadas automaticamente.";
    }
    if (status === "legacy_overlap_blocked" || status === "requires_review") {
      return "Arquivo antigo ou sobreposto detectado. Revise antes de importar.";
    }
    if (status === "legacy_overlap" || status === "unsafe_legacy_import") {
      return "Este arquivo parece uma versão anterior de dados já importados.";
    }
    if (status === "no_new_occurrences") {
      return "Este arquivo não possui novos lançamentos.";
    }
    return "";
  }

  function isBlockedImportStatus(status) {
    return status === "legacy_overlap_blocked" ||
      status === "requires_review" ||
      status === "legacy_overlap" ||
      status === "unsafe_legacy_import";
  }

  function classifyImportCompatibility(report, activeData, decisions) {
    decisions = decisions || {};
    var ignored = decisions.ignoredTransactions || {};
    var changedDecisions = decisions.changedExistingDecisions || {};
    var buckets = getActiveEntityBuckets(activeData);
    var storedTransactions = buckets.transactions;
    var context = buildDiffContext(report, activeData);
    var entityResolution = buildEntityResolution(report, activeData);
    context.entityResolution = entityResolution;
    var persist = CFM.importPersistence || {};
    var store = CFM.localStoreService || CFM.localStore;
    var batchSignature = persist.buildBatchSignature ? persist.buildBatchSignature(report) : "";
    var contentSignature = buildContentSignature(report);
    var incoming = (report.allTransactions || []).filter(function (tx) {
      return tx && !tx.isInvalid && !ignored[tx.stableRef];
    });

    var safeNewTransactions = [];
    var alreadyImportedTransactions = [];
    var possibleDuplicates = [];
    var changedExisting = [];
    var unsafeLegacyCandidates = [];
    var legacyOverlapCount = 0;

    incoming.forEach(function (tx) {
      var result = compareTransactionIdentity(null, tx, context);
      result = refineTransactionClassification(tx, result, context, entityResolution, false);
      switch (result.status) {
        case "already_imported":
          alreadyImportedTransactions.push({
            transaction: tx,
            stored: result.stored,
            reason: result.reason,
            matchKey: result.matchKey
          });
          if (result.reason === "semantic_key" || result.reason === "legacy_raw_hash") {
            legacyOverlapCount++;
          }
          break;
        case "changed_existing":
          changedExisting.push({
            transaction: tx,
            stored: result.stored,
            reason: result.reason,
            matchKey: result.matchKey,
            decision: changedDecisions[tx.stableRef] || "keep_current"
          });
          break;
        case "possible_duplicate":
          possibleDuplicates.push({
            transaction: tx,
            stored: result.stored,
            reason: result.reason
          });
          legacyOverlapCount++;
          break;
        case "legacy_overlap":
          alreadyImportedTransactions.push({
            transaction: tx,
            stored: result.stored,
            reason: result.reason
          });
          legacyOverlapCount++;
          break;
        case "unsafe_legacy_candidate":
          unsafeLegacyCandidates.push({
            transaction: tx,
            reason: result.reason
          });
          legacyOverlapCount++;
          break;
        default:
          safeNewTransactions.push(tx);
      }
    });

    var provisionalSummary = {
      totalIncoming: incoming.length,
      safeNewTransactions: safeNewTransactions,
      alreadyImportedTransactions: alreadyImportedTransactions,
      possibleDuplicates: possibleDuplicates,
      changedExisting: changedExisting,
      unsafeLegacyCandidates: unsafeLegacyCandidates,
      legacyOverlapCount: legacyOverlapCount,
      equivalentEntityCount: entityResolution.equivalentEntityCount || 0
    };
    var legacyImportSignals = detectLegacyImportSignals(report, provisionalSummary, entityResolution);

    if (legacyImportSignals.active) {
      safeNewTransactions = [];
      alreadyImportedTransactions = [];
      possibleDuplicates = [];
      changedExisting = [];
      unsafeLegacyCandidates = [];
      legacyOverlapCount = 0;

      incoming.forEach(function (tx) {
        var result = compareTransactionIdentity(null, tx, context);
        result = refineTransactionClassification(tx, result, context, entityResolution, true);
        switch (result.status) {
          case "already_imported":
            alreadyImportedTransactions.push({
              transaction: tx,
              stored: result.stored,
              reason: result.reason,
              matchKey: result.matchKey
            });
            if (result.reason === "semantic_key" || result.reason === "legacy_raw_hash") {
              legacyOverlapCount++;
            }
            break;
          case "changed_existing":
            changedExisting.push({
              transaction: tx,
              stored: result.stored,
              reason: result.reason,
              matchKey: result.matchKey,
              decision: "keep_current"
            });
            break;
          case "possible_duplicate":
            possibleDuplicates.push({
              transaction: tx,
              stored: result.stored,
              reason: result.reason
            });
            legacyOverlapCount++;
            break;
          case "legacy_overlap":
            alreadyImportedTransactions.push({
              transaction: tx,
              stored: result.stored,
              reason: result.reason
            });
            legacyOverlapCount++;
            break;
          case "unsafe_legacy_candidate":
            unsafeLegacyCandidates.push({
              transaction: tx,
              reason: result.reason
            });
            legacyOverlapCount++;
            break;
          default:
            unsafeLegacyCandidates.push({
              transaction: tx,
              reason: "legacy_unverified_new"
            });
            legacyOverlapCount++;
        }
      });
    }

    var changedExistingResolved = changedExisting.every(function (item) {
      return changedDecisions[item.transaction.stableRef] === "use_imported" ||
        changedDecisions[item.transaction.stableRef] === "keep_both";
    });
    var hasStoredData = storedTransactions.length > 0;
    var summary = {
      totalIncoming: incoming.length,
      safeNewTransactions: safeNewTransactions,
      alreadyImportedTransactions: alreadyImportedTransactions,
      possibleDuplicates: possibleDuplicates,
      changedExisting: changedExisting,
      unsafeLegacyCandidates: unsafeLegacyCandidates,
      legacyOverlapCount: legacyOverlapCount,
      equivalentEntityCount: entityResolution.equivalentEntityCount || 0,
      equivalentEntities: entityResolution.equivalentEntities || [],
      entityResolution: entityResolution,
      legacyImportSignals: legacyImportSignals,
      hasStoredData: hasStoredData,
      batchSignature: batchSignature,
      contentSignature: contentSignature,
      sameBatchExists: store && store.hasImportBatch ? store.hasImportBatch(batchSignature) : false,
      changedExistingResolved: changedExistingResolved,
      blockedSave: false,
      safeIncremental: false
    };
    summary.status = resolveStatus(summary, hasStoredData);
    summary.blockedSave = isBlockedImportStatus(summary.status);
    summary.confidence = resolveConfidence(summary);
    summary.message = buildSummaryMessage(summary, summary.status);
    return summary;
  }

  function analyzeImportDiff(report, decisions) {
    var store = CFM.localStoreService || CFM.localStore;
    var activeData = store && store.getActiveFinancialData ? store.getActiveFinancialData() : null;
    var summary = classifyImportCompatibility(report, activeData, decisions);
    return Object.assign({}, summary, {
      newTransactions: summary.safeNewTransactions,
      existingTransactions: summary.alreadyImportedTransactions.map(function (item) {
        return item.transaction;
      })
    });
  }

  function getRelatedCardIds(transactions) {
    var ids = {};
    (transactions || []).forEach(function (tx) {
      if (tx && tx.cardId) ids[tx.cardId] = true;
    });
    return ids;
  }

  function getRelatedInvoiceIds(transactions) {
    var ids = {};
    (transactions || []).forEach(function (tx) {
      if (tx && tx.invoiceId) ids[tx.invoiceId] = true;
    });
    return ids;
  }

  function buildIncrementalDisplayReport(report, diffResult) {
    if (!report || !diffResult) return report;
    if (diffResult.blockedSave) {
      return Object.assign({}, report, {
        incrementalImport: false,
        importDiff: diffResult,
        legacyBlockedImport: true,
        changedExistingTransactions: diffResult.changedExisting || [],
        possibleDuplicateTransactions: diffResult.possibleDuplicates || [],
        unsafeLegacyCandidates: diffResult.unsafeLegacyCandidates || [],
        alreadyImportedTransactionsPreview: diffResult.alreadyImportedTransactions || [],
        equivalentEntitiesPreview: diffResult.equivalentEntities || []
      });
    }
    var newTxs = diffResult.safeNewTransactions || diffResult.newTransactions || [];
    var cardIds = getRelatedCardIds(newTxs);
    var invoiceIds = getRelatedInvoiceIds(newTxs);

    var filteredInvoices = (report.allInvoices || []).filter(function (inv) {
      if (!inv || inv.isReference || inv.isStub || inv.referenceOnly) return false;
      var invKey = inv.externalRef || inv.id || inv.invoiceExternalRef || "";
      return invoiceIds[invKey] || cardIds[inv.cardId || inv.cardExternalRef || ""];
    });

    var filteredCards = (report.cardSummaries || []).filter(function (card) {
      var cardKey = card.id || card.canonicalKey || "";
      return cardIds[cardKey];
    });

    var filteredPlans = newTxs.length
      ? (report.allInstallmentPlans || []).filter(function (plan) {
        return cardIds[plan.cardId || ""];
      })
      : [];

    return Object.assign({}, report, {
      incrementalImport: true,
      safeIncremental: !!diffResult.safeIncremental,
      importDiff: diffResult,
      allTransactions: newTxs,
      allInvoices: filteredInvoices,
      cardSummaries: filteredCards,
      allInstallmentPlans: filteredPlans,
      allRecurringRules: [],
      counters: Object.assign({}, report.counters || {}, {
        transactions: newTxs.length,
        cards: filteredCards.length,
        invoices: filteredInvoices.length,
        installmentPlans: filteredPlans.length,
        recurringRules: 0
      }),
      changedExistingTransactions: diffResult.changedExisting || [],
      possibleDuplicateTransactions: diffResult.possibleDuplicates || [],
      alreadyImportedTransactionsPreview: diffResult.alreadyImportedTransactions || []
    });
  }

  function buildCardMergeKey(card) {
    if (!card) return "";
    return "card:" + normalizeCardIdentity(card.id || card.canonicalKey, card, null);
  }

  function buildInvoiceMergeKey(inv) {
    if (!inv) return "";
    if (inv.externalRef) return "inv:" + inv.externalRef;
    if (inv.id) return "inv:" + inv.id;
    return "inv:" + normalizeCardIdentity(inv.cardId || inv.cardExternalRef, null, null) + ":" +
      String(inv.competenceMonth || "");
  }

  function buildPlanMergeKey(plan) {
    if (!plan) return "";
    return "plan:" + String(plan.externalRef || plan.id || plan.planStableRef || plan.description || "");
  }

  function buildRuleMergeKey(rule) {
    if (!rule) return "";
    if (rule.externalRef) return "rule:" + rule.externalRef;
    if (rule.id) return "rule:" + rule.id;
    return "rule:" + normalizeTransactionMerchant(rule.description) + ":" +
      String(rule.frequency || "") + ":" + String(rule.expectedAmountCents || rule.amountCents || 0);
  }

  function indexStoredEntities(appData, bucketName, keyFn) {
    var index = {};
    Object.keys(appData[bucketName] || {}).forEach(function (id) {
      var entity = appData[bucketName][id];
      var key = keyFn(entity);
      if (key) index[key] = entity;
    });
    return index;
  }

  function entityExistsByMergeKey(appData, bucketName, keyFn, entity) {
    var key = keyFn(entity);
    if (!key) return false;
    var index = indexStoredEntities(appData, bucketName, keyFn);
    return !!index[key];
  }

  CFM.importDiff = {
    parseLegacyRawHash: parseLegacyRawHash,
    normalizeTransactionMerchant: normalizeTransactionMerchant,
    normalizeCardIdentity: normalizeCardIdentity,
    normalizeCardName: normalizeCardName,
    buildCardSemanticKey: buildCardSemanticKey,
    buildInvoiceSemanticKey: buildInvoiceSemanticKey,
    buildPlanSemanticKey: buildPlanSemanticKey,
    buildRecurringSemanticKey: buildRecurringSemanticKey,
    buildSemanticTransactionKey: buildSemanticTransactionKey,
    buildEntityResolution: buildEntityResolution,
    detectLegacyImportSignals: detectLegacyImportSignals,
    isBlockedImportStatus: isBlockedImportStatus,
    isLegacyCardRef: isLegacyCardRef,
    isReadableLegacyFingerprint: isReadableLegacyFingerprint,
    getTypeFamily: getTypeFamily,
    compareTransactionIdentity: compareTransactionIdentity,
    classifyImportCompatibility: classifyImportCompatibility,
    normalizeDescription: normalizeDescription,
    getPrimaryIdentityKey: getPrimaryIdentityKey,
    getTransactionIdentityKeys: getTransactionIdentityKeys,
    buildContentSignature: buildContentSignature,
    analyzeImportDiff: analyzeImportDiff,
    buildIncrementalDisplayReport: buildIncrementalDisplayReport,
    buildCardMergeKey: buildCardMergeKey,
    buildInvoiceMergeKey: buildInvoiceMergeKey,
    buildPlanMergeKey: buildPlanMergeKey,
    buildRuleMergeKey: buildRuleMergeKey,
    entityExistsByMergeKey: entityExistsByMergeKey
  };
})(window.CFM);
