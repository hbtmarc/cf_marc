/**
 * Serviço de importação — pipeline completo local.
 * Firebase RTDB será integrado na Fase 1.
 * NUNCA registrar payload financeiro completo no console.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  /* ────────────────────────────────────────────────
   * 1. Leitura de arquivo
   * ──────────────────────────────────────────────── */

  function readJsonFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error("Nenhum arquivo fornecido.")); return; }
      if (!String(file.name || "").toLowerCase().endsWith(".json")) {
        reject(new Error("O arquivo deve ter extensão .json.")); return;
      }
      var reader = new FileReader();
      reader.onload  = function (e) { resolve(e.target.result); };
      reader.onerror = function ()  { reject(new Error("Erro ao ler o arquivo.")); };
      reader.readAsText(file, "UTF-8");
    });
  }

  /* ────────────────────────────────────────────────
   * 2. Parse
   * ──────────────────────────────────────────────── */

  function parseJsonText(text) {
    if (typeof text !== "string" || !text.trim())
      throw new Error("Conteúdo JSON vazio.");
    try { return JSON.parse(text); }
    catch (e) { throw new Error("JSON malformado: " + e.message); }
  }

  /* ────────────────────────────────────────────────
   * 3. Validação de schema
   * ──────────────────────────────────────────────── */

  function validateImportPayload(payload) {
    if (!CFM.importSchema) throw new Error("Schema de importação não carregado.");
    return CFM.importSchema.validate(payload);
  }

  /* ────────────────────────────────────────────────
   * 4. Status geral
   * ──────────────────────────────────────────────── */

  function determineOverallStatus(itemErrors, exactDuplicates, privacyAlerts,
                                   criticalReview, importantReview) {
    var highPrivacy = privacyAlerts.filter(function (a) {
      return a.severity === "high";
    }).length;
    if (highPrivacy > 0 || itemErrors.length > 0) return "has_blockers";
    if (exactDuplicates.length > 0 || criticalReview > 0 || importantReview > 0)
      return "has_pending";
    return "ready";
  }

  var IMPORT_BATCH_ID = null;

  function nextImportBatchId() {
    return "local-" + Date.now();
  }

  function buildImportMetadata(entity, batchId) {
    var now = new Date().toISOString();
    var imported = {};
    ["description", "amountCents", "flow", "type", "competenceMonth", "date",
     "category", "accountId", "cardId"].forEach(function (f) {
      if (entity && entity[f] !== undefined) imported[f] = entity[f];
    });
    return {
      importedFields:   imported,
      userFields:       {},
      userEdited:       false,
      lockedFields:     [],
      lastImportBatchId: batchId || IMPORT_BATCH_ID,
      firstImportedAt:  now,
      lastImportedAt:   now
    };
  }

  function isIfoodDelivery(tx) {
    var crs = CFM.classificationRulesService;
    if (crs && crs.isIfoodDelivery) return crs.isIfoodDelivery(tx);
    var d = String((tx && tx.description) || "");
    return /^ifd/i.test(d) || /ifood/i.test(d);
  }

  function isInvoiceInstallmentReview(tx, reason, val) {
    if (val && val.isInvoiceInstallmentTx && val.isInvoiceInstallmentTx(tx)) return true;
    var text = ((reason || "") + " " + (tx && tx.description || "")).toLowerCase();
    return /parcelamento\s*(de\s*)?fatura|parc\.?\s*fatura|invoice_installment/i.test(text) ||
      (tx && tx.subtype === "invoice_installment");
  }

  function isPurchaseInstallmentComplete(tx) {
    if (!tx) return false;
    var hasPlan = !!(tx.installmentPlanId || tx.installmentPlanExternalRef);
    var hasParcel = !!(tx.installment && tx.installment.current) ||
      /parcela?\s*\d+\s*[/\\]\s*\d+/i.test(tx.description || "");
    return hasPlan && hasParcel;
  }

  function getRuleForTx(ruleApplications, index) {
    if (!ruleApplications || !ruleApplications.length) return null;
    for (var i = 0; i < ruleApplications.length; i++) {
      if (ruleApplications[i].transactionIndex === index) return ruleApplications[i];
    }
    return null;
  }

  function shouldRequireManualReview(item, tx, val, ruleApp) {
    if (item.entityType === "invoice") {
      return !!item.isStub;
    }
    if (!tx) return true;

    if (ruleApp && ruleApp.matched && ruleApp.autoResolve) return false;

    if (ruleApp && ruleApp.matched && !ruleApp.autoResolve) {
      if (ruleApp.reviewPriority === "none") return false;
      if (ruleApp.reviewPriority === "low") return true;
    }

    if (isInvoiceInstallmentReview(tx, item.reason, val)) return false;

    if (isPurchaseInstallmentComplete(tx) &&
        /parcela|parcelamento|installment/i.test(item.reason || "")) {
      return false;
    }

    if (isIfoodDelivery(tx) && tx.flow && tx.amountCents && tx.competenceMonth) {
      if (!/pix|pessoa|transferência|ambígu|receita|titularidade/i.test(item.reason || "")) return false;
    }

    if (/lowify/i.test((tx.description || "") + (item.reason || ""))) return false;

    if (/financiamento|juros|iof|encargo|rotativo/i.test(item.reason || "") &&
        ruleApp && ruleApp.matched && ruleApp.autoResolve) {
      return false;
    }

    if ((tx.type === "credit_card_purchase" || tx.type === "expense") &&
        tx.flow && tx.amountCents && tx.competenceMonth &&
        /categoria/i.test(item.reason || "") &&
        !/pix|pessoa|ambígu|transferência/i.test(item.reason || "")) {
      return false;
    }

    var crs = CFM.classificationRulesService;
    if (crs && crs.isPixSentToPerson && crs.isPixSentToPerson(tx)) {
      if (!(crs.isOwnAccountHint && crs.isOwnAccountHint(tx))) return false;
    }

    if (tx.type === "transfer" && /pix/i.test(tx.description || "") &&
        !/pessoa\s*f[ií]sica|cpf/i.test(item.reason || "")) {
      return false;
    }

    if (/pix/i.test(item.reason || "") && /pessoa/i.test(item.reason || "") &&
        /enviad|para\s/i.test(item.reason || "") &&
        tx.flow === "out") {
      return false;
    }

    if (/pix/i.test(item.reason || "") && /pessoa/i.test(item.reason || "") &&
        /receb|de\s/i.test(item.reason || "") && tx.flow === "in") {
      return true;
    }

    if (/pix/i.test(item.reason || "") && /pessoa/i.test(item.reason || "") &&
        tx.flow === "out") {
      return false;
    }

    if (tx.type === "income" && /ambígu|não é receita|verificar/i.test(item.reason || "") &&
        !/ted/i.test(item.reason || "")) {
      if (ruleApp && ruleApp.matched && ruleApp.autoResolve) return false;
      return true;
    }
    if (/ted|entrada ambígu|transferência própria|entre contas/i.test(item.reason || "")) {
      if (crs && crs.isTedReceived && crs.isTedReceived(tx) && ruleApp && ruleApp.autoResolve) {
        return false;
      }
      return true;
    }
    if (/pix.*crédito|crédito.*pix|cartão.*pix/i.test(item.reason || "")) return true;

    return !!(tx.review && tx.review.required);
  }

  function classifyReviewPriority(item, tx, val, ruleApp) {
    if (ruleApp && ruleApp.matched) {
      if (ruleApp.reviewPriority === "critical") return "critical";
      if (ruleApp.reviewPriority === "important") return "important";
      if (ruleApp.reviewPriority === "low") return "low";
      if (ruleApp.reviewPriority === "none" && ruleApp.autoResolve) return "low";
    }
    if (/inválido|referência quebrada|privacidade/i.test(item.reason || "")) return "critical";
    if (item.entityType === "invoice" && item.isStub) return "important";
    if (!shouldRequireManualReview(item, tx, val, ruleApp)) return "low";

    var cat = item.reviewCategoryId || inferReviewCategory(item).id;
    if (cat === "pix_person" && tx && tx.flow === "out") return "low";
    if (cat === "pix_person" || cat === "own_accounts" ||
        cat === "income_uncertain" || cat === "card_pix_credit") {
      return "important";
    }
    if (cat === "category_uncertain" || cat === "recurring_candidate") return "low";
    return "important";
  }

  function buildAutoResolution(tx, item, val, ruleApp) {
    if (ruleApp && ruleApp.matched) {
      var note = (ruleApp.classification && ruleApp.classification.note) || ruleApp.explanation;
      return "Regra pessoal: " + (note || ruleApp.ruleLabel) + ".";
    }
    if (isInvoiceInstallmentReview(tx, item.reason, val)) {
      return "Parcelamento de fatura identificado — obrigação financeira normal.";
    }
    if (isPurchaseInstallmentComplete(tx)) {
      return "Parcelamento de compra vinculado — classificado automaticamente.";
    }
    if (isIfoodDelivery(tx)) {
      return "Delivery identificado — sugerida categoria alimentação.";
    }
    if (tx && tx.type === "credit_card_purchase" && tx.flow && tx.amountCents) {
      return "Compra em estabelecimento — campos completos.";
    }
    return "Classificado automaticamente com regras seguras.";
  }

  function buildUserSafeImportDecision(item) {
    return {
      canAutoApply:   false,
      requiresReview: true,
      preserveUserFields: ["category", "type", "competenceMonth", "notes", "recurringRuleId"],
      message: "Edições manuais futuras não serão sobrescritas sem revisão."
    };
  }

  function reduceManualReview(txReviewItems, invReviewItems, transactions, val, ruleApplications) {
    var manual = [], suggestions = [], autoResolved = [];
    var ruleResolved = [];

    txReviewItems.forEach(function (item) {
      var tx = transactions[item.index];
      var ruleApp = getRuleForTx(ruleApplications, item.index);
      item.importMetadata = buildImportMetadata(tx, IMPORT_BATCH_ID);
      item.importDecision = buildUserSafeImportDecision(item);

      if (ruleApp && ruleApp.matched) {
        item.ruleMatch = {
          ruleId: ruleApp.ruleId,
          ruleLabel: ruleApp.ruleLabel,
          score: ruleApp.score,
          source: ruleApp.ruleSource
        };
      }

      if (!shouldRequireManualReview(item, tx, val, ruleApp)) {
        var resolved = Object.assign({}, item, {
          autoResolution: buildAutoResolution(tx, item, val, ruleApp),
          reviewPriority: "low"
        });
        autoResolved.push(resolved);
        if (ruleApp && ruleApp.matched && ruleApp.autoResolve) {
          ruleResolved.push(resolved);
        }
        return;
      }

      var enriched = enrichReviewItem(item, false);
      enriched.reviewPriority = classifyReviewPriority(enriched, tx, val, ruleApp);
      enriched.rawTransaction = undefined;

      if (val && val.classifyInstallmentKind) {
        enriched.installmentKind = val.classifyInstallmentKind(tx);
      }
      if (ruleApp && ruleApp.matched) {
        enriched.suggestedCategory = ruleApp.suggestedCategory;
        enriched.ruleMatch = item.ruleMatch;
      }

      if (enriched.reviewPriority === "low") {
        suggestions.push(enriched);
      } else {
        manual.push(enriched);
      }
    });

    invReviewItems.forEach(function (item) {
      item.importMetadata = buildImportMetadata({ description: item.description }, IMPORT_BATCH_ID);
      var enriched = enrichReviewItem(item, !!item.isStub);
      enriched.reviewPriority = item.isStub ? "important" : classifyReviewPriority(item, null, val, null);
      if (enriched.reviewPriority === "low") suggestions.push(enriched);
      else manual.push(enriched);
    });

    return {
      manualReview: manual,
      reviewSuggestions: suggestions,
      autoResolved: autoResolved,
      ruleResolved: ruleResolved
    };
  }

  function buildReviewPriorityGroups(manual, suggestions) {
    var groups = {
      critical:  { id: "critical",  label: "Revisão crítica",  items: [] },
      important: { id: "important", label: "Revisão importante", items: [] },
      low:       { id: "low",       label: "Sugestões",          items: [] }
    };

    manual.forEach(function (item) {
      var p = item.reviewPriority === "critical" ? "critical" : "important";
      groups[p].items.push(item);
    });
    suggestions.forEach(function (item) {
      groups.low.items.push(item);
    });

    return [groups.critical, groups.important, groups.low].filter(function (g) {
      return g.items.length > 0;
    });
  }

  function detectInvoiceInstallments(transactions, installmentPlans, val) {
    var invoiceTxCount = 0;
    var purchaseTxCount = 0;

    if (Array.isArray(transactions)) {
      transactions.forEach(function (tx) {
        if (!tx || !val.classifyInstallmentKind) return;
        var kind = val.classifyInstallmentKind(tx);
        if (kind === "invoice_installment") invoiceTxCount++;
        if (kind === "purchase_installment") purchaseTxCount++;
      });
    }

    var plans = (installmentPlans || []).map(function (plan) {
      if (!plan) return null;
      var kind = val.classifyInstallmentKind ? val.classifyInstallmentKind(plan) : "unknown";
      if (plan.kind) kind = plan.kind;
      return { id: plan.id, kind: kind, description: String(plan.description || "").substring(0, 60) };
    }).filter(Boolean);

    return {
      invoiceTransactionCount: invoiceTxCount,
      purchaseTransactionCount: purchaseTxCount,
      plans: plans
    };
  }

  /* ── Revisão: categorias e sugestões ── */

  var REVIEW_CATEGORY_RULES = [
    { id: "pix_person",       label: "Transferências/Pix para pessoa física", keywords: ["pix", "pessoa física", "cpf", "enviado para", "transferência para"] },
    { id: "own_accounts",     label: "Possível transferência entre contas próprias", keywords: ["conta própria", "entre contas", "mesma titularidade", "transferência interna", "poupança"] },
    { id: "category_uncertain", label: "Categoria incerta", keywords: ["categoria", "classificar", "incerta", "indefinida"] },
    { id: "installment_iof",  label: "Parcelamento/juros/IOF", keywords: ["parcela", "juros", "iof", "encargo", "rotativo"] },
    { id: "invoice_stub",     label: "Fatura stub", keywords: ["stub", "fatura provisória", "fatura estimada"] },
    { id: "invoice_ambiguous", label: "Fatura com campo ambíguo", keywords: ["fatura", "ambíguo", "campo", "conciliação"] },
    { id: "recurring_candidate", label: "Recorrência candidata", keywords: ["recorrente", "recorrência", "mensal", "assinatura"] },
    { id: "income_uncertain", label: "Entrada que pode não ser receita", keywords: ["receita", "entrada", "não é receita", "estorno", "devolução"] },
    { id: "card_pix_credit",  label: "Cartão/Pix no crédito", keywords: ["cartão", "crédito", "pix no crédito", "credit_card"] },
    { id: "other",            label: "Outros itens para confirmar", keywords: [] }
  ];

  var SUGGESTED_ACTION_LABELS = {
    mark_as_transfer:        "Marcar como transferência",
    mark_as_expense:         "Marcar como despesa",
    mark_as_income:          "Marcar como receita",
    mark_as_recurring:       "Marcar como despesa recorrente",
    link_to_installment_plan:"Vincular a um parcelamento",
    confirm_category:        "Confirmar categoria",
    keep_pending:            "Manter pendente de confirmação"
  };

  function inferReviewCategory(item) {
    var text = (
      (item.reason || "") + " " +
      (item.description || "") + " " +
      (item.type || "") + " " +
      (item.entityType || "")
    ).toLowerCase();

    if (item.entityType === "invoice" && item.isStub) {
      return { id: "invoice_stub", label: "Fatura stub" };
    }

    for (var i = 0; i < REVIEW_CATEGORY_RULES.length - 1; i++) {
      var rule = REVIEW_CATEGORY_RULES[i];
      for (var k = 0; k < rule.keywords.length; k++) {
        if (text.indexOf(rule.keywords[k]) >= 0) {
          return { id: rule.id, label: rule.label };
        }
      }
    }

    if (item.type === "transfer" && /pix/i.test(item.description || "")) {
      return { id: "pix_person", label: "Transferências/Pix para pessoa física" };
    }
    if (item.type === "transfer") {
      return { id: "own_accounts", label: "Possível transferência entre contas próprias" };
    }
    if (item.type === "income") {
      return { id: "income_uncertain", label: "Entrada que pode não ser receita" };
    }
    if (item.type === "credit_card_purchase") {
      return { id: "card_pix_credit", label: "Cartão/Pix no crédito" };
    }

    return { id: "other", label: "Outros itens para confirmar" };
  }

  function buildSuggestedAction(reviewItem) {
    var catId = reviewItem.reviewCategoryId || "other";
    var type  = reviewItem.type || "";
    var action = "keep_pending";

    if (catId === "pix_person" || (type === "transfer" && /pix/i.test(reviewItem.description || ""))) {
      action = "mark_as_transfer";
    } else if (catId === "own_accounts" || type === "transfer") {
      action = "mark_as_transfer";
    } else if (catId === "recurring_candidate") {
      action = "mark_as_recurring";
    } else if (catId === "installment_iof") {
      action = "link_to_installment_plan";
    } else if (catId === "category_uncertain") {
      action = "confirm_category";
    } else if (catId === "income_uncertain" || type === "income") {
      action = "mark_as_income";
    } else if (type === "expense" || type === "credit_card_purchase" || type === "fee") {
      action = "mark_as_expense";
    } else if (reviewItem.entityType === "invoice") {
      action = "keep_pending";
    }

    if (reviewItem.futureAction && String(reviewItem.futureAction).trim()) {
      return {
        action: action,
        label:  String(reviewItem.futureAction),
        fromSource: true
      };
    }

    return {
      action: action,
      label:  SUGGESTED_ACTION_LABELS[action] || SUGGESTED_ACTION_LABELS.keep_pending,
      fromSource: false
    };
  }

  function enrichReviewItem(item, invoiceStub) {
    var cat = inferReviewCategory(Object.assign({}, item, { isStub: invoiceStub }));
    var enriched = Object.assign({}, item, {
      reviewCategoryId:    cat.id,
      reviewCategoryLabel: cat.label
    });
    var suggestion = buildSuggestedAction(enriched);
    enriched.suggestedAction = suggestion.action;
    enriched.suggestedActionLabel = suggestion.label;
    return enriched;
  }

  function buildReviewGroups(reviewItems) {
    var map = {};
    (reviewItems || []).forEach(function (item) {
      var isStub = item.entityType === "invoice" && !!item.isStub;
      var enriched = enrichReviewItem(item, isStub);
      var key = enriched.reviewCategoryId;
      if (!map[key]) {
        map[key] = { id: key, label: enriched.reviewCategoryLabel, items: [] };
      }
      map[key].items.push(enriched);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function filterFinancingSimilarities(pairs, transactions, installmentPlans, ruleApplications, val) {
    if (!pairs || !pairs.length) return [];
    var planByRef = {};
    (installmentPlans || []).forEach(function (p) {
      if (!p) return;
      if (p.id) planByRef[p.id] = p;
      if (p.externalRef) planByRef[p.externalRef] = p;
    });
    var appsByIndex = {};
    (ruleApplications || []).forEach(function (a) {
      appsByIndex[a.transactionIndex] = a;
    });

    function txPlanRef(tx) {
      if (!tx) return "";
      return String(tx.installmentPlanExternalRef || tx.installmentPlanId || "");
    }

    function isFinancingTx(tx, idx) {
      if (!tx) return false;
      var app = appsByIndex[idx];
      if (app && (app.isFinancing ||
          (app.classification && app.classification.installmentKind === "financing"))) {
        return true;
      }
      if (tx.installmentKind === "financing" || tx.subtype === "financing") return true;
      var pref = txPlanRef(tx);
      if (pref && planByRef[pref] && planByRef[pref].kind === "financing") return true;
      if (val && val.classifyInstallmentKind && val.classifyInstallmentKind(tx) === "financing") {
        return true;
      }
      var desc = String(tx.description || "").toLowerCase();
      if (/banco\s*pan|auto\s*pan/i.test(desc)) return true;
      return false;
    }

    return pairs.filter(function (pair) {
      var indices = [pair.index1, pair.index2, pair.indexA, pair.indexB];
      for (var i = 0; i < indices.length; i++) {
        var idx = indices[i];
        if (idx == null) continue;
        if (isFinancingTx(transactions[idx], idx)) return false;
      }
      return true;
    });
  }

  function rebuildSimilarityCounts(similarityReport, groups) {
    var g = groups || similarityReport.groups || {};
    var classified =
      (g.probable_duplicate || []).length +
      (g.installment_related || []).length +
      (g.recurring_candidate || []).length +
      (g.similar_transfer || []).length;
    similarityReport.classifiedCount = classified;
    similarityReport.similaritiesTotal =
      (g.exact_duplicate || []).length + classified +
      (g.repeated_purchase || []).length;
    similarityReport.duplicateOnlyCount =
      (g.exact_duplicate || []).length + (g.probable_duplicate || []).length;
    return similarityReport;
  }

  function filterResolvedRecurringCandidates(candidates, ruleApplications, transactions) {
    if (!candidates || !candidates.length) return [];
    var byIndex = {};
    (ruleApplications || []).forEach(function (app) {
      byIndex[app.transactionIndex] = app;
    });

    return candidates.filter(function (pair) {
      var indices = [pair.indexA, pair.indexB, pair.index1, pair.index2];
      for (var i = 0; i < indices.length; i++) {
        var idx = indices[i];
        if (idx == null) continue;
        var app = byIndex[idx];
        if (app && app.matched && (app.isRecurring || app.isFinancing)) return false;
        var tx = transactions[idx];
        if (!tx) continue;
        var desc = String(tx.description || "").toLowerCase();
        if (/bmi\s*servi/i.test(desc)) return false;
        if (/protev/i.test(desc)) return false;
        if (/banco\s*pan|auto\s*pan/i.test(desc)) return false;
      }
      return true;
    });
  }

  function formatSimilarityPairs(pairs, fcents) {
    return (pairs || []).map(function (p) {
      return Object.assign({}, p, {
        amountFmt: fcents(p.amountCents || 0)
      });
    });
  }

  /* ────────────────────────────────────────────────
   * 5. Relatório completo
   * ──────────────────────────────────────────────── */

  function buildImportReport(fileName, fileSize, payload, validation) {
    IMPORT_BATCH_ID = nextImportBatchId();

    var fmt  = CFM.formatters  || {};
    var val  = CFM.validators  || {};

    if (val.normalizeImportPayload) payload = val.normalizeImportPayload(payload);

    var fcents = fmt.formatCurrencyFromCents || function (c) { return String(c) + " cts"; };
    var fsize  = fmt.formatFileSize          || function (b) { return b + " B"; };
    var fdate  = fmt.formatDate              || function (d) { return d; };
    var fmonth = fmt.formatMonth             || function (m) { return m; };

    /* ── Arrays base ── */
    var transactions     = Array.isArray(payload.transactions)     ? payload.transactions     : [];
    var accounts         = Array.isArray(payload.accounts)         ? payload.accounts         : [];
    var cards            = Array.isArray(payload.cards)            ? payload.cards            : [];
    var invoices         = Array.isArray(payload.invoices)         ? payload.invoices         : [];
    var installmentPlans = Array.isArray(payload.installmentPlans) ? payload.installmentPlans : [];
    var recurringRules   = Array.isArray(payload.recurringRules)   ? payload.recurringRules   : [];

    if (val.linkOrphanInstallmentTransactions) {
      val.linkOrphanInstallmentTransactions(transactions, installmentPlans);
    }

    var src = payload.source || {};
    var context = {
      institution:  src.institution  || "",
      documentType: src.documentType || ""
    };

    /* ── Mapas de lookup ── */
    var css          = CFM.cardSnapshotService || {};
    var cardRegistry = css.buildCardRegistry ? css.buildCardRegistry(cards) : {
      cards: cards, cardsById: {}, refToId: {},
      resolveCardId: function (r) { return r || ""; }
    };

    var brokenReferences = val.validateBrokenReferences
      ? val.validateBrokenReferences(payload, { resolveCardId: cardRegistry.resolveCardId }) : [];
    if (brokenReferences.length && validation && Array.isArray(validation.warnings)) {
      brokenReferences.forEach(function (msg) { validation.warnings.push(msg); });
    }

    var cardMap    = {};
    var accountMap = {};
    var invoiceMap = {};

    cardRegistry.cards.forEach(function (c) {
      if (c && c.id) cardMap[c.id] = c;
    });
    cards.forEach(function (c) {
      if (c && c.id && !cardMap[c.id]) cardMap[c.id] = c;
    });
    accounts.forEach(function (a) {
      if (a && a.id) accountMap[a.id] = a;
    });
    invoices.forEach(function (inv) {
      if (inv && inv.id) invoiceMap[inv.id] = inv;
      if (inv && inv.externalRef) invoiceMap[inv.externalRef] = inv;
      if (inv && inv.invoiceExternalRef) invoiceMap[inv.invoiceExternalRef] = inv;
    });

    /* ── Itens inválidos por índice ── */
    var invalidIndexes = {};
    validation.itemErrors.forEach(function (e) { invalidIndexes[e.index] = true; });

    /* ── Pendentes de revisão (transações) ── */
    var txReviewItems = [];
    transactions.forEach(function (tx, i) {
      if (tx && tx.review && tx.review.required) {
        txReviewItems.push({
          entityType:   "transaction",
          index:        i,
          description:  String(tx.description || "").substring(0, 80),
          amountCents:  tx.amountCents || 0,
          amountFmt:    fcents(tx.amountCents || 0),
          flow:         tx.flow    || "",
          type:         tx.type    || "",
          date:         tx.date    || tx.competenceMonth || "",
          competence:   tx.competenceMonth || "",
          reason:       (tx.review && tx.review.reason) || "revisão solicitada",
          futureAction: (tx.review && tx.review.suggestedAction) || ""
        });
      }
    });

    /* ── Pendentes de revisão (faturas) ── */
    var invReviewItems = [];
    invoices.forEach(function (inv, i) {
      if (inv && inv.review && inv.review.required) {
        var invCardRef = inv.cardId || inv.cardExternalRef || "";
        var invCardResolved = cardRegistry.resolveCardId(invCardRef);
        invReviewItems.push({
          entityType:  "invoice",
          index:       i,
          description: "Fatura " + (inv.competenceMonth || "") + " — " +
                       ((cardMap[invCardResolved] || {}).name || invCardRef || ""),
          amountFmt:   fcents(inv.totalCents || 0),
          reason:      (inv.review && inv.review.reason) || "revisão solicitada",
          futureAction: (inv.review && inv.review.suggestedAction) || "",
          isStub:      !!inv.isStub
        });
      }
    });

    var crs = CFM.classificationRulesService || {};
    var ruleApplications = crs.applyRulesToTransactions
      ? crs.applyRulesToTransactions(transactions, context)
      : [];

    var reducedReview = reduceManualReview(
      txReviewItems, invReviewItems, transactions, val, ruleApplications
    );
    var allPendingReview = reducedReview.manualReview.concat(reducedReview.reviewSuggestions);
    var reviewPriorityGroups = buildReviewPriorityGroups(
      reducedReview.manualReview,
      reducedReview.reviewSuggestions
    );
    var reviewGroups = buildReviewGroups(allPendingReview);

    var criticalReviewCount = reducedReview.manualReview.filter(function (i) {
      return i.reviewPriority === "critical";
    }).length;
    var importantReviewCount = reducedReview.manualReview.filter(function (i) {
      return i.reviewPriority === "important";
    }).length;

    var reimportSimulation = val.simulateReimport
      ? val.simulateReimport(transactions, context)
      : { counts: {}, details: [], batchFingerprints: [] };

    var invoiceInstallmentInfo = detectInvoiceInstallments(transactions, installmentPlans, val);

    /* ── Semelhanças classificadas ── */
    var similarityReport = val.buildSimilarityReport
      ? val.buildSimilarityReport(transactions)
      : { groups: {}, exactDuplicates: [], probableDuplicates: [], classifiedCount: 0, similaritiesTotal: 0, duplicateOnlyCount: 0 };

    var simGroups = similarityReport.groups || {};
    var filteredRecurringRaw = filterResolvedRecurringCandidates(
      similarityReport.recurringCandidates || [],
      ruleApplications,
      transactions
    );
    similarityReport.recurringCandidates = filteredRecurringRaw;
    if (simGroups.recurring_candidate) {
      simGroups.recurring_candidate = filteredRecurringRaw;
    }

    var simFilterCtx = [transactions, installmentPlans, ruleApplications, val];
    Object.keys(simGroups).forEach(function (key) {
      simGroups[key] = filterFinancingSimilarities(simGroups[key], simFilterCtx[0], simFilterCtx[1], simFilterCtx[2], simFilterCtx[3]);
    });
    similarityReport.exactDuplicates = filterFinancingSimilarities(
      similarityReport.exactDuplicates, transactions, installmentPlans, ruleApplications, val);
    similarityReport.probableDuplicates = filterFinancingSimilarities(
      similarityReport.probableDuplicates, transactions, installmentPlans, ruleApplications, val);
    similarityReport.installmentRelated = filterFinancingSimilarities(
      similarityReport.installmentRelated, transactions, installmentPlans, ruleApplications, val);
    similarityReport.similarTransfers = filterFinancingSimilarities(
      similarityReport.similarTransfers, transactions, installmentPlans, ruleApplications, val);
    rebuildSimilarityCounts(similarityReport, simGroups);

    var exactDuplicates     = formatSimilarityPairs(similarityReport.exactDuplicates, fcents);
    var probableDuplicates  = formatSimilarityPairs(similarityReport.probableDuplicates, fcents);
    var installmentRelated  = formatSimilarityPairs(similarityReport.installmentRelated, fcents);
    var recurringCandidates = formatSimilarityPairs(filteredRecurringRaw, fcents);
    var repeatedPurchases   = formatSimilarityPairs(
      filterFinancingSimilarities(similarityReport.repeatedPurchases, transactions, installmentPlans, ruleApplications, val),
      fcents);
    var similarTransfers    = formatSimilarityPairs(similarityReport.similarTransfers, fcents);

    var recognizedRecurrencesRaw = crs.buildRecognizedRecurrences
      ? crs.buildRecognizedRecurrences(ruleApplications, recurringRules, filteredRecurringRaw)
      : [];
    var recognizedRecurrences = crs.dedupeRecognizedRecurrences
      ? crs.dedupeRecognizedRecurrences(recognizedRecurrencesRaw) : recognizedRecurrencesRaw;

    recognizedRecurrences.forEach(function (r) {
      if (r.source !== "imported_json") return;
      var orig = recurringRules.filter(function (x) { return x && x.id === r.id; })[0];
      if (!orig) return;
      r.accountName = (accountMap[orig.accountId] || {}).name || "";
      r.cardName    = (cardMap[orig.cardId] || {}).name || "";
      r.dayOfMonth  = orig.dayOfMonth || null;
      if (orig.expectedAmountCents) r.expectedAmountCents = orig.expectedAmountCents;
      else if (orig.amountCents) r.expectedAmountCents = orig.amountCents;
    });

    var ruleAppByIndex = {};
    ruleApplications.forEach(function (ra) {
      ruleAppByIndex[ra.transactionIndex] = ra;
    });

    var effectiveReviewTxSet = {};
    reducedReview.manualReview.forEach(function (item) {
      if (item.entityType === "transaction") {
        effectiveReviewTxSet[item.index] = item.reviewPriority || "important";
      }
    });
    reducedReview.reviewSuggestions.forEach(function (item) {
      if (item.entityType === "transaction") {
        effectiveReviewTxSet[item.index] = "low";
      }
    });
    var originalReviewTxCount = txReviewItems.length;
    var effectiveReviewTxCount = Object.keys(effectiveReviewTxSet).length;
    var invoiceReviewCount = invReviewItems.filter(function (i) { return !i.isStub; }).length;
    var invoiceStubReviewCount = invReviewItems.filter(function (i) { return i.isStub; }).length;
    var suggestionCount = reducedReview.reviewSuggestions.length;
    var confirmReviewCount = reducedReview.manualReview.length;
    var reviewReducedByRules = Math.max(0, originalReviewTxCount - effectiveReviewTxCount);
    var badRawHashCount = val.countBadRawHashes ? val.countBadRawHashes(payload) : 0;

    /* ── Privacidade ── */
    var privacyAlerts = val.scanForSensitiveData
      ? val.scanForSensitiveData(payload)
      : [];

    /* ── Status geral ── */
    var overallStatus = determineOverallStatus(
      validation.itemErrors,
      exactDuplicates,
      privacyAlerts,
      criticalReviewCount,
      importantReviewCount
    );

    /* ── Contadores finais ── */
    var validCount   = transactions.filter(function (_, i) { return !invalidIndexes[i]; }).length;
    var invalidCount = Object.keys(invalidIndexes).length;

    /* ── Estado geral do relatório ── */
    var state;
    if (transactions.length === 0 && accounts.length === 0 && cards.length === 0) {
      state = "empty";
    } else if (overallStatus === "has_blockers") {
      state = "warning";
    } else if (overallStatus === "has_pending") {
      state = "warning";
    } else {
      state = "success";
    }

    /* ── allTransactions (sanitizado para exibição) ── */
    var allTransactions = transactions.map(function (tx, i) {
      if (!tx || typeof tx !== "object") return null;
      var rawCardRef = tx.cardId || tx.cardExternalRef || "";
      var resolvedCardId = cardRegistry.resolveCardId(rawCardRef, tx.description);
      var card    = cardMap[resolvedCardId] || cardMap[rawCardRef] || {};
      var account = accountMap[tx.accountId] || {};
      var ruleApp = ruleAppByIndex[i] || null;
      var hasOriginalReview = !!(tx.review && tx.review.required);
      var needsEffectiveReview = !!effectiveReviewTxSet[i];
      return {
        index:            i,
        description:      String(tx.description || "—").substring(0, 100),
        amountFmt:        fcents(tx.amountCents || 0),
        amountCents:      tx.amountCents || 0,
        flow:             tx.flow  || "",
        type:             tx.type  || "",
        subtype:          tx.subtype || (val.classifyInstallmentKind ? val.classifyInstallmentKind(tx) : ""),
        date:             tx.date  || "",
        competenceMonth:  tx.competenceMonth || "",
        accountId:        tx.accountId  || "",
        accountName:      account.name  || tx.accountId  || "",
        cardId:           resolvedCardId || rawCardRef || "",
        cardExternalRef:  tx.cardExternalRef || "",
        cardName:         card.name     || rawCardRef || "",
        cardLastFour:     css.formatLastFourDisplay
          ? (css.formatLastFourDisplay(card.lastFour || card.last4) || "")
          : (card.lastFour || ""),
        invoiceId:        tx.invoiceId || tx.invoiceExternalRef || "",
        installmentPlanId:tx.installmentPlanId || tx.installmentPlanExternalRef || "",
        category:         tx.category   || "",
        suggestedCategory: ruleApp ? ruleApp.suggestedCategory : "",
        ruleMatch:        ruleApp ? {
          ruleId: ruleApp.ruleId,
          ruleLabel: ruleApp.ruleLabel,
          score: ruleApp.score,
          source: ruleApp.ruleSource
        } : null,
        hasOriginalReview:  hasOriginalReview,
        needsEffectiveReview: needsEffectiveReview,
        hasPendingReview: needsEffectiveReview,
        effectiveReviewPriority: effectiveReviewTxSet[i] || null,
        reviewReason:     (tx.review && tx.review.reason) || "",
        isInvalid:        !!invalidIndexes[i],
        isCreditCardPayment: tx.type === "credit_card_payment",
        isInvoiceInstallment: val.isInvoiceInstallmentTx ? val.isInvoiceInstallmentTx(tx) : false
      };
    }).filter(Boolean);

    /* ── allInvoices (com conciliação) ── */
    var reconContext = {
      registry: cardRegistry,
      isHistoricalPaymentForInvoice: val.isHistoricalPaymentForInvoice
    };
    var allInvoices = invoices.map(function (inv, i) {
      if (!inv || typeof inv !== "object") return null;
      var rawCardRef = inv.cardId || inv.cardExternalRef || "";
      var resolvedCardId = cardRegistry.resolveCardId(rawCardRef);
      var card       = cardMap[resolvedCardId] || cardMap[rawCardRef] || {};
      var invKey     = inv.id || inv.externalRef || inv.invoiceExternalRef || "";
      var hasCredit  = inv.balanceDirection === "credit" && (inv.creditBalanceCents || 0) > 0;
      var isReference = !!(inv.isStub || inv.referenceOnly);
      var amountDue  = inv.amountDueCents != null ? inv.amountDueCents : inv.totalCents;

      var recon = css.buildInvoiceReconciliation
        ? css.buildInvoiceReconciliation(inv, transactions, reconContext)
        : null;

      var linkedCount = recon ? recon.linkedCount : 0;
      var diffCents   = recon ? recon.reconciliationDeltaCents : 0;
      var isPartial   = recon ? recon.isPartial : false;
      var confidence  = recon ? recon.confidence : "n/a";
      var hasRealGap  = !isReference && !hasCredit && confidence === "high" &&
                        !isPartial && linkedCount > 0 &&
                        Math.abs(diffCents) > 1 &&
                        !(recon && recon.explainedByPayments);

      var cardLastFour = css.formatLastFourDisplay
        ? css.formatLastFourDisplay(card.lastFour || card.last4)
        : (card.lastFour || "");

      return {
        index:              i,
        id:                 inv.id   || "",
        externalRef:        inv.externalRef || inv.invoiceExternalRef || inv.id || "",
        cardId:             resolvedCardId || rawCardRef || "",
        cardExternalRef:    inv.cardExternalRef || "",
        cardName:           card.name || rawCardRef || "",
        cardBrand:          card.brand      || "",
        cardLastFour:       cardLastFour || "",
        cardLastFourMissing: !cardLastFour,
        competenceMonth:    inv.competenceMonth || "",
        competenceFmt:      fmonth(inv.competenceMonth || ""),
        status:             inv.status  || "",
        dueDate:            inv.dueDate || "",
        dueDateFmt:         fdate(inv.dueDate || ""),
        closingDate:        inv.closingDate || "",
        closingDateFmt:     fdate(inv.closingDate || ""),
        totalCents:         inv.totalCents || 0,
        totalFmt:           fcents(inv.totalCents || 0),
        amountDueCents:     amountDue || 0,
        amountDueFmt:       fcents(amountDue || 0),
        minimumPaymentFmt:  fcents(inv.minimumPaymentCents || 0),
        isStub:             !!inv.isStub,
        referenceOnly:      isReference,
        isReference:        isReference,
        hasPendingReview:   !!(inv.review && inv.review.required),
        hasCredit:          hasCredit,
        isCreditNotIncome:  hasCredit,
        creditBalanceCents: inv.creditBalanceCents || 0,
        creditBalanceFmt:   fcents(inv.creditBalanceCents || 0),
        creditBehavior:     inv.creditBehavior || "",
        linkedTransactionCount: linkedCount,
        linkedPurchasesCents: recon ? recon.linkedPurchasesCents : 0,
        linkedPurchasesFmt: fcents(recon ? recon.linkedPurchasesCents : 0),
        linkedFeesCents:    recon ? recon.linkedFeesCents : 0,
        linkedAdjustmentsCents: recon ? recon.linkedAdjustmentsCents : 0,
        linkedRefundsCents: recon ? recon.linkedRefundsCents : 0,
        linkedPaymentsCents: recon ? recon.linkedPaymentsCents : 0,
        invoiceChargesCents: recon ? recon.invoiceChargesCents : 0,
        invoiceChargesFmt: fcents(recon ? recon.invoiceChargesCents : 0),
        invoicePaymentsCents: recon ? recon.invoicePaymentsCents : 0,
        invoicePaymentsFmt: fcents(recon ? recon.invoicePaymentsCents : 0),
        statementSummary: recon ? recon.statementSummary : null,
        explainedByPayments: recon ? recon.explainedByPayments : false,
        linkedPaymentCount: recon ? recon.linkedPaymentCount : 0,
        reconciliationDeltaCents: diffCents,
        reconciliationDiff: diffCents,
        reconciliationDiffFmt: fcents(Math.abs(diffCents)),
        reconciliationConfidence: confidence,
        reconciliationPartial: isPartial,
        reconciliationMessage: recon ? recon.message : "",
        hasReconciliationGap: hasRealGap
      };
    }).filter(Boolean);

    /* ── allInstallmentPlans ── */
    var allInstallmentPlans = installmentPlans.map(function (plan) {
      if (!plan) return null;
      var rawCardRef = plan.cardId || plan.cardExternalRef || "";
      var resolvedCardId = cardRegistry.resolveCardId(rawCardRef);
      var card = cardMap[resolvedCardId] || cardMap[rawCardRef] || {};
      var kind = plan.kind || (val.classifyInstallmentKind ? val.classifyInstallmentKind(plan) : "unknown");
      var kindLabel = kind === "invoice_installment" ? "Parcelamento de fatura" :
                      kind === "purchase_installment" ? "Parcelamento de compra" :
                      kind === "financing" ? "Financiamento" : "Parcelamento";
      var cur = plan.currentInstallment || 0;
      var tot = plan.totalInstallments || 0;
      return {
        id:               plan.id  || "",
        kind:             kind,
        kindLabel:        kindLabel,
        description:      String(plan.description || "").substring(0, 80),
        totalInstallments:tot,
        currentInstallment:cur,
        remainingMonths:  tot && cur ? Math.max(0, tot - cur) : null,
        installmentAmtFmt: fcents(plan.installmentAmountCents || 0),
        totalAmtFmt:       fcents((plan.installmentAmountCents || 0) * (plan.totalInstallments || 0)),
        startCompetence:  plan.startCompetenceMonth || "",
        flow:             plan.flow    || "",
        cardId:           resolvedCardId || rawCardRef || "",
        cardExternalRef:  plan.cardExternalRef || "",
        cardName:         card.name    || rawCardRef || "",
        cardLastFour:     css.formatLastFourDisplay
          ? (css.formatLastFourDisplay(card.lastFour || card.last4) || "")
          : (card.lastFour || ""),
        isInvoiceInstallment: kind === "invoice_installment",
        isFinancing:      kind === "financing",
        source:           "imported_json",
        sourceLabel:      "Importado do JSON"
      };
    }).filter(Boolean);

    var recognizedFinancing = crs.buildRecognizedFinancing
      ? crs.buildRecognizedFinancing(ruleApplications, allInstallmentPlans, transactions)
      : allInstallmentPlans;

    recognizedFinancing = recognizedFinancing.map(function (p) {
      if (typeof p.installmentAmtFmt === "number" && p.installmentAmtFmt > 0) {
        p.installmentAmtFmt = fcents(p.installmentAmtFmt);
      }
      return p;
    });

    var financingCount = recognizedFinancing.filter(function (p) {
      return p.isFinancing || p.kind === "financing";
    }).length;

    var personalRulesCount = ruleApplications.filter(function (r) {
      return r.ruleSource === "personal_local" && r.autoResolve;
    }).length;

    /* ── allRecurringRules (JSON + reconhecidas) ── */
    var allRecurringRules = recognizedRecurrences.map(function (rule) {
      if (!rule) return null;
      return {
        id:           rule.id  || "",
        description:  String(rule.description || "").substring(0, 80),
        amountFmt:    rule.expectedAmountCents ? fcents(rule.expectedAmountCents) :
                      (rule.amountCents ? fcents(rule.amountCents) : "—"),
        expectedAmountCents: rule.expectedAmountCents || rule.amountCents || 0,
        type:         rule.type || "",
        flow:         rule.flow      || "",
        frequency:    rule.frequency || "",
        categoryLabel: rule.categoryLabel || rule.category || "",
        startCompetenceMonth: rule.startCompetenceMonth || "",
        sourcePattern: rule.sourcePattern || "",
        sourceInstitution: rule.sourceInstitution || "",
        sourceLabels:   rule.sourceLabels || (rule.sourceLabel ? [rule.sourceLabel] : []),
        sources:        rule.sources || (rule.source ? [rule.source] : []),
        dayOfMonth:   rule.dayOfMonth || null,
        isActive:     rule.isActive !== false,
        accountName:  rule.accountName || "",
        cardName:     rule.cardName    || "",
        source:       rule.source      || "imported_json",
        sourceLabel:  rule.sourceLabel || "Importada do JSON",
        ruleId:       rule.ruleId      || "",
        recurrenceKind: rule.recurrenceKind || (rule.source === "engine_suggested" ? "candidate" : "imported"),
        confidence:   rule.confidence  || ""
      };
    }).filter(Boolean);

    var recurringImportedCount = allRecurringRules.filter(function (r) {
      return (r.sources && r.sources.indexOf("imported_json") >= 0) ||
        r.recurrenceKind === "imported" ||
        (r.sourceLabels && r.sourceLabels.indexOf("Importada do JSON") >= 0);
    }).length;
    var recurringFromRulesCount = allRecurringRules.filter(function (r) {
      return (r.sources && r.sources.indexOf("personal_local") >= 0) ||
        r.recurrenceKind === "personal_rule" ||
        (r.sourceLabels && r.sourceLabels.indexOf("Regra pessoal local") >= 0);
    }).length;
    var recurringCandidatesCount = allRecurringRules.filter(function (r) {
      return r.recurrenceKind === "candidate" ||
        (r.sources && r.sources.indexOf("engine_suggested") >= 0);
    }).length;
    var recurringTotalCount = allRecurringRules.length;

    /* ── allAccounts ── */
    var allAccounts = accounts.map(function (acc) {
      if (!acc) return null;
      return {
        id:          acc.id   || "",
        name:        String(acc.name || "").substring(0, 60),
        type:        acc.type || "",
        institution: acc.institution || "",
        lastFour:    acc.lastFour || "",
        currency:    acc.currency || "BRL",
        isActive:    acc.isActive !== false
      };
    }).filter(Boolean);

    /* ── Cartões + snapshots (overlay local) ── */
    var cardContext = {
      institution:  context.institution,
      documentType: context.documentType,
      periodEnd:    src.periodEnd || "",
      registry:     cardRegistry
    };
    var cardSummaries = css.buildCardSummaries
      ? css.buildCardSummaries(cards, cardContext) : [];

    cardSummaries = css.attachCardLinks
      ? css.attachCardLinks(cardSummaries, invoices, transactions, installmentPlans, cardRegistry)
      : cardSummaries;

    cardSummaries = cardSummaries.map(function (card) {
      var srcLabel = card.snapshotSource === "snapshot_local" ? "Snapshot local" :
                     card.snapshotSource === "limit_override_local" ? "Override local" : "JSON";
      var pct = card.usagePercent != null ? card.usagePercent : card.usedPercent;
      return Object.assign({}, card, {
        limitFmt:      fcents(card.limitCents || 0),
        usedFmt:       card.usedCents != null ? fcents(card.usedCents) : "—",
        availableFmt:  card.availableCents != null ? fcents(card.availableCents) : "—",
        usedPercent:   pct,
        usagePercentLabel: pct != null ? pct + "%" : "—",
        usedPercentLabel: pct != null ? pct + "%" : "—",
        limitSourceLabel: srcLabel,
        snapshotSourceLabel: srcLabel,
        consolidatedInvoiceTotalFmt: fcents(card.consolidatedInvoiceTotalCents || 0),
        purchaseTotalFmt: fcents(card.purchaseTotalCents || 0),
        futureInstallmentTotalFmt: fcents(card.futureInstallmentTotalCents || 0)
      });
    });

    var invoiceGroups = css.groupInvoices
      ? css.groupInvoices(allInvoices) : { consolidated: allInvoices, open: [], paid: [], reference: [] };

    /* ── allCards (legado — espelha summaries) ── */
    var allCards = cardSummaries.map(function (card) {
      return {
        id:         card.id,
        name:       card.name,
        brand:      card.brand,
        lastFour:   card.lastFour,
        limitFmt:   card.limitFmt,
        closingDay: card.closingDay,
        dueDay:     card.dueDay
      };
    });

    /* ── Retorno completo ── */
    return {
      /* metadados do arquivo */
      fileName:          fileName,
      fileSizeFormatted: fsize(fileSize),
      schema:            payload.schemaVersion || "—",

      /* origem */
      source: {
        institution:  context.institution,
        documentType: context.documentType,
        label:        src.label        || "",
        periodStart:  src.periodStart  || "",
        periodEnd:    src.periodEnd    || ""
      },

      /* contadores */
      counters: {
        accounts:          accounts.length,
        cards:             cards.length,
        invoices:          invoices.length,
        transactions:      transactions.length,
        installmentPlans:  installmentPlans.length,
        recurringRules:    recurringRules.length,
        recurringImported: recurringImportedCount,
        recurringFromRules: recurringFromRulesCount,
        recurringCandidates: recurringCandidatesCount,
        recurringTotal:    recurringTotalCount,
        recognizedRecurrences: recognizedRecurrences.length,
        valid:             validCount,
        invalid:           invalidCount,
        pendingReview:     confirmReviewCount,
        reviewSuggestions: suggestionCount,
        suggestionCount:   suggestionCount,
        confirmReviewCount: confirmReviewCount,
        autoResolved:      reducedReview.autoResolved.length,
        ruleClassified:    personalRulesCount,
        ruleResolved:      (reducedReview.ruleResolved || []).length,
        recognizedFinancing:   financingCount,
        criticalReview:    criticalReviewCount,
        importantReview:   importantReviewCount + criticalReviewCount,
        importantReviewCount: importantReviewCount + criticalReviewCount,
        criticalReviewCount: criticalReviewCount,
        badRawHashCount:   badRawHashCount,
        exactDuplicates:   exactDuplicates.length,
        probableDuplicates:probableDuplicates.length,
        classifiedSimilarities: similarityReport.classifiedCount || 0,
        informationalSimilarities: similarityReport.informationalCount || 0,
        similaritiesTotal: similarityReport.similaritiesTotal || 0,
        duplicateOnlyCount: similarityReport.duplicateOnlyCount || 0,
        privacyAlerts:     privacyAlerts.length,
        duplicates:        similarityReport.duplicateOnlyCount || 0,
        invoiceReferences: (invoiceGroups.reference || []).length,
        cardsWithSnapshot: cardSummaries.filter(function (c) { return c.hasSnapshot; }).length,
        rawReviewCount:    originalReviewTxCount,
        effectiveReviewCount: effectiveReviewTxCount,
        reviewReducedByRules: reviewReducedByRules,
        reviewSuggestionsCount: reducedReview.reviewSuggestions.length,
        invoiceReviewCount: invoiceReviewCount,
        invoiceStubReviewCount: invoiceStubReviewCount,
        brokenReferences:  brokenReferences.length,
        originalReviewTx:  originalReviewTxCount,
        effectiveReviewTx: effectiveReviewTxCount
      },

      /* dados para painéis de tabs */
      allTransactions:    allTransactions,
      allInvoices:        allInvoices,
      allInstallmentPlans:allInstallmentPlans,
      recognizedFinancing:recognizedFinancing,
      allRecurringRules:  allRecurringRules,
      ruleApplications:   ruleApplications,
      personalRulesLoaded: (crs.loadClassificationRules ? crs.loadClassificationRules().length : 0),
      allAccounts:        allAccounts,
      allCards:           allCards,
      cardSummaries:      cardSummaries,
      cardRegistry:       { cardCount: cardRegistry.cards.length },
      invoiceGroups:      invoiceGroups,

      /* mapas de lookup para o page */
      cardMap:            cardMap,
      accountMap:         accountMap,

      /* resultados de análise */
      itemErrors:         validation.itemErrors,
      warnings:           validation.warnings,
      allPendingReview:   allPendingReview,
      reviewPriorityGroups: reviewPriorityGroups,
      reviewSuggestions:  reducedReview.reviewSuggestions,
      autoResolvedReview: reducedReview.autoResolved,
      ruleResolvedReview: reducedReview.ruleResolved || [],
      reviewGroups:       reviewGroups,
      reimportSimulation: reimportSimulation,
      invoiceInstallmentInfo: invoiceInstallmentInfo,
      importBatchId:      IMPORT_BATCH_ID,
      similarityGroups:   simGroups,
      exactDuplicates:    exactDuplicates,
      probableDuplicates: probableDuplicates,
      installmentRelated: installmentRelated,
      recurringCandidates:recurringCandidates,
      repeatedPurchases:  repeatedPurchases,
      similarTransfers:   similarTransfers,
      similarityReport:   similarityReport,
      privacyAlerts:      privacyAlerts,
      overallStatus:      overallStatus,

      /* compatibilidade com 0.3 */
      txDisplay:  allTransactions.slice(0, 50),
      txTotal:    transactions.length,
      pendingReview: txReviewItems,
      duplicates: probableDuplicates,

      brokenReferences:   brokenReferences,

      state:     state,
      persisted: false
    };
  }

  /* ────────────────────────────────────────────────
   * 6. Pipeline principal
   * ──────────────────────────────────────────────── */

  function processFile(file) {
    var fmt = CFM.formatters || {};
    return readJsonFile(file).then(function (text) {
      var val = CFM.validators || {};
      var payload = parseJsonText(text);
      if (val.normalizeImportPayload) payload = val.normalizeImportPayload(payload);
      var validation = validateImportPayload(payload);

      if (!validation.valid) {
        return {
          state:             "error",
          fileName:          file.name,
          fileSizeFormatted: (fmt.formatFileSize || function (b) { return b + " B"; })(file.size),
          schema:            payload.schemaVersion || "—",
          errors:            validation.fatal
        };
      }

      return buildImportReport(file.name, file.size, payload, validation);
    });
  }

  /* ────────────────────────────────────────────────
   * 7. Stub de persistência
   * ──────────────────────────────────────────────── */

  function persistImport(_data) {
    return Promise.resolve({
      success: false,
      reason:  "Persistência desabilitada. Disponível após integração Firebase na Fase 1."
    });
  }

  /* ── Compatibilidade legada ── */
  function processImportText(rawText) {
    try {
      var val = CFM.validators || {};
      var data = parseJsonText(rawText);
      if (val.normalizeImportPayload) data = val.normalizeImportPayload(data);
      var validation = validateImportPayload(data);
      if (!validation.valid) return { valid: false, errors: validation.fatal };
      return {
        valid: true,
        result: {
          summary: {
            schemaVersion:    data.schemaVersion,
            sourceLabel:      (data.source && data.source.institution) || "",
            transactionCount: Array.isArray(data.transactions) ? data.transactions.length : 0,
            accountCount:     Array.isArray(data.accounts)     ? data.accounts.length     : 0,
            cardCount:        Array.isArray(data.cards)        ? data.cards.length        : 0,
            persisted:        false
          }
        }
      };
    } catch (e) { return { valid: false, errors: [e.message] }; }
  }

  /* ── API pública ── */
  CFM.importService = {
    readJsonFile:          readJsonFile,
    parseJsonText:         parseJsonText,
    validateImportPayload: validateImportPayload,
    buildImportReport:     buildImportReport,
    buildImportMetadata:   buildImportMetadata,
    reduceManualReview:    reduceManualReview,
    classifyReviewPriority:classifyReviewPriority,
    simulateReimport:      function (payload) {
      var val = CFM.validators || {};
      var ctx = (payload && payload.source) ? {
        institution: payload.source.institution || "",
        documentType: payload.source.documentType || ""
      } : {};
      return val.simulateReimport
        ? val.simulateReimport(payload.transactions || [], ctx)
        : { counts: {}, details: [] };
    },
    persistImport:         persistImport,
    processFile:           processFile,
    processImportText:     processImportText
  };
})(window.CFM);
