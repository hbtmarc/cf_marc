/**
 * Utilitários de validação, classificação de semelhanças e privacidade — CFM
 * Sem dependências externas. Compatível com file:// e GitHub Pages.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var CONFIDENCE_LABELS = {
    high:   "Alta",
    medium: "Média",
    low:    "Baixa",
    none:   "Não é duplicidade"
  };

  var CLASSIFICATION_LABELS = {
    exact_duplicate:      "Duplicata exata",
    probable_duplicate:   "Duplicata provável",
    installment_related:  "Parcelas relacionadas",
    recurring_candidate:  "Recorrência candidata",
    repeated_purchase:    "Compra repetida",
    similar_transfer:     "Transferência semelhante",
    not_duplicate:        "Não é duplicidade"
  };

  var RECURRING_TYPES = ["expense", "credit_card_purchase", "fee"];
  var PURCHASE_TYPES  = ["expense", "credit_card_purchase"];

  /* ── Normalização ── */

  function normalizeDescription(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripInstallmentFromDesc(desc) {
    return normalizeDescription(desc)
      .replace(/\bparcela?\s*\d+\s*[/\\]\s*\d+\b/g, "")
      .replace(/\b\d+\s*[/\\]\s*\d+\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function descriptionsSimilar(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var minLen = Math.min(a.length, b.length);
    if (minLen >= 6) {
      var prefix = Math.min(12, minLen);
      return a.substring(0, prefix) === b.substring(0, prefix) ||
        a.indexOf(b.substring(0, prefix)) >= 0 ||
        b.indexOf(a.substring(0, prefix)) >= 0;
    }
    return false;
  }

  function monthsApart(m1, m2) {
    if (!m1 || !m2) return null;
    var p1 = m1.split("-"), p2 = m2.split("-");
    if (p1.length < 2 || p2.length < 2) return null;
    return Math.abs(
      (parseInt(p2[0], 10) - parseInt(p1[0], 10)) * 12 +
      (parseInt(p2[1], 10) - parseInt(p1[1], 10))
    );
  }

  function amountsNear(a, b) {
    var ca = a || 0, cb = b || 0;
    if (ca === cb) return true;
    return Math.abs(ca - cb) <= Math.max(10, Math.round(ca * 0.01));
  }

  /* ── Acesso a campos da transação ── */

  var SHA256_REGEX = /^sha256:[a-f0-9]{64}$/i;

  var PT_MONTHS = {
    janeiro: "01", fevereiro: "02", marco: "03", "março": "03", abril: "04",
    maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
    outubro: "10", novembro: "11", dezembro: "12"
  };

  function isValidSha256Hash(value) {
    return typeof value === "string" && SHA256_REGEX.test(value.trim());
  }

  function relocateReadableHash(host) {
    if (!host || typeof host !== "object") return;
    var raw = host.rawHash;
    if (raw === undefined) return;
    if (isValidSha256Hash(raw)) return;
    if (!isNonEmptyString(raw)) {
      delete host.rawHash;
      return;
    }
    if (!host.source || typeof host.source !== "object") host.source = {};
    var fp = String(raw).trim();
    if (!host.source.canonicalFingerprint) {
      host.source.canonicalFingerprint = fp;
    } else if (!host.source.rawFingerprint) {
      host.source.rawFingerprint = fp;
    }
    delete host.rawHash;
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  function normalizeHashFields(entity) {
    if (!entity || typeof entity !== "object") return entity;
    relocateReadableHash(entity);
    if (entity.source && entity.source.rawHash !== undefined) {
      var src = entity.source;
      if (isValidSha256Hash(src.rawHash)) {
        entity.rawHash = src.rawHash;
      } else if (isNonEmptyString(src.rawHash)) {
        if (!src.canonicalFingerprint) src.canonicalFingerprint = String(src.rawHash).trim();
        else if (!src.rawFingerprint) src.rawFingerprint = String(src.rawHash).trim();
      }
      delete src.rawHash;
    }
    return entity;
  }

  function normalizeRecurringRule(rule) {
    if (!rule || typeof rule !== "object") return rule;
    var n = Object.assign({}, rule);
    if (!n.externalRef && n.id) n.externalRef = n.id;
    if (n.amountCents != null && n.expectedAmountCents == null) {
      n.expectedAmountCents = n.amountCents;
    }
    delete n.amountCents;
    if (n.category && !n.categoryLabel) n.categoryLabel = n.category;
    delete n.category;
    if (n.cadence && !n.frequency) n.frequency = n.cadence;
    delete n.cadence;
    if (!n.frequency) n.frequency = "monthly";
    if (!n.type) n.type = n.flow === "in" ? "income" : "expense";
    if (!n.flow) n.flow = n.type === "income" ? "in" : "out";
    return n;
  }

  function normalizeImportPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    normalizeHashFields(payload);
    if (payload.source && typeof payload.source === "object") {
      if (payload.source.rawHash !== undefined && !isValidSha256Hash(payload.source.rawHash)) {
        if (isNonEmptyString(payload.source.rawHash)) {
          if (!payload.source.canonicalFingerprint) {
            payload.source.canonicalFingerprint = String(payload.source.rawHash).trim();
          } else if (!payload.source.rawFingerprint) {
            payload.source.rawFingerprint = String(payload.source.rawHash).trim();
          }
        }
        delete payload.source.rawHash;
      }
    }

    if (Array.isArray(payload.transactions)) {
      payload.transactions = payload.transactions.map(function (tx) {
        return tx ? normalizeHashFields(Object.assign({}, tx)) : tx;
      });
    }
    if (Array.isArray(payload.recurringRules)) {
      payload.recurringRules = payload.recurringRules.map(normalizeRecurringRule);
    }
    return payload;
  }

  function getTxRawHash(tx) {
    if (!tx) return "";
    var candidates = [
      tx.rawHash,
      tx.source && tx.source.rawHash
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (isValidSha256Hash(candidates[i])) return String(candidates[i]).trim();
    }
    return "";
  }

  function getTxTraceFingerprint(tx) {
    if (!tx) return "";
    var src = tx.source && typeof tx.source === "object" ? tx.source : {};
    return String(src.canonicalFingerprint || src.rawFingerprint || "").trim();
  }

  function hasTxTraceability(tx) {
    return !!getTxExternalRef(tx) || !!getTxRawHash(tx) || !!getTxTraceFingerprint(tx);
  }

  function parsePaymentCompetenceFromDescription(desc) {
    var d = String(desc || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var keys = Object.keys(PT_MONTHS);
    for (var i = 0; i < keys.length; i++) {
      var monthName = keys[i];
      var re = new RegExp(monthName + "\\s*[/\\-]?\\s*(\\d{4})", "i");
      var match = d.match(re);
      if (match) return match[1] + "-" + PT_MONTHS[monthName];
    }
    var numMatch = d.match(/(\d{1,2})\s*[/\\-]\s*(\d{4})/);
    if (numMatch) {
      var mm = numMatch[1].length === 1 ? "0" + numMatch[1] : numMatch[1];
      return numMatch[2] + "-" + mm;
    }
    return null;
  }

  function isHistoricalPaymentForInvoice(tx, invMonth) {
    if (!tx || tx.type !== "credit_card_payment") return false;
    var payMonth = parsePaymentCompetenceFromDescription(tx.description);
    if (payMonth && invMonth && payMonth !== invMonth) return true;
    return false;
  }

  function merchantKeyFromDesc(desc) {
    return stripInstallmentFromDesc(desc).substring(0, 32);
  }

  function linkOrphanInstallmentTransactions(transactions, installmentPlans) {
    if (!Array.isArray(transactions) || !Array.isArray(installmentPlans)) {
      return { linked: 0 };
    }
    var planByRef = {};
    installmentPlans.forEach(function (p) {
      if (!p) return;
      if (p.id) planByRef[p.id] = p;
      if (p.externalRef) planByRef[p.externalRef] = p;
    });
    var linked = 0;

    function findPlanForTx(tx) {
      var cur = getInstallmentCurrent(tx);
      var tot = getInstallmentTotal(tx);
      if (!cur || !tot || cur < 2) return null;
      var mk = merchantKeyFromDesc(tx.description);
      if (!mk) return null;

      var i, sib, sibRef, plan, planMk, j, pl;
      for (i = 0; i < transactions.length; i++) {
        sib = transactions[i];
        if (!sib || sib === tx) continue;
        sibRef = getInstallmentPlanRef(sib);
        if (!sibRef) continue;
        plan = planByRef[sibRef];
        if (!plan) continue;
        planMk = merchantKeyFromDesc(plan.description || sib.description);
        if (!descriptionsSimilar(mk, planMk)) continue;
        if (plan.totalInstallments && tot !== plan.totalInstallments) continue;
        if (plan.installmentAmountCents && !amountsNear(tx.amountCents, plan.installmentAmountCents)) continue;
        if (!plan.installmentAmountCents && sib.amountCents && !amountsNear(tx.amountCents, sib.amountCents)) continue;
        return plan;
      }
      for (j = 0; j < installmentPlans.length; j++) {
        pl = installmentPlans[j];
        if (!pl) continue;
        if (pl.totalInstallments && pl.totalInstallments !== tot) continue;
        if (!descriptionsSimilar(mk, merchantKeyFromDesc(pl.description))) continue;
        if (pl.installmentAmountCents && !amountsNear(tx.amountCents, pl.installmentAmountCents)) continue;
        return pl;
      }
      return null;
    }

    transactions.forEach(function (tx) {
      if (!tx || getInstallmentPlanRef(tx)) return;
      if (!getInstallmentCurrent(tx) || getInstallmentCurrent(tx) < 2) return;
      var matchedPlan = findPlanForTx(tx);
      if (!matchedPlan) return;
      tx.installmentPlanExternalRef = matchedPlan.externalRef || matchedPlan.id;
      linked++;
    });
    return { linked: linked };
  }

  function validateBrokenReferences(payload, options) {
    var broken = [];
    if (!payload || typeof payload !== "object") return broken;
    var opts = options || {};
    var resolveCard = opts.resolveCardId || function (r) { return r; };

    var cardIds = {}, accountIds = {}, invoiceIds = {}, planIds = {};
    (payload.cards || []).forEach(function (c) {
      if (!c) return;
      if (c.id) cardIds[c.id] = true;
      if (c.externalRef) cardIds[c.externalRef] = true;
    });
    (payload.accounts || []).forEach(function (a) {
      if (!a) return;
      if (a.id) accountIds[a.id] = true;
      if (a.externalRef) accountIds[a.externalRef] = true;
    });
    (payload.invoices || []).forEach(function (inv) {
      if (!inv) return;
      if (inv.id) invoiceIds[inv.id] = true;
      if (inv.externalRef) invoiceIds[inv.externalRef] = true;
      if (inv.invoiceExternalRef) invoiceIds[inv.invoiceExternalRef] = true;
    });
    (payload.installmentPlans || []).forEach(function (p) {
      if (!p) return;
      if (p.id) planIds[p.id] = true;
      if (p.externalRef) planIds[p.externalRef] = true;
    });

    function refExists(ref, map, resolver) {
      if (!ref) return true;
      if (map[ref]) return true;
      var resolved = resolver ? resolver(ref) : ref;
      return !!(resolved && map[resolved]);
    }

    function checkRef(ref, map, label, index, resolver) {
      if (!ref) return;
      if (!refExists(ref, map, resolver)) {
        broken.push(label + "[" + index + "]: referência quebrada — " + ref);
      }
    }

    (payload.transactions || []).forEach(function (tx, i) {
      if (!tx) return;
      checkRef(tx.accountId, accountIds, "transactions", i);
      checkRef(tx.cardId || tx.cardExternalRef, cardIds, "transactions", i, resolveCard);
      checkRef(tx.invoiceId || tx.invoiceExternalRef, invoiceIds, "transactions", i);
      checkRef(tx.installmentPlanId || tx.installmentPlanExternalRef, planIds, "transactions", i);
    });
    (payload.invoices || []).forEach(function (inv, i) {
      if (!inv) return;
      checkRef(inv.cardId || inv.cardExternalRef, cardIds, "invoices", i, resolveCard);
    });
    (payload.installmentPlans || []).forEach(function (p, i) {
      if (!p) return;
      checkRef(p.cardId || p.cardExternalRef, cardIds, "installmentPlans", i, resolveCard);
    });
    return broken;
  }

  function getTxExternalRef(tx) {
    return tx && tx.externalRef ? String(tx.externalRef) : "";
  }

  function getTxDate(tx) {
    return (tx && (tx.transactionDate || tx.date)) || "";
  }

  function getTxPostedDate(tx) {
    return (tx && (tx.postedDate || tx.date || tx.transactionDate)) || "";
  }

  function getTxStatus(tx) {
    return (tx && tx.status) ? String(tx.status).toLowerCase() : "confirmed";
  }

  function getInstallmentCurrent(tx) {
    if (!tx) return null;
    if (tx.installment && tx.installment.current != null)
      return Number(tx.installment.current);
    var m = String(tx.description || "").match(/(?:parcela?\s*)?(\d+)\s*[/\\]\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function getInstallmentTotal(tx) {
    if (!tx) return null;
    if (tx.installment && tx.installment.total != null)
      return Number(tx.installment.total);
    var m = String(tx.description || "").match(/(?:parcela?\s*)?(\d+)\s*[/\\]\s*(\d+)/i);
    return m ? parseInt(m[2], 10) : null;
  }

  function getInstallmentPlanRef(tx) {
    if (!tx) return "";
    return String(
      tx.installmentPlanExternalRef || tx.installmentPlanId || ""
    );
  }

  function sameAccountOrCard(a, b) {
    var idA = a.accountId || a.cardId || "";
    var idB = b.accountId || b.cardId || "";
    return idA && idB && idA === idB;
  }

  function isPixLike(desc) {
    return /pix/i.test(desc || "");
  }

  /* ── Classificação par a par ── */

  function classifyTransactionSimilarity(txA, txB) {
    if (!txA || !txB) {
      return { classification: "not_duplicate", confidence: "none" };
    }

    var hashA = getTxRawHash(txA), hashB = getTxRawHash(txB);
    var refA  = getTxExternalRef(txA), refB = getTxExternalRef(txB);

    if (hashA && hashB && hashA === hashB) {
      return { classification: "exact_duplicate", confidence: "high" };
    }
    if (refA && refB && refA === refB) {
      return { classification: "exact_duplicate", confidence: "high" };
    }

    if (hashA && hashB && hashA !== hashB) {
      /* hashes distintos — nunca duplicata exata/provável */
    }

    var statusA = getTxStatus(txA), statusB = getTxStatus(txB);
    if (statusA !== statusB && (statusA === "planned" || statusB === "planned")) {
      return { classification: "not_duplicate", confidence: "none" };
    }

    var planRefA = getInstallmentPlanRef(txA), planRefB = getInstallmentPlanRef(txB);
    var instCurA = getInstallmentCurrent(txA), instCurB = getInstallmentCurrent(txB);
    var instTotA = getInstallmentTotal(txA), instTotB = getInstallmentTotal(txB);
    var descBaseA = stripInstallmentFromDesc(txA.description);
    var descBaseB = stripInstallmentFromDesc(txB.description);
    var descFullA = normalizeDescription(txA.description);
    var descFullB = normalizeDescription(txB.description);
    var sameAmount = txA.amountCents === txB.amountCents;
    var nearAmount = amountsNear(txA.amountCents, txB.amountCents);
    var dateA = getTxDate(txA), dateB = getTxDate(txB);
    var postedA = getTxPostedDate(txA), postedB = getTxPostedDate(txB);
    var monthA = txA.competenceMonth || "", monthB = txB.competenceMonth || "";
    var typeA = txA.type || "", typeB = txB.type || "";
    var sameType = typeA && typeA === typeB;
    var sameFlow = txA.flow === txB.flow;
    var sameInvoice = (txA.invoiceId || "") === (txB.invoiceId || "");
    var sameInstNum = instCurA != null && instCurB != null && instCurA === instCurB;

    /* Parcelas relacionadas */
    if (planRefA && planRefB && planRefA === planRefB) {
      return { classification: "installment_related", confidence: "high" };
    }
    if (instCurA != null && instCurB != null && instCurA !== instCurB) {
      if (instTotA && instTotA === instTotB && sameAmount &&
          (descBaseA === descBaseB || descriptionsSimilar(descBaseA, descBaseB))) {
        return { classification: "installment_related", confidence: "high" };
      }
      if (instTotA && instTotA === instTotB && nearAmount &&
          descriptionsSimilar(descBaseA, descBaseB)) {
        return { classification: "installment_related", confidence: "medium" };
      }
    }
    if (/parcela?\s*\d+\s*[/\\]\s*\d+/i.test(txA.description || "") &&
        /parcela?\s*\d+\s*[/\\]\s*\d+/i.test(txB.description || "") &&
        instCurA !== instCurB && sameAmount &&
        descriptionsSimilar(descBaseA, descBaseB)) {
      return { classification: "installment_related", confidence: "high" };
    }

    /* Recorrência candidata — meses diferentes, mesmo valor e favorecido */
    if (monthA && monthB && monthA !== monthB && sameAmount && sameType &&
        RECURRING_TYPES.indexOf(typeA) >= 0 &&
        (descBaseA === descBaseB || descriptionsSimilar(descBaseA, descBaseB))) {
      var apart = monthsApart(monthA, monthB);
      if (apart === 1 || apart === 2) {
        return { classification: "recurring_candidate", confidence: "medium" };
      }
      return { classification: "recurring_candidate", confidence: "low" };
    }

    /* Compra repetida — mesmo mês, datas diferentes (informativa, não duplicidade) */
    if (monthA && monthA === monthB && dateA && dateB && dateA !== dateB &&
        sameType && PURCHASE_TYPES.indexOf(typeA) >= 0 && sameAmount &&
        (descBaseA === descBaseB || descriptionsSimilar(descBaseA, descBaseB)) &&
        !(hashA && hashB && hashA === hashB)) {
      if (instCurA != null && instCurB != null && instCurA !== instCurB &&
          instTotA && instTotA === instTotB) {
        return { classification: "installment_related", confidence: "high" };
      }
      if (planRefA && planRefB && planRefA === planRefB) {
        return { classification: "installment_related", confidence: "high" };
      }
      return { classification: "repeated_purchase", confidence: "low", informational: true };
    }

    /* Parcelas sequenciais em meses diferentes — mesmo cartão/valor/merchant */
    if (monthA && monthB && monthA !== monthB && sameType &&
        PURCHASE_TYPES.indexOf(typeA) >= 0 && nearAmount &&
        (descBaseA === descBaseB || descriptionsSimilar(descBaseA, descBaseB))) {
      var cardA = txA.cardId || txA.cardExternalRef || "";
      var cardB = txB.cardId || txB.cardExternalRef || "";
      if (planRefA && planRefB && planRefA === planRefB) {
        return { classification: "installment_related", confidence: "high" };
      }
      if (instCurA != null && instCurB != null && instCurA !== instCurB &&
          instTotA && instTotA === instTotB) {
        return { classification: "installment_related", confidence: "high" };
      }
      if (cardA && cardA === cardB &&
          (/parcela?\s*\d+\s*[/\\]\s*\d+/i.test(txA.description || "") ||
           /parcela?\s*\d+\s*[/\\]\s*\d+/i.test(txB.description || ""))) {
        return { classification: "installment_related", confidence: "high" };
      }
      var apart = monthsApart(monthA, monthB);
      if (cardA && cardA === cardB && apart === 1 && sameAmount &&
          descriptionsSimilar(descBaseA, descBaseB)) {
        return { classification: "installment_related", confidence: "medium" };
      }
    }

    /* Transferência semelhante */
    if (typeA === "transfer" && typeB === "transfer" && nearAmount &&
        dateA !== dateB && (descriptionsSimilar(descFullA, descFullB) || isPixLike(txA.description))) {
      return { classification: "similar_transfer", confidence: "medium" };
    }

    /* Duplicata provável — mesma data, valor, descrição, conta/cartão, type, flow, fatura */
    var invoiceA = txA.invoiceId || txA.invoiceExternalRef || "";
    var invoiceB = txB.invoiceId || txB.invoiceExternalRef || "";
    var invoicesMatch = invoiceA === invoiceB;
    if (invoiceA || invoiceB) { invoicesMatch = invoiceA && invoiceB && invoiceA === invoiceB; }

    if (sameType && sameFlow && sameAmount && !sameInstNum &&
        dateA && dateA === dateB && descFullA === descFullB &&
        sameAccountOrCard(txA, txB) && invoicesMatch &&
        !(hashA && hashB && hashA !== hashB) &&
        !(refA && refB && refA === refB)) {
      return { classification: "probable_duplicate", confidence: "high" };
    }

    /* Mesmo favorecido e valor em meses diferentes — não é duplicidade */
    if (monthA !== monthB && sameAmount &&
        descriptionsSimilar(descBaseA, descBaseB)) {
      return { classification: "not_duplicate", confidence: "none" };
    }

    /* Datas diferentes impedem duplicata provável genérica */
    if (dateA && dateB && dateA !== dateB) {
      return { classification: "not_duplicate", confidence: "none" };
    }
    if (postedA && postedB && postedA !== postedB) {
      return { classification: "not_duplicate", confidence: "none" };
    }

    return { classification: "not_duplicate", confidence: "none" };
  }

  function buildPairRecord(txA, txB, index1, index2, result) {
    return {
      classification:     result.classification,
      confidence:         result.confidence,
      confidenceLabel:    CONFIDENCE_LABELS[result.confidence] || result.confidence,
      classificationLabel:CLASSIFICATION_LABELS[result.classification] || result.classification,
      index1:             index1,
      index2:             index2,
      description1:       String(txA.description || "").substring(0, 80),
      description2:       String(txB.description || "").substring(0, 80),
      amountCents:        txB.amountCents,
      flow:               txB.flow,
      type:               txB.type,
      date1:              getTxDate(txA) || txA.competenceMonth || "",
      date2:              getTxDate(txB) || txB.competenceMonth || "",
      month1:             txA.competenceMonth || "",
      month2:             txB.competenceMonth || ""
    };
  }

  /**
   * Classifica todos os pares de transações em grupos de semelhança.
   * @param {object[]} transactions
   * @returns {object} grupos por classification
   */
  function classifySimilarityGroup(transactions) {
    var groups = {
      exact_duplicate:     [],
      probable_duplicate:  [],
      installment_related: [],
      recurring_candidate: [],
      repeated_purchase:   [],
      similar_transfer:    []
    };

    if (!Array.isArray(transactions) || transactions.length < 2) return groups;

    var seen = {};

    for (var i = 0; i < transactions.length; i++) {
      for (var j = i + 1; j < transactions.length; j++) {
        var txA = transactions[i], txB = transactions[j];
        if (!txA || !txB) continue;

        var pairKey = i + ":" + j;
        if (seen[pairKey]) continue;

        var result = classifyTransactionSimilarity(txA, txB);
        if (result.classification === "not_duplicate") continue;

        var bucket = groups[result.classification];
        if (!bucket) continue;

        bucket.push(buildPairRecord(txA, txB, i, j, result));
        seen[pairKey] = true;
      }
    }

    return groups;
  }

  function detectExactDuplicates(transactions) {
    if (!Array.isArray(transactions)) return [];
    var hashSeen = {}, refSeen = {}, duplicates = [], used = {};

    function addPair(i1, i2, tx, kind, key) {
      var pk = Math.min(i1, i2) + ":" + Math.max(i1, i2);
      if (used[pk]) return;
      used[pk] = true;
      duplicates.push(buildPairRecord(
        transactions[i1], tx, i1, i2,
        { classification: "exact_duplicate", confidence: "high" }
      ));
      duplicates[duplicates.length - 1].matchKind = kind;
      duplicates[duplicates.length - 1].matchKey  = String(key).substring(0, 24) + "…";
    }

    transactions.forEach(function (tx, i) {
      if (!tx || typeof tx !== "object") return;

      var hash = getTxRawHash(tx);
      if (hash) {
        if (hashSeen[hash] !== undefined) addPair(hashSeen[hash], i, tx, "rawHash", hash);
        else hashSeen[hash] = i;
      }

      var ref = getTxExternalRef(tx);
      if (ref) {
        if (refSeen[ref] !== undefined && refSeen[ref] !== i) addPair(refSeen[ref], i, tx, "externalRef", ref);
        else refSeen[ref] = i;
      }
    });

    return duplicates;
  }

  function detectProbableDuplicates(transactions) {
    return classifySimilarityGroup(transactions).probable_duplicate;
  }

  function detectInstallmentRelated(transactions) {
    return classifySimilarityGroup(transactions).installment_related;
  }

  function detectRecurringCandidates(transactions) {
    return classifySimilarityGroup(transactions).recurring_candidate;
  }

  function detectRepeatedPurchases(transactions) {
    return classifySimilarityGroup(transactions).repeated_purchase;
  }

  function detectSimilarTransfers(transactions) {
    return classifySimilarityGroup(transactions).similar_transfer;
  }

  /**
   * Relatório completo de semelhanças (uma passagem nos pares).
   * @param {object[]} transactions
   * @returns {object}
   */
  function buildSimilarityReport(transactions) {
    var exact = detectExactDuplicates(transactions);
    var groups = classifySimilarityGroup(transactions);

    /* Mesclar exact do classify (par a par) se detectExact não pegou */
    groups.exact_duplicate = exact;

    var classifiedCount =
      groups.installment_related.length +
      groups.recurring_candidate.length +
      groups.similar_transfer.length;

    var blockingSimilarityCount =
      groups.exact_duplicate.length +
      groups.probable_duplicate.length +
      classifiedCount;

    var informationalCount = groups.repeated_purchase.length;

    return {
      groups:              groups,
      exactDuplicates:     groups.exact_duplicate,
      probableDuplicates:  groups.probable_duplicate,
      installmentRelated:  groups.installment_related,
      recurringCandidates: groups.recurring_candidate,
      repeatedPurchases:   groups.repeated_purchase,
      similarTransfers:    groups.similar_transfer,
      classifiedCount:     classifiedCount,
      blockingSimilarityCount: blockingSimilarityCount,
      informationalCount:  informationalCount,
      similaritiesTotal:   blockingSimilarityCount + informationalCount,
      duplicateOnlyCount:
        groups.exact_duplicate.length +
        groups.probable_duplicate.length
    };
  }

  /* ── Fingerprint canônico e idempotência (Fase 0.3.4) ── */

  function buildCanonicalFingerprint(tx, context) {
    if (!tx || typeof tx !== "object") return "";
    var ctx = context || {};
    var invRef = tx.invoiceExternalRef || tx.invoiceId || "";
    var instCur = getInstallmentCurrent(tx);
    var instTot = getInstallmentTotal(tx);
    var hash = getTxRawHash(tx) || getTxTraceFingerprint(tx);
    var date = getTxDate(tx) || getTxPostedDate(tx) || "";
    return [
      String(ctx.institution  || ""),
      String(ctx.documentType || ""),
      String(tx.accountId || tx.cardId || ""),
      date,
      String(tx.amountCents || 0),
      String(tx.flow || ""),
      String(tx.type || ""),
      normalizeDescription(tx.description),
      String(invRef),
      instCur != null ? String(instCur) : "",
      instTot != null ? String(instTot) : "",
      hash
    ].join("|");
  }

  function classifyImportMatch(newItem, existingItem, context) {
    if (!newItem || !existingItem) return "new_item";

    var hashN = getTxRawHash(newItem), hashE = getTxRawHash(existingItem);
    if (hashN && hashE && hashN === hashE) return "exact_duplicate";

    var refN = getTxExternalRef(newItem), refE = getTxExternalRef(existingItem);
    if (refN && refE && refN === refE) return "exact_duplicate";

    if (existingItem.userEdited) {
      var fpN = buildCanonicalFingerprint(newItem, context);
      var fpE = buildCanonicalFingerprint(existingItem, context);
      if (fpN !== fpE) return "user_edited_conflict";
    }

    var sim = classifyTransactionSimilarity(newItem, existingItem);
    if (sim.classification === "exact_duplicate") return "exact_duplicate";
    if (sim.classification === "probable_duplicate") return "probable_duplicate";

    var fpMatch = buildCanonicalFingerprint(newItem, context) ===
                  buildCanonicalFingerprint(existingItem, context);
    if (fpMatch) return "already_imported";

    if (hashN && hashE && hashN !== hashE) return "changed_source";

    return "new_item";
  }

  /**
   * Simula reimportação do mesmo lote (idempotência local, sem persistência).
   * @param {object[]} transactions
   * @param {object} context
   * @returns {object}
   */
  function simulateReimport(transactions, context) {
    var secondPass = {
      new_item: 0, already_imported: 0, exact_duplicate: 0,
      probable_duplicate: 0, changed_source: 0,
      user_edited_conflict: 0, safe_update: 0, manual_review_required: 0
    };
    var details = [];
    var store = {};

    if (!Array.isArray(transactions)) {
      return { counts: secondPass, details: details, batchFingerprints: [] };
    }

    /* Primeira importação simulada — popula store (primeira ocorrência por fingerprint) */
    transactions.forEach(function (tx, i) {
      if (!tx) return;
      var fp = buildCanonicalFingerprint(tx, context);
      if (!store[fp]) store[fp] = { tx: tx, firstIndex: i };
    });

    /* Segunda importação do mesmo lote — teste de idempotência */
    transactions.forEach(function (tx, i) {
      if (!tx) return;
      var fp = buildCanonicalFingerprint(tx, context);
      var entry = store[fp];
      var match = "new_item";

      if (entry) {
        if (entry.firstIndex === i) {
          match = "already_imported";
        } else {
          match = classifyImportMatch(tx, entry.tx, context);
          if (match === "new_item") match = "already_imported";
        }
      }

      secondPass[match] = (secondPass[match] || 0) + 1;
      if (i < 6) {
        details.push({ index: i, match: match, fingerprint: fp.substring(0, 36) + "…" });
      }
    });

    var batchFingerprints = transactions.map(function (tx, i) {
      return { index: i, fingerprint: buildCanonicalFingerprint(tx, context) };
    });

    return { counts: secondPass, details: details, batchFingerprints: batchFingerprints };
  }

  function classifyInstallmentKind(item) {
    if (!item || typeof item !== "object") return "unknown";
    if (item.kind === "invoice_installment" || item.kind === "purchase_installment") return item.kind;
    if (item.subtype === "invoice_installment") return "invoice_installment";
    var desc = String(item.description || "").toLowerCase();
    if (/parcelamento\s*(de\s*)?fatura|parc\.?\s*fatura|fatura\s*parcel|rotativo|invoice_installment/i.test(desc)) {
      return "invoice_installment";
    }
    if (item.type === "credit_card_purchase" || item.cardId || item.installmentPlanId) {
      return "purchase_installment";
    }
    if (item.installment || /parcela?\s*\d+\s*[/\\]\s*\d+/i.test(desc)) {
      return "purchase_installment";
    }
    return "unknown";
  }

  function isInvoiceInstallmentTx(tx) {
    return classifyInstallmentKind(tx) === "invoice_installment";
  }

  /* ── Legado: fingerprint (mantido para compatibilidade) ── */

  function buildImportFingerprint(item, context) {
    if (!item || typeof item !== "object") return "";
    return [
      String(context.institution  || ""),
      String(context.documentType || ""),
      String(item.accountId || item.cardId || ""),
      String(getTxDate(item) || ""),
      String(item.amountCents || 0),
      String(item.flow || ""),
      normalizeDescription(item.description)
    ].join("|");
  }

  function detectIntraBatchDuplicates(items, context) {
    return detectProbableDuplicates(items);
  }

  /* ── Scanner de privacidade ── */

  var SENSITIVE_PATTERNS = [
    { name: "cpf",         regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, severity: "high",   label: "Possível CPF" },
    { name: "card_number", regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, severity: "high", label: "Possível número de cartão completo" },
    { name: "boleto",      regex: /\d{47,48}/, severity: "high", label: "Possível código de barras / linha digitável" },
    { name: "long_number", regex: /(?:^|[^\d])\d{12,}(?:[^\d]|$)/, severity: "medium", label: "Sequência numérica longa" }
  ];

  var SAFE_FIELD_NAMES = [
    "id", "rawHash", "externalRef", "canonicalFingerprint", "rawFingerprint",
    "accountId", "cardId", "invoiceId", "installmentPlanId",
    "counterpartAccountId", "_note"
  ];

  function isSafeFieldName(name) { return SAFE_FIELD_NAMES.indexOf(name) !== -1; }

  function isSafeValue(value) {
    var s = String(value);
    return s.startsWith("sha256:") || s.startsWith("acc_") || s.startsWith("card_") ||
      s.startsWith("inv_") || s.startsWith("plan_") || s.startsWith("rec_") ||
      s.startsWith("tx_") || s.startsWith("ext_") ||
      /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}$/.test(s);
  }

  function checkString(value, context, found) {
    if (!value || typeof value !== "string" || isSafeValue(value)) return;
    SENSITIVE_PATTERNS.forEach(function (pattern) {
      if (pattern.regex.test(value)) {
        found.push({
          type: pattern.name, severity: pattern.severity, label: pattern.label,
          context: context,
          snippet: value.substring(0, 40) + (value.length > 40 ? "…" : "")
        });
      }
    });
  }

  function scanEntity(obj, prefix, found) {
    if (!obj || typeof obj !== "object") return;
    Object.keys(obj).forEach(function (key) {
      if (isSafeFieldName(key)) return;
      if (typeof obj[key] === "string") checkString(obj[key], prefix + "." + key, found);
    });
  }

  function countBadRawHashes(payload) {
    var bad = 0;
    if (!payload || typeof payload !== "object") return bad;

    function checkEntity(entity) {
      if (!entity || typeof entity !== "object") return;
      if (entity.rawHash !== undefined && isNonEmptyString(entity.rawHash) &&
          !isValidSha256Hash(entity.rawHash)) {
        bad++;
      }
      if (entity.source && entity.source.rawHash !== undefined &&
          isNonEmptyString(entity.source.rawHash) &&
          !isValidSha256Hash(entity.source.rawHash)) {
        bad++;
      }
    }

    if (payload.source) {
      if (payload.source.rawHash !== undefined && isNonEmptyString(payload.source.rawHash) &&
          !isValidSha256Hash(payload.source.rawHash)) {
        bad++;
      }
    }
    (payload.transactions || []).forEach(checkEntity);
    (payload.recurringRules || []).forEach(checkEntity);
    return bad;
  }

  function scanForSensitiveData(payload) {
    var found = [];
    if (!payload || typeof payload !== "object") return found;
    if (payload.source) scanEntity(payload.source, "source", found);
    var SCAN_FIELDS = ["description", "category", "notes", "memo", "name"];
    function scanItems(arr, prefix) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function (item, i) {
        if (!item) return;
        SCAN_FIELDS.forEach(function (f) {
          if (item[f]) checkString(item[f], prefix + "[" + i + "]." + f, found);
        });
      });
    }
    scanItems(payload.transactions, "transactions");
    scanItems(payload.accounts, "accounts");
    scanItems(payload.cards, "cards");
    scanItems(payload.invoices, "invoices");
    scanItems(payload.recurringRules, "recurringRules");
    scanItems(payload.installmentPlans, "installmentPlans");
    return found;
  }

  CFM.validators = {
    normalizeDescription:        normalizeDescription,
    buildImportFingerprint:      buildImportFingerprint,
    buildCanonicalFingerprint:   buildCanonicalFingerprint,
    classifyImportMatch:         classifyImportMatch,
    simulateReimport:            simulateReimport,
    classifyInstallmentKind:     classifyInstallmentKind,
    isInvoiceInstallmentTx:      isInvoiceInstallmentTx,
    classifyTransactionSimilarity: classifyTransactionSimilarity,
    classifySimilarityGroup:     classifySimilarityGroup,
    buildSimilarityReport:       buildSimilarityReport,
    detectExactDuplicates:       detectExactDuplicates,
    detectProbableDuplicates:    detectProbableDuplicates,
    detectInstallmentRelated:    detectInstallmentRelated,
    detectRecurringCandidates:   detectRecurringCandidates,
    detectRepeatedPurchases:     detectRepeatedPurchases,
    detectSimilarTransfers:      detectSimilarTransfers,
    detectIntraBatchDuplicates:  detectIntraBatchDuplicates,
    scanForSensitiveData:        scanForSensitiveData,
    normalizeImportPayload:      normalizeImportPayload,
    normalizeRecurringRule:      normalizeRecurringRule,
    isValidSha256Hash:           isValidSha256Hash,
    getTxRawHash:                getTxRawHash,
    getTxTraceFingerprint:       getTxTraceFingerprint,
    hasTxTraceability:           hasTxTraceability,
    linkOrphanInstallmentTransactions: linkOrphanInstallmentTransactions,
    validateBrokenReferences:    validateBrokenReferences,
    isHistoricalPaymentForInvoice: isHistoricalPaymentForInvoice,
    parsePaymentCompetenceFromDescription: parsePaymentCompetenceFromDescription,
    countBadRawHashes:           countBadRawHashes,
    SHA256_REGEX:                SHA256_REGEX,
    CONFIDENCE_LABELS:             CONFIDENCE_LABELS,
    CLASSIFICATION_LABELS:         CLASSIFICATION_LABELS
  };
})(window.CFM);
