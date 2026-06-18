/**
 * Página de importação — Fase 0.3.20 (formatação monetária e datas PT-BR)
 * UX orientada ao usuário final; detalhes técnicos recolhidos.
 * Nada é gravado. Firebase será integrado na Fase 1.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  /* ════════════════════════════════════════════════
   * CONSTANTS
   * ════════════════════════════════════════════════ */

  var TX_TYPE_LABELS = {
    income:                "Receita",
    expense:               "Despesa",
    transfer:              "Transferência",
    credit_card_purchase:  "Compra no Cartão",
    credit_card_payment:   "Pagamento de Fatura",
    adjustment:            "Ajuste",
    fee:                   "Tarifa",
    refund:                "Reembolso"
  };

  var FLOW_LABELS = { "in": "Entrada", "out": "Saída", "neutral": "Neutro" };

  function ic(name, cls) {
    return CFM.icon(name, {
      className: "cfm-icon" + (cls ? " " + cls : " cfm-icon--inline")
    });
  }

  var INV_STATUS_LABELS = {
    open:    "Aberta",
    closed:  "Fechada",
    paid:    "Paga",
    pending: "Pendente",
    overdue: "Vencida"
  };

  var OVERALL_STATUS = {
    ready:        { icon: "success",  label: "Arquivo validado",             mod: "ready"        },
    has_pending:  { icon: "pending",  label: "Precisa revisar",                mod: "has-pending"  },
    has_blockers: { icon: "error",    label: "Precisa revisar",                mod: "has-blockers" },
    empty:        { icon: "empty",    label: "Arquivo sem dados relevantes", mod: "empty"        }
  };

  var SIMILARITY_SECTIONS = [
    { key: "exactDuplicates",     title: "Duplicatas exatas",              tier: "blocking" },
    { key: "probableDuplicates",  title: "Duplicatas prováveis",           tier: "blocking" },
    { key: "installmentRelated",  title: "Parcelas relacionadas",          tier: "blocking" },
    { key: "similarTransfers",    title: "Transferências semelhantes",     tier: "blocking" }
  ];

  var ATTENTION_SIMILARITY_SECTIONS = [
    { key: "recurringCandidates", title: "Recorrências candidatas",        tier: "attention" },
    { key: "probableDuplicates",  title: "Duplicatas prováveis",           tier: "attention" },
    { key: "similarTransfers",    title: "Transferências semelhantes",     tier: "attention" },
    { key: "installmentRelated",  title: "Parcelas relacionadas",          tier: "attention" }
  ];

  var INFORMATIONAL_SIMILARITY = {
    key: "repeatedPurchases",
    title: "Compras repetidas (informativo — não é duplicidade)"
  };

  var REVIEW_PRIORITY_META = {
    critical:  { cls: "review-priority--critical",  icon: "critical" },
    important: { cls: "review-priority--important", icon: "warning" },
    low:       { cls: "review-priority--low",       icon: "suggestion" }
  };

  var TABS = [
    { id: "summary",      label: "Resumo",        countKey: null },
    { id: "cards",        label: "Cartões",       countKey: "cards" },
    { id: "invoices",     label: "Faturas",        countKey: "invoices" },
    { id: "transactions", label: "Lançamentos",  countKey: "transactions" },
    { id: "review",       label: "Revisar",        countKey: "blockingConfirmCount" },
    { id: "similarities", label: "Observações",    countKey: "blockingSimilarityCount" },
    { id: "recurring",    label: "Recorrências",   countKey: "recurringTotal" },
    { id: "installments", label: "Parcelas",       countKey: "installmentPlans" },
    { id: "privacy",      label: "Segurança",      countKey: "privacyAlerts" }
  ];

  /* ════════════════════════════════════════════════
   * LOCAL HELPERS
   * ════════════════════════════════════════════════ */

  function formatInstallmentGroupBadgeLabel(label) {
    if (label === "Grupo identificado nas observações") {
      return "Grupo detectado na revisão";
    }
    return label;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmt() { return CFM.formatters || {}; }

  function displayMoney(fmtValue, centsValue) {
    var fn = fmt().formatCurrencyBRL || fmt().formatCurrencyFromCents;
    if (!fn) return fmtValue != null && fmtValue !== "" ? String(fmtValue) : "—";
    if (typeof centsValue === "number" && Number.isFinite(centsValue)) {
      return fn(centsValue);
    }
    if (fmtValue != null && fmtValue !== "") {
      return fn(fmtValue);
    }
    return "—";
  }

  function displayDate(value) {
    var fn = fmt().formatDisplayDate || fmt().formatDateBR || fmt().formatDate;
    if (!fn) return value || "—";
    return fn(value);
  }

  function fcents(c)  { return displayMoney(null, c); }
  function fdate(d)     { return displayDate(d); }
  function fmonth(m)    {
    var fn = fmt().formatCompetenceBR || fmt().formatMonth;
    return fn ? fn(m) : (m || "—");
  }

  function flowBadge(flow) {
    if (flow === "in")
      return '<span class="flow-badge flow-badge--in">↑ entrada</span>';
    if (flow === "out")
      return '<span class="flow-badge flow-badge--out">↓ saída</span>';
    return '<span class="flow-badge flow-badge--neutral">⇄ neutro</span>';
  }

  function typeBadge(type, tx) {
    var sem = CFM.importSemantics;
    if (tx && tx.isInvoiceInternalCredit) {
      return '<span class="type-badge type-badge--invoice-credit">Crédito na fatura</span>';
    }
    if (tx && sem && sem.getTransactionDisplayType) {
      var display = sem.getTransactionDisplayType(tx);
      if (display) {
        return '<span class="type-badge ' + esc(display.cls || "type-badge--settlement") + '">' +
          esc(display.label) + "</span>";
      }
    }
    if (tx && tx.isInvoiceSettlement) {
      return '<span class="type-badge type-badge--settlement">' +
        esc(tx.settlementLabel || "Liquidação de fatura") + "</span>";
    }
    var label = TX_TYPE_LABELS[type] || esc(type);
    var cls   = type === "credit_card_purchase" ? "type-badge--purchase" :
                type === "income"               ? "type-badge--credit"   :
                type === "expense"              ? "type-badge--debit"    :
                type === "refund"               ? "type-badge--credit"   :
                type === "fee"                  ? "type-badge--debit"    : "type-badge--other";
    return '<span class="type-badge ' + cls + '">' + esc(label) + "</span>";
  }

  function statusChip(status) {
    var label = INV_STATUS_LABELS[status] || esc(status || "—");
    var cls   = status === "paid"    ? "status-chip--paid"    :
                status === "open"    ? "status-chip--open"    :
                status === "overdue" ? "status-chip--overdue" : "status-chip--other";
    return '<span class="status-chip ' + cls + '">' + esc(label) + '</span>';
  }

  function countBadge(n) {
    if (!n || n === 0) return "";
    return '<span class="tab-badge">' + n + "</span>";
  }

  function emptyPanel(msg) {
    return '<p class="report-empty" style="padding:1rem 0">' + esc(msg) + '</p>';
  }

  function confidenceBadge(confidence) {
    var label = confidence === "high" ? "Alta" :
                confidence === "medium" ? "Média" :
                confidence === "low" ? "Baixa" : "Não é duplicidade";
    return '<span class="confidence-badge confidence-badge--' + esc(confidence || "none") + '">' + esc(label) + "</span>";
  }

  function recurringBadgeHtml(badge) {
    if (!badge || !badge.label) return "";
    var cls = String(badge.cls || "").trim();
    var isAttention = badge.kind === "attention" ||
      cls.indexOf("confidence-badge") >= 0;
    if (isAttention) {
      if (cls.indexOf("confidence-badge ") === 0 || cls === "confidence-badge") {
        /* full class */
      } else if (cls.indexOf("confidence-badge--") === 0) {
        cls = "confidence-badge " + cls;
      } else if (!cls) {
        cls = "confidence-badge confidence-badge--warning";
      } else {
        cls = "confidence-badge " + cls;
      }
      return ' <span class="' + esc(cls) + '">' + esc(badge.label) + "</span>";
    }
    if (cls.indexOf("status-chip ") === 0 || cls === "status-chip") {
      /* full class */
    } else if (cls.indexOf("status-chip--") === 0) {
      cls = "status-chip " + cls;
    } else if (!cls) {
      cls = "status-chip status-chip--other";
    } else {
      cls = "status-chip " + cls;
    }
    return ' <span class="' + esc(cls) + '">' + esc(badge.label) + "</span>";
  }

  function observationSeverityBadge(pair) {
    if (pair.informational || pair.severity === "info" || pair.tier === "informational") {
      return '<span class="confidence-badge confidence-badge--info">Informativo</span>';
    }
    if (pair.tier === "attention" ||
        pair.classification === "recurring_candidate" ||
        pair.severity === "warning" ||
        pair.classification === "probable_duplicate" ||
        pair.classification === "installment_related") {
      return '<span class="confidence-badge confidence-badge--warning">Atenção</span>';
    }
    if (pair.classification === "exact_duplicate" || pair.tier === "blocking") {
      return '<span class="confidence-badge confidence-badge--danger">Bloqueante</span>';
    }
    if (pair.confidence === "high" || pair.confidence === "medium" || pair.confidence === "low") {
      return '<span class="confidence-badge confidence-badge--warning">Atenção</span>';
    }
    return '<span class="confidence-badge confidence-badge--info">Informativo</span>';
  }

  function observationExtraBadges(pair) {
    var html = "";
    if (pair.classification === "recurring_candidate" || pair.tier === "attention") {
      html += ' <span class="confidence-badge confidence-badge--candidate">Candidata</span>';
    }
    if (pair.tier === "attention" || pair.classification === "recurring_candidate") {
      html += ' <span class="similarity-item__hint">Não bloqueia a importação</span>';
    }
    return html;
  }

  function filterObservationsByTier(list, tier) {
    return (list || []).filter(function (pair) {
      if (pair.tier) return pair.tier === tier;
      if (tier === "blocking") return pair.blocking === true;
      if (tier === "attention") return pair.attention === true;
      return pair.informational === true || pair.severity === "info";
    });
  }

  function getObservationPairKey(pair) {
    if (!pair) return "";
    if (pair.pairKey) return pair.pairKey;
    return (pair.classification || "observation") + ":idx:" + pair.index1 + ":" + pair.index2;
  }

  function isObservationDismissed(pair) {
    return !!dismissedObservations[getObservationPairKey(pair)];
  }

  function filterActiveObservations(list) {
    return (list || []).filter(function (pair) { return !isObservationDismissed(pair); });
  }

  function countActiveObservations(report) {
    var blocking = 0;
    var attention = 0;
    var informational = 0;
    var keys = [
      "exactDuplicates", "probableDuplicates", "installmentRelated", "similarTransfers",
      "recurringCandidates", "repeatedPurchases", "informationalInstallments", "categoryReviewHints"
    ];
    keys.forEach(function (key) {
      filterActiveObservations(report[key]).forEach(function (pair) {
        if (pair.blocking || pair.tier === "blocking") blocking++;
        else if (pair.attention || pair.tier === "attention") attention++;
        else informational++;
      });
    });
    return { blocking: blocking, attention: attention, informational: informational };
  }

  function getObservationCompareRefs(pair) {
    var sem = CFM.importSemantics || {};
    if (sem.getObservationTransactionRefs) {
      var refs = sem.getObservationTransactionRefs(pair);
      if (refs.length) return refs;
    }
    var refsFallback = [];
    if (pair.transactionRef1) refsFallback.push(pair.transactionRef1);
    if (pair.transactionRef2 && pair.transactionRef2 !== pair.transactionRef1) {
      refsFallback.push(pair.transactionRef2);
    }
    return refsFallback;
  }

  function collectActiveInstallmentObservations(report) {
    if (!report) return [];
    var keys = ["installmentRelated", "informationalInstallments"];
    var out = [];
    keys.forEach(function (key) {
      filterActiveObservations(report[key] || []).forEach(function (pair) {
        if (getPairContextKind(pair) === "installment_related") out.push(pair);
      });
    });
    return out;
  }

  function observationTxRefsHtml(pair) {
    var refs = getObservationCompareRefs(pair);
    if (!refs.length) return "";
    var idx1 = pair.displayIndex1 != null ? pair.displayIndex1 : pair.index1;
    var idx2 = pair.displayIndex2 != null ? pair.displayIndex2 : pair.index2;
    var sameTx = refs.length === 1 || idx1 === idx2;
    if (sameTx) {
      return (
        '<span class="similarity-item__refs">' +
        'Transação <button type="button" class="obs-tx-link" data-tx-ref="' + esc(refs[0]) + '">#' +
        esc(idx1) + "</button></span>"
      );
    }
    return (
      '<span class="similarity-item__refs">' +
      'Transações <button type="button" class="obs-tx-link" data-tx-ref="' + esc(refs[0]) + '">#' +
      esc(idx1) + '</button> e <button type="button" class="obs-tx-link" data-tx-ref="' +
      esc(refs[1] || refs[0]) + '">#' + esc(idx2) + "</button></span>"
    );
  }

  function getPairContextKind(pair) {
    var sem = CFM.importSemantics || {};
    var pairKey = getObservationPairKey(pair);
    if (observationContextOverrides[pairKey]) return observationContextOverrides[pairKey];
    return sem.getObservationContextKind ? sem.getObservationContextKind(pair) : "generic";
  }

  function findObservationPair(report, pairKey) {
    if (!report || !pairKey) return null;
    var keys = [
      "repeatedPurchases", "probableDuplicates", "exactDuplicates",
      "installmentRelated", "informationalInstallments", "similarTransfers",
      "recurringCandidates", "categoryReviewHints"
    ];
    for (var k = 0; k < keys.length; k++) {
      var list = report[keys[k]] || [];
      for (var i = 0; i < list.length; i++) {
        if (getObservationPairKey(list[i]) === pairKey) return list[i];
      }
    }
    var sr = report.similarityReport;
    if (sr) {
      for (var j = 0; j < keys.length; j++) {
        var srList = sr[keys[j]] || [];
        for (var n = 0; n < srList.length; n++) {
          if (getObservationPairKey(srList[n]) === pairKey) return srList[n];
        }
      }
    }
    return null;
  }

  function observationActionsHtml(pair) {
    var ctx = getPairContextKind(pair);
    var pairKey = getObservationPairKey(pair);
    var dismissBtn =
      ' <button type="button" class="btn btn--ghost btn--xs obs-dismiss-btn"' +
      ' data-pair-key="' + esc(pairKey) + '"' +
      ' aria-label="Marcar observação como conferida">Marcar como conferido</button>';

    if (ctx === "installment_related") {
      var refs = getObservationCompareRefs(pair);
      var compareBtn = refs.length
        ? ' <button type="button" class="btn btn--ghost btn--xs obs-compare-installment-pair"' +
          ' data-pair-key="' + esc(pairKey) + '"' +
          ' data-tx-refs="' + esc(refs.join(",")) + '"' +
          ' aria-label="Comparar as duas transações deste par de parcelas">Comparar este par</button>'
        : "";
      return (
        '<div class="similarity-item__actions">' +
        compareBtn +
        dismissBtn +
        "</div>"
      );
    }

    if (ctx === "repeated_purchase") {
      var refs = getObservationCompareRefs(pair);
      var compareBtn = refs.length
        ? ' <button type="button" class="btn btn--ghost btn--xs obs-compare-purchase-btn"' +
          ' data-pair-key="' + esc(pairKey) + '"' +
          ' data-tx-refs="' + esc(refs.join(",")) + '"' +
          ' aria-label="Comparar compras semelhantes lado a lado">Comparar compras</button>'
        : "";
      return '<div class="similarity-item__actions">' + compareBtn + dismissBtn + "</div>";
    }

    var refsGeneric = getObservationCompareRefs(pair);
    var compareGeneric = refsGeneric.length
      ? ' <button type="button" class="btn btn--ghost btn--xs obs-compare-btn"' +
        ' data-pair-key="' + esc(pairKey) + '"' +
        ' data-tx-refs="' + esc(refsGeneric.join(",")) + '">Comparar lançamentos</button>'
      : "";
    return '<div class="similarity-item__actions">' + compareGeneric + dismissBtn + "</div>";
  }

  function similarityPairRow(pair, groupLabel) {
    var sem = CFM.importSemantics || {};
    var ui = sem.getObservationUiCopy ? sem.getObservationUiCopy(pair) : {};
    var title = ui.title || pair.classificationLabel || groupLabel || "Observação";
    var impact = ui.impact || "";
    var descLead = ui.cardDescription && getPairContextKind(pair) === "installment_related"
      ? ui.cardDescription
      : (ui.description || "");
    var pairKey = getObservationPairKey(pair);

    return (
      '<li class="similarity-item' + (pair.informational ? " similarity-item--info" : "") +
      '" data-pair-key="' + esc(pairKey) + '"' +
      ' data-context-kind="' + esc(getPairContextKind(pair)) + '">' +
      '  <div class="similarity-item__header">' +
      '    <strong>' + esc(title) + "</strong> " +
      observationSeverityBadge(pair) +
      observationExtraBadges(pair) +
      "  </div>" +
      (descLead ? '  <p class="similarity-item__impact">' + esc(descLead) + "</p>" : "") +
      '  <p class="similarity-item__desc">' +
      '"' + esc(pair.description1) + '" · ' + esc(displayMoney(pair.amountFmt, pair.amountCents)) +
      (pair.date1 ? " · " + esc(displayDate(pair.date1)) : "") +
      "</p>" +
      (pair.index1 !== pair.index2 || pair.description2 !== pair.description1
        ? '  <p class="similarity-item__desc similarity-item__desc--secondary">' +
          '"' + esc(pair.description2) + '"' +
          (pair.date2 ? " · " + esc(displayDate(pair.date2)) : "") +
          (pair.month2 && pair.month1 !== pair.month2 ? " · " + esc(pair.month2) : "") +
          "</p>"
        : "") +
      observationTxRefsHtml(pair) +
      (impact ? '  <p class="similarity-item__hint">' + esc(impact) + "</p>" : "") +
      observationActionsHtml(pair) +
      "</li>"
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: SUMMARY
   * ════════════════════════════════════════════════ */

  function buildStatItem(s) {
    var cls = "stat-item" + (s.mod ? " stat-item--" + s.mod : "");
    var titleAttr = s.title ? ' title="' + esc(s.title) + '"' : "";
    var valueHtml = s.isText
      ? '<span class="stat-item__value stat-item__value--text">' + esc(String(s.value)) + "</span>"
      : '<span class="stat-item__value">' + s.value + "</span>";
    var subHtml = s.sub ? '<span class="stat-item__sub">' + esc(s.sub) + "</span>" : "";
    return '<div class="' + cls + '"' + titleAttr + ">" + valueHtml +
           '<span class="stat-item__label">' + esc(s.label) + "</span>" + subHtml + "</div>";
  }

  function buildSchemaReferenceBlock() {
    return (
      '<div class="schema-ref">' +
      'Referência: <code>docs/SCHEMA_IMPORTACAO_JSON.md</code>' +
      '&nbsp;·&nbsp; Exemplo: <code>data/sample-import.cfm.v1.json</code>' +
      "</div>" +
      '<ul class="feature-list">' +
      '  <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '    <span class="feature-list__text"><strong>amountCents</strong> sempre positivo; direção definida por <strong>flow</strong> (<code>in</code> / <code>out</code> / <code>neutral</code>).</span></li>' +
      '  <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '    <span class="feature-list__text"><strong>type</strong> obrigatório — valores canônicos: <code>income</code>, <code>expense</code>, <code>transfer</code>, <code>credit_card_purchase</code>, <code>credit_card_payment</code>, <code>adjustment</code>, <code>fee</code>, <code>refund</code>.</span></li>' +
      '  <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '    <span class="feature-list__text"><strong>creditBalanceCents</strong> com <code>balanceDirection: "credit"</code> indica saldo a favor, nunca receita.</span></li>' +
      '  <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '    <span class="feature-list__text">Arquivos financeiros reais nunca devem ser versionados no repositório.</span></li>' +
      "</ul>"
    );
  }

  function buildPrivacyDeveloperNotes() {
    return (
      '<div class="privacy-instructions">' +
      '  <h4 class="report-section__title">Boas práticas (desenvolvedor)</h4>' +
      '  <ul class="entity-list">' +
      '    <li class="entity-list__item">Não copie arquivos financeiros reais para <code>/data</code> do projeto.</li>' +
      '    <li class="entity-list__item">Nunca commite <code>*.real.json</code> ou <code>*.sensitive.json</code>.</li>' +
      '    <li class="entity-list__item">Use apenas <code>lastFour</code> para identificar cartões — nunca o número completo.</li>' +
      '    <li class="entity-list__item">Armazene <code>rawHash</code> apenas como SHA-256 (<code>sha256:&lt;64 hex&gt;</code>); impressões legíveis vão em <code>canonicalFingerprint</code>.</li>' +
      "  </ul></div>"
    );
  }

  function buildIdleTechnicalDetails() {
    return (
      '<details class="import-tech-details import-tech-details--idle">' +
      '<summary class="import-tech-details__summary">Detalhes técnicos da validação</summary>' +
      '<div class="import-tech-details__body">' +
      buildSchemaReferenceBlock() +
      "</div></details>"
    );
  }

  function buildTechnicalDetailsSection(report) {
    var c = report.counters || {};
    var src = report.source || {};

    var srcRows = "";
    if (src.institution)  srcRows += '<div class="source-info__row"><dt>Instituição</dt><dd>' + esc(src.institution)  + "</dd></div>";
    if (src.documentType) srcRows += '<div class="source-info__row"><dt>Tipo</dt><dd>'        + esc(src.documentType) + "</dd></div>";
    if (src.periodStart)  srcRows += '<div class="source-info__row"><dt>Período</dt><dd>' +
      esc(displayDate(src.periodStart)) + " → " + esc(displayDate(src.periodEnd || "—")) + "</dd></div>";
    if (src.label)        srcRows += '<div class="source-info__row"><dt>Origem</dt><dd>'      + esc(src.label)        + "</dd></div>";
    if (report.schema)    srcRows += '<div class="source-info__row"><dt>Schema</dt><dd><code>' + esc(report.schema) + "</code></dd></div>";

    var technicalStats = [
      { label: "Contas",                    value: c.accounts },
      { label: "Válidos",                   value: c.valid,                  mod: "success" },
      { label: "Inválidos",                 value: c.invalid,                mod: c.invalid > 0 ? "danger" : "" },
      { label: "Rec. JSON",                 value: c.recurringImported || c.recurringRules || 0 },
      { label: "Rec. regra pessoal",        value: c.recurringFromRules || 0 },
      { label: "Rec. candidatas",           value: c.recurringCandidates || 0 },
      { label: "Revisão JSON (bruta)",      value: c.rawTransactionReviewCount != null ? c.rawTransactionReviewCount : (c.rawReviewCount != null ? c.rawReviewCount : (c.originalReviewTx || 0)) },
      { label: "Revisão efetiva (tx)",      value: c.effectiveTransactionReviewCount != null ? c.effectiveTransactionReviewCount : (c.effectiveReviewCount != null ? c.effectiveReviewCount : (c.effectiveReviewTx || 0)) },
      { label: "Validação necessária",      value: c.importantReviewCount != null ? c.importantReviewCount : ((c.importantReview || 0) + (c.criticalReview || 0)) },
      { label: "Reduzidas por regra",       value: c.reviewReducedByRules || 0, mod: (c.reviewReducedByRules || 0) > 0 ? "success" : "" },
      { label: "Auto-resolvidos",           value: c.autoResolved || 0,      mod: "success" },
      { label: "Classif. por regra pessoal", value: c.personalRuleAppliedCount != null ? c.personalRuleAppliedCount : (c.ruleClassified || 0), mod: (c.personalRuleAppliedCount || c.ruleClassified || 0) > 0 ? "success" : "" },
      { label: "Rev. fatura (não stub)",    value: c.invoiceReviewCount || 0 },
      { label: "Stubs de fatura",           value: c.invoiceStubCount != null ? c.invoiceStubCount : (c.invoiceStubReviewCount || 0) },
      { label: "Faturas (total JSON)",      value: c.invoicesTotal != null ? c.invoicesTotal : (c.invoices || 0) },
      { label: "Refs. de fatura (stub)",    value: c.invoiceReferences || 0 },
      { label: "Hash inválido (rawHash)",   value: c.badRawHashCount != null ? c.badRawHashCount : 0, mod: (c.badRawHashCount || 0) > 0 ? "danger" : "success" },
      { label: "Financiamentos",            value: c.recognizedFinancing || 0 },
      { label: "Dup. exatas",               value: c.exactDuplicates || 0,   mod: (c.exactDuplicates || 0) > 0 ? "danger" : "" },
      { label: "Dup. prováveis",            value: c.probableDuplicates || 0,mod: (c.probableDuplicates || 0) > 0 ? "warning" : "" },
      { label: "Semelh. bloqueantes",       value: c.blockingSimilarityCount != null ? c.blockingSimilarityCount : (c.classifiedSimilarities || 0), mod: (c.blockingSimilarityCount || 0) > 0 ? "warning" : "" },
      { label: "Semelh. informativas",      value: c.informationalSimilarityCount != null ? c.informationalSimilarityCount : (c.informationalSimilarities || 0) }
    ];

    var rulesNotice = "";
    if ((c.ruleClassified || 0) > 0 || report.personalRulesLoaded) {
      rulesNotice =
        '<div class="notice notice--success" role="note">' +
        '  <span>' + ic("success", "cfm-icon--success") + '</span>' +
        '  <span>Regras pessoais aplicadas localmente (' + (c.ruleClassified || 0) +
        " classificações). Revisão JSON: " + (c.rawReviewCount || 0) +
        " → efetiva: " + (c.effectiveReviewCount || 0) +
        ((c.reviewReducedByRules || 0) > 0
          ? " (" + c.reviewReducedByRules + " reduzidas por regra)."
          : ".") +
        " Nada foi gravado nesta fase.</span></div>";
    }

    var autoResolved = report.autoResolvedReview || [];
    var autoHtml = "";
    if (autoResolved.length > 0) {
      autoHtml =
        '<section class="auto-resolved-panel">' +
        '  <h4 class="report-section__title">Classificados automaticamente (' + autoResolved.length + ")</h4>" +
        '  <ul class="entity-list">' +
        autoResolved.slice(0, 8).map(function (item) {
          var ruleTag = item.ruleMatch
            ? ' <span class="status-chip status-chip--paid">Regra pessoal</span>' : "";
          return '<li class="entity-list__item">' + esc(item.description) + ruleTag +
            ' — <em>' + esc(item.autoResolution || "") + "</em></li>";
        }).join("") +
        (autoResolved.length > 8 ? '<li class="entity-list__item">… e mais ' + (autoResolved.length - 8) + "</li>" : "") +
        "</ul></section>";
    }

    var reimport = report.reimportSimulation || {};
    var reimportCounts = reimport.counts || {};
    var reimportHtml = "";
    if (reimportCounts.already_imported || reimportCounts.exact_duplicate) {
      reimportHtml =
        '<section class="reimport-panel">' +
        '  <h4 class="report-section__title">Simulação de reimportação (idempotência local)</h4>' +
        '  <p class="report-empty" style="font-style:normal;margin:0.5rem 0">' +
        "Reimportar o mesmo arquivo resultaria em: " +
        "<strong>" + (reimportCounts.already_imported || 0) + "</strong> já importados, " +
        "<strong>" + (reimportCounts.exact_duplicate || 0) + "</strong> duplicatas exatas." +
        "  </p></section>";
    }

    var invoiceRefHtml = "";
    var refInvoices = report.invoiceGroups && report.invoiceGroups.reference;
    if (refInvoices && refInvoices.length) {
      invoiceRefHtml =
        '<section class="tech-ref-panel">' +
        '  <h4 class="report-section__title">Faturas de referência / stub (' + refInvoices.length + ")</h4>" +
        '  <p class="report-empty" style="font-style:normal;margin:0.25rem 0 0.75rem">Vínculos internos — não exibidos na aba Faturas.</p>' +
        '  <ul class="entity-list">' +
        refInvoices.map(function (inv) {
          return '<li class="entity-list__item"><code>' + esc(inv.externalRef || inv.id || "—") +
            "</code> · " + esc(inv.cardName || "—") + " · " +
            esc(fmonth(inv.competenceMonth) || inv.competenceFmt || "") +
            (inv.linkedTransactionCount ? " · " + inv.linkedTransactionCount + " tx" : "") + "</li>";
        }).join("") +
        "</ul></section>";
    }

    var changedHtml = "";
    var diffInfo = report.importDiff || importDiffResult || {};
    var changedItems = diffInfo.changedExisting ||
      report.changedExistingTransactions ||
      [];
    var possibleItems = diffInfo.possibleDuplicates ||
      report.possibleDuplicateTransactions ||
      [];
    var importedItems = diffInfo.alreadyImportedTransactions ||
      report.alreadyImportedTransactionsPreview ||
      [];

    var unsafeItems = diffInfo.unsafeLegacyCandidates || report.unsafeLegacyCandidates || [];
    var equivalentItems = diffInfo.equivalentEntities || report.equivalentEntitiesPreview || [];

    function renderCompatList(title, items, mapper) {
      if (!items.length) return "";
      return (
        '<section class="tech-ref-panel">' +
        '  <h4 class="report-section__title">' + esc(title) + " (" + items.length + ")</h4>" +
        '  <ul class="entity-list">' +
        items.slice(0, 8).map(mapper).join("") +
        (items.length > 8 ? '<li class="entity-list__item">… e mais ' + (items.length - 8) + "</li>" : "") +
        "</ul></section>"
      );
    }

    changedHtml =
      renderCompatList("Transações alteradas detectadas", changedItems, function (item) {
        var tx = item.transaction || item;
        var stored = item.stored || {};
        return '<li class="entity-list__item">' + esc(tx.description || "—") +
          " · importado " + esc(displayMoney(null, tx.amountCents)) +
          " · atual " + esc(displayMoney(null, stored.amountCents)) +
          (item.reason ? " · " + esc(item.reason) : "") +
          '<div class="import-compat-actions" role="group" aria-label="Decisão para lançamento alterado">' +
          '<button type="button" class="btn btn--ghost btn--xs" data-changed-decision="keep_current" data-changed-ref="' +
          esc(tx.stableRef || tx.id || "") + '">Manter atual</button>' +
          '<button type="button" class="btn btn--ghost btn--xs" data-changed-decision="use_imported" data-changed-ref="' +
          esc(tx.stableRef || tx.id || "") + '">Usar importado</button>' +
          '<button type="button" class="btn btn--ghost btn--xs" data-changed-decision="keep_both" data-changed-ref="' +
          esc(tx.stableRef || tx.id || "") + '">Manter ambos</button>' +
          "</div></li>";
      }) +
      renderCompatList("Possíveis duplicidades (não importadas)", possibleItems, function (item) {
        var tx = item.transaction || item;
        return '<li class="entity-list__item">' + esc(tx.description || "—") +
          " · " + esc(displayMoney(null, tx.amountCents)) +
          (item.reason ? " · " + esc(item.reason) : "") + "</li>";
      }) +
      renderCompatList("Candidatos inseguros (não importados)", unsafeItems, function (item) {
        var tx = item.transaction || item;
        return '<li class="entity-list__item">' + esc(tx.description || "—") +
          " · " + esc(displayMoney(null, tx.amountCents)) +
          (item.reason ? " · " + esc(item.reason) : "") + "</li>";
      }) +
      renderCompatList("Entidades equivalentes detectadas", equivalentItems, function (item) {
        return '<li class="entity-list__item">' + esc(item.type || "entidade") +
          " · " + esc(item.label || item.incomingId || "—") +
          " ≈ " + esc(item.existingId || "—") + "</li>";
      }) +
      renderCompatList("Já importadas / sobreposição legada", importedItems, function (item) {
        var tx = item.transaction || item;
        return '<li class="entity-list__item">' + esc(tx.description || "—") +
          " · " + esc(displayMoney(null, tx.amountCents)) +
          (item.reason ? " · " + esc(item.reason) : "") + "</li>";
      });

    return (
      '<details class="import-tech-details">' +
      '<summary class="import-tech-details__summary">Detalhes técnicos da validação</summary>' +
      '<div class="import-tech-details__body">' +
      (srcRows ? '<dl class="source-info">' + srcRows + "</dl>" : "") +
      rulesNotice +
      '<div class="stat-grid stat-grid--secondary">' +
      technicalStats.map(buildStatItem).join("") +
      "</div>" +
      autoHtml +
      reimportHtml +
      changedHtml +
      invoiceRefHtml +
      buildSchemaReferenceBlock() +
      buildPrivacyDeveloperNotes() +
      "</div></details>"
    );
  }

  function buildSummaryTab(report) {
    var c   = report.counters;
    var si  = OVERALL_STATUS[report.overallStatus] || OVERALL_STATUS.ready;
    var blocking = c.blockingConfirmCount != null ? c.blockingConfirmCount
      : (c.confirmReviewCount != null ? c.confirmReviewCount : (c.pendingReview || 0));
    var suggestions = c.suggestionCount != null ? c.suggestionCount : (c.reviewSuggestions || 0);
    var recurringTotal = c.recurringTotal || c.recognizedRecurrences || c.recurringRules || 0;
    var statusKpiLabel = report.overallStatus === "ready" ? "Arquivo validado" : "Precisa revisar";
    var statusKpiMod = report.overallStatus === "ready" ? "success"
      : (report.overallStatus === "has_blockers" ? "danger" : "warning");

    var userStats = [
      { label: "Status",        value: statusKpiLabel, isText: true, mod: statusKpiMod },
      { label: "Lançamentos",   value: c.transactions },
      { label: "Pendências",    value: blocking, mod: blocking > 0 ? "warning" : "success", title: "Pendências obrigatórias" },
      { label: "Cartões",       value: c.cards },
      { label: "Faturas",       value: c.invoices },
      { label: "Parcelas",      value: c.installmentPlans },
      { label: "Recorrências",  value: recurringTotal },
      { label: "Sugestões",     value: suggestions, sub: "opcionais" }
    ];

    var heroMsg = "";
    if (report.overallStatus === "has_blockers") {
      heroMsg = "Há itens que precisam de correção antes de importar.";
    } else if (report.overallStatus === "has_pending") {
      heroMsg = "Revise os pontos indicados — a maioria já foi classificada automaticamente.";
    } else {
      heroMsg = "Seu arquivo está consistente. Nenhuma pendência bloqueante.";
    }

    var src = report.source || {};
    var srcBrief = "";
    if (src.institution || src.periodStart) {
      srcBrief = '<p class="summary-source">';
      if (src.institution) srcBrief += esc(src.institution);
      if (src.periodStart) {
        srcBrief += (src.institution ? " · " : "") + esc(displayDate(src.periodStart)) +
          " → " + esc(displayDate(src.periodEnd || "—"));
      }
      srcBrief += "</p>";
    }

    return (
      '<section class="summary-hero import-status-banner import-status-banner--' + si.mod + '">' +
      '  <div class="summary-hero__main">' +
      '    <p class="summary-hero__eyebrow">Posso importar com segurança?</p>' +
      '    <p class="summary-hero__title">' + ic(si.icon, "cfm-icon--hero") + " " + esc(si.label) + "</p>" +
      '    <p class="summary-hero__text">' + esc(heroMsg) + "</p>" +
      srcBrief +
      "  </div></section>" +
      '<div class="stat-grid stat-grid--summary">' + userStats.map(buildStatItem).join("") + "</div>" +
      buildSummaryCardsPanel(report) +
      buildTechnicalDetailsSection(report)
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: FATURAS
   * ════════════════════════════════════════════════ */

  function buildSummaryCardsPanel(report) {
    var cards = report.cardSummaries;
    if (!cards || !cards.length) return "";
    var items = cards.filter(function (c) { return c.hasSnapshot; }).slice(0, 4).map(function (card) {
      var pct = card.usedPercent != null ? card.usedPercent : null;
      return (
        '<li class="summary-card-mini">' +
        '  <p class="summary-card-mini__name">' + esc(card.name) + "</p>" +
        '  <p class="summary-card-mini__row"><span>Limite</span><strong>' + esc(displayMoney(card.limitFmt, card.limitCents)) + "</strong></p>" +
        '  <p class="summary-card-mini__row"><span>Usado</span><strong>' + esc(displayMoney(card.usedFmt, card.usedCents)) + "</strong></p>" +
        '  <p class="summary-card-mini__row"><span>Disponível</span><strong>' + esc(displayMoney(card.availableFmt, card.availableCents)) + "</strong></p>" +
        (pct != null ? '  <p class="summary-card-mini__pct">' + pct + "% utilizado</p>" : "") +
        "</li>"
      );
    }).join("");
    if (!items) return "";
    return (
      '<section class="cards-summary-panel">' +
      '  <h4 class="report-section__title">Cartões no arquivo</h4>' +
      '  <ul class="summary-card-grid">' + items + "</ul>" +
      "</section>"
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: CARTÕES
   * ════════════════════════════════════════════════ */

  function formatCardLastFour(card) {
    if (card.lastFourDisplay) return ' <span class="invoice-card__last4">' + esc(card.lastFourDisplay) + "</span>";
    if (card.lastFour) return ' <span class="invoice-card__last4">···' + esc(card.lastFour) + "</span>";
    return "";
  }

  function getSnapshotSourceLabel(source) {
    var css = CFM.cardSnapshotService || {};
    if (css.getSnapshotSourceLabel && css.normalizeSnapshotSourceKey) {
      var key = (typeof source === "string" &&
        /^(json|local|card|missing)$/.test(source))
        ? source
        : css.normalizeSnapshotSourceKey(source, "import_json");
      return css.getSnapshotSourceLabel(key);
    }
    if (source == null || source === "") return "Snapshot ausente";
    if (typeof source === "object") return "Snapshot do JSON";
    return String(source);
  }

  function buildCardsTab(report) {
    var cards = report.cardSummaries;
    if (!cards || cards.length === 0) return emptyPanel("Nenhum cartão encontrado no arquivo.");

    var rows = cards.map(function (card) {
      var pct = card.usedPercent != null ? card.usedPercent : 0;
      var barCls = pct >= 90 ? "limit-bar__fill--danger" : pct >= 70 ? "limit-bar__fill--warning" : "limit-bar__fill--ok";
      var consistencyHtml = "";
      if (card.snapshotConsistencyMessage || card.hasSnapshot) {
        var cCls = card.snapshotConsistent === true
          ? "snapshot-status snapshot-status--ok"
          : card.snapshotConsistent === false
            ? "snapshot-status snapshot-status--warn"
            : "snapshot-status";
        var cMsg = card.snapshotConsistent === true
          ? "Snapshot consistente"
          : (card.snapshotConsistencyMessage || "");
        if (cMsg) consistencyHtml = '<p class="' + cCls + '">' + esc(cMsg) + "</p>";
      }

      var aliasesHtml = "";
      var sem = CFM.importSemantics;
      if (sem && sem.formatCardAliasesNote) {
        var aliasNote = sem.formatCardAliasesNote(card);
        if (aliasNote) {
          aliasesHtml =
            '<details class="card-alias-details">' +
            '<summary class="card-alias-details__summary">Detalhes do cartão</summary>' +
            '<p class="card-alias-details__text">' + esc(aliasNote) + "</p></details>";
        }
      }

      return (
        '<li class="card-limit-item">' +
        '  <div class="card-limit-item__header">' +
        '    <span class="card-limit-item__name">' + esc(card.name) + formatCardLastFour(card) + "</span>" +
        (card.hasSnapshot
          ? ' <span class="status-chip status-chip--paid">' +
            esc(getSnapshotSourceLabel(card.snapshotSourceKey || card.snapshotSourceLabel || card.snapshotSource)) +
            "</span>"
          : ' <span class="status-chip status-chip--other">' + esc(getSnapshotSourceLabel("missing")) + "</span>") +
        "  </div>" +
        '  <div class="card-limit-item__amounts">' +
        '    <span>Limite: <strong>' + esc(displayMoney(card.limitFmt, card.limitCents)) + "</strong></span>" +
        '    <span>Usado: <strong>' + esc(displayMoney(card.usedFmt, card.usedCents)) + "</strong></span>" +
        '    <span>Disponível: <strong>' + esc(displayMoney(card.availableFmt, card.availableCents)) + "</strong></span>" +
        (pct != null ? '    <span>Utilizado: <strong>' + pct + "%</strong></span>" : "") +
        "  </div>" +
        (card.usedPercent != null
          ? '<div class="limit-bar" role="presentation"><div class="limit-bar__fill ' + barCls +
            '" style="width:' + pct + '%"></div></div>'
          : "") +
        consistencyHtml +
        '  <div class="card-limit-item__links">' +
        '<span><strong>' + card.linkedInvoiceCount + "</strong> fatura(s)</span>" +
        '<span><strong>' + card.linkedPurchaseCount + "</strong> compra(s)</span>" +
        '<span><strong>' + card.futureInstallmentCount + "</strong> parcela(s) futura(s)</span>" +
        "  </div>" +
        (card.linkedPurchaseCount > 0 || card.linkedInvoiceCount > 0
          ? '  <div class="card-limit-item__totals">' +
            (card.consolidatedInvoiceTotalFmt ? "<span>Faturas: " +
              esc(displayMoney(card.consolidatedInvoiceTotalFmt, card.consolidatedInvoiceTotalCents)) + "</span>" : "") +
            (card.purchaseTotalFmt ? "<span>Compras: " +
              esc(displayMoney(card.purchaseTotalFmt, card.purchaseTotalCents)) + "</span>" : "") +
            (card.futureInstallmentTotalFmt && card.futureInstallmentCount > 0
              ? "<span>Parcelas futuras: " +
                esc(displayMoney(card.futureInstallmentTotalFmt, card.futureInstallmentTotalCents)) + "/mês</span>" : "") +
            "  </div>"
          : "") +
        aliasesHtml +
        "</li>"
      );
    });

    return '<ul class="card-limit-grid">' + rows.join("") + "</ul>";
  }

  function renderInvoiceCard(inv) {
    var cls = "invoice-card";
    if (inv.isReference || inv.isStub) cls += " invoice-card--stub invoice-card--reference";
    else if (inv.hasPendingReview) cls += " invoice-card--review";

    var badges = inv.isReference || inv.isStub
      ? '<span class="status-chip status-chip--stub">Referência</span>'
      : statusChip(inv.status);
    if (inv.hasPendingReview) badges += ' <span class="status-chip status-chip--review">Revisão</span>';

    var amountHtml = "";
    if (inv.isReference || inv.isStub) {
      amountHtml =
        '<p class="invoice-amount invoice-amount--reference">Referência de vínculo</p>' +
        '<p class="invoice-stub-note">Referência criada para manter vínculo com transações. Não é uma fatura consolidada.</p>';
    } else {
      var primary = inv.invoicePrimary || {};
      var mainAmount = displayMoney(
        primary.primaryFmt || inv.primaryAmountFmt ||
          (inv.invoiceDisplay && inv.invoiceDisplay.amountDueFmt) ||
          inv.amountDueFmt || inv.totalFmt,
        primary.primaryCents || inv.primaryAmountCents || inv.amountDueCents || inv.totalCents
      );
      var primaryLabel = primary.primaryLabel || inv.primaryAmountLabel || "Total da fatura";
      amountHtml =
        (primary.statusHint || inv.primaryStatusHint
          ? '<p class="invoice-status-hint">' + esc(primary.statusHint || inv.primaryStatusHint) + "</p>"
          : "") +
        '<p class="invoice-amount"><span class="invoice-amount__label">' + esc(primaryLabel) +
        "</span> " + esc(mainAmount) + "</p>";
      var secondaryLines = primary.secondaryLines || inv.primarySecondaryLines || [];
      if (secondaryLines.length) {
        amountHtml += '<div class="invoice-secondary-amounts">' +
          secondaryLines.map(function (line) {
            return '<span class="invoice-secondary-amounts__item">' + esc(line.label) + ": <strong>" +
              esc(displayMoney(line.fmt, line.cents)) + "</strong>" +
              (line.note ? " — " + esc(line.note) : "") + "</span>";
          }).join("") + "</div>";
      }
    }

    var creditHtml = "";
    if (inv.hasCredit) {
      var msg = inv.creditBehavior === "applies_to_next_invoice"
        ? "Saldo positivo de " + displayMoney(inv.creditBalanceFmt, inv.creditBalanceCents) +
          " será abatido da próxima fatura."
        : "Saldo credor de " + displayMoney(inv.creditBalanceFmt, inv.creditBalanceCents) + " (não é receita).";
      creditHtml = '<div class="credit-balance">' + ic("positive", "cfm-icon--success") + " " + esc(msg) + "</div>";
    }

    var reconHtml = "";
    var stmtHtml = "";
    if (!inv.isReference && (inv.invoiceChargesFmt || (inv.invoiceDisplay && inv.invoiceDisplay.chargesFmt))) {
      var disp = inv.invoiceDisplay || {};
      var creditLabel = inv.creditLabel || "Créditos/Pagamentos na fatura";
      var settlementLabel = inv.settlementLabelDisplay || "Liquidação externa/BB";
      stmtHtml =
        '<div class="invoice-statement-summary">' +
        '<span>Encargos/despesas: <strong>' +
          esc(displayMoney(disp.chargesFmt || inv.invoiceChargesFmt, disp.chargesCents || inv.invoiceChargesCents)) + "</strong></span>";
      if (disp.internalCreditsCents > 0) {
        stmtHtml += '<span>' + esc(creditLabel) + ': <strong>' +
          esc(displayMoney(disp.internalCreditsFmt || inv.invoicePaymentsCreditsFmt, disp.internalCreditsCents)) + "</strong></span>";
      }
      if (disp.externalSettlementCents > 0) {
        stmtHtml += '<span>' + esc(settlementLabel) + ': <strong>' +
          esc(displayMoney(disp.externalSettlementFmt || inv.settlementPaymentsFmt, disp.externalSettlementCents)) + "</strong></span>";
      }
      stmtHtml += "</div>";

      if (inv.paymentBreakdownRows && inv.paymentBreakdownRows.length) {
        stmtHtml +=
          '<details class="invoice-breakdown-details">' +
          '<summary class="invoice-breakdown-details__summary">Detalhes de créditos</summary>' +
          '<ul class="invoice-breakdown-list">' +
          inv.paymentBreakdownRows.map(function (row) {
            return '<li>' + esc(row.label) + ": <strong>" + esc(displayMoney(row.fmt, row.cents)) + "</strong></li>";
          }).join("") +
          "</ul></details>";
      }
      if (inv.externalSettlementReference) {
        stmtHtml += '<p class="invoice-stub-note">Referência BB para conciliação futura.</p>';
      }
    }

    var ui = inv.reconciliationUi;
    if (!inv.isReference && ui) {
      var uiCls = ui.cssClass === "ok" ? "reconciliation-ok"
        : ui.cssClass === "gap" ? "reconciliation-gap"
        : ui.cssClass === "partial" ? "reconciliation-partial"
        : "reconciliation-info";
      var uiIcon = ui.severity === "success" ? ic("success", "cfm-icon--success")
        : ui.severity === "warning" ? ic("warning", "cfm-icon--warning") : ic("info", "cfm-icon--info");
      reconHtml =
        '<div class="' + uiCls + '">' + uiIcon + " <strong>" + esc(ui.label) + "</strong> — " +
        esc(ui.message) + "</div>";
      if (inv.isWithinReconciliationTolerance && inv.reconciliationDiffFmt &&
          inv.reconciliationDiff && Math.abs(inv.reconciliationDiff) > 0) {
        reconHtml += '<p class="invoice-recon-tolerance">Diferença informativa: ' +
          esc(displayMoney(inv.reconciliationDiffFmt, inv.reconciliationDiffCents != null
            ? Math.abs(inv.reconciliationDiffCents) : null)) + " (dentro da tolerância).</p>";
      }
    } else if (!inv.isReference && inv.reconciliationPartial) {
      reconHtml = '<div class="reconciliation-partial">' + ic("info", "cfm-icon--info") + " " +
        esc(inv.reconciliationMessage || "Conciliação parcial — nem todas as transações da fatura estão presentes no JSON.") +
        "</div>";
    } else if (!inv.isReference && inv.hasCredit) {
      reconHtml = '<div class="reconciliation-ok">' + ic("positive", "cfm-icon--success") + " " +
        esc(inv.reconciliationMessage || "Saldo credor — não entra na conciliação de compras.") +
        "</div>";
    } else if (!inv.isReference && inv.explainedByPayments && inv.reconciliationMessage) {
      reconHtml = '<div class="reconciliation-ok">' + ic("success", "cfm-icon--success") + " " + esc(inv.reconciliationMessage) + "</div>";
    } else if (!inv.isReference && inv.hasReconciliationGap && inv.reconciliationStatus === "requires_review") {
      var diffLabel = inv.reconciliationDiff > 0 ? "fatura maior que encargos vinculados" : "encargos vinculados maiores que fatura";
      reconHtml = '<div class="reconciliation-gap">' + ic("balance") + " Diferença de " +
        esc(displayMoney(inv.reconciliationDiffFmt, inv.reconciliationDiffCents != null
          ? Math.abs(inv.reconciliationDiffCents) : null)) + " (" + esc(diffLabel) + ")</div>";
    } else if (!inv.isReference && inv.reconciliationStatus === "consistent" && inv.reconciliationMessage) {
      reconHtml = '<div class="reconciliation-ok">' + ic("success", "cfm-icon--success") + " " + esc(inv.reconciliationMessage) +
        (inv.linkedTransactionCount ? " (" + inv.linkedTransactionCount + " transação(ões))" : "") +
        "</div>";
    } else if (!inv.isReference && inv.linkedTransactionCount > 0 && inv.reconciliationMessage) {
      reconHtml = '<div class="reconciliation-ok">' + ic("success", "cfm-icon--success") + " " + esc(inv.reconciliationMessage) +
        " (" + inv.linkedTransactionCount + " transação(ões))</div>";
    } else if (!inv.isReference && inv.linkedTransactionCount > 0) {
      reconHtml = '<div class="reconciliation-ok">' + ic("success", "cfm-icon--success") + " " + inv.linkedTransactionCount + " transação(ões) vinculada(s)</div>";
    } else if (inv.isReference && inv.linkedTransactionCount > 0) {
      reconHtml = '<div class="reconciliation-ok">' + ic("link") + " " + inv.linkedTransactionCount + " transação(ões) vinculada(s)</div>";
    }

    if (!inv.isReference && !ui && inv.reconciliationStatus && inv.reconciliationStatus !== "n/a") {
      var reconStatusLabel = {
        consistent: "Consistente",
        explained_by_payment: "Explicada por pagamento/crédito",
        partial: "Parcial",
        credit_balance: "Saldo credor",
        requires_review: "Requer revisão",
        settled: "Conciliada",
        provisional: "Aberta / provisória"
      };
      var statusText = reconStatusLabel[inv.reconciliationStatus] || inv.reconciliationStatus;
      reconHtml += '<p class="invoice-recon-status invoice-recon-status--' +
        esc(inv.reconciliationStatus) + '">Status: <strong>' + esc(statusText) + "</strong></p>";
    }

    var cardLastFourHtml = inv.cardLastFour
      ? ' <span class="invoice-card__last4">···' + esc(inv.cardLastFour) + "</span>"
      : (inv.cardLastFourMissing ? ' <span class="card-last4-missing">(final não informado)</span>' : "");

    return (
      '<div class="' + cls + '">' +
      '  <div class="invoice-card__header">' +
      '    <div>' +
      '      <p class="invoice-card__card-name">' + esc(inv.cardName) + cardLastFourHtml +
      "      </p>" +
      '      <p class="invoice-card__period">' + esc(fmonth(inv.competenceMonth) || inv.competenceFmt) + "</p>" +
      "    </div>" +
      '    <div class="invoice-card__badges">' + badges + "</div>" +
      "  </div>" +
      amountHtml +
      (inv.isReference && inv.cardName
        ? '<p class="invoice-stub-note">Cartão: <strong>' + esc(inv.cardName) + cardLastFourHtml + "</strong></p>"
        : "") +
      '  <div class="invoice-meta">' +
      (inv.dueDateFmt && !inv.isReference ? '<span class="invoice-meta__item">Vence: <strong>' + esc(inv.dueDateFmt) + "</strong></span>" : "") +
      (inv.closingDateFmt && !inv.isReference ? '<span class="invoice-meta__item">Fecha: <strong>' + esc(inv.closingDateFmt) + "</strong></span>" : "") +
      "  </div>" +
      creditHtml + stmtHtml + reconHtml +
      "</div>"
    );
  }

  function buildInvoiceSection(title, list) {
    if (!list || !list.length) return "";
    return (
      '<section class="invoice-section">' +
      '  <h4 class="report-section__title">' + esc(title) + ' <span class="review-group__count">' + list.length + "</span></h4>" +
      '  <div class="invoice-grid">' + list.map(renderInvoiceCard).join("") + "</div>" +
      "</section>"
    );
  }

  function buildInvoicesTab(report) {
    var groups = report.invoiceGroups;
    var invoices = report.allInvoices;
    if (!invoices || invoices.length === 0) return emptyPanel("Nenhuma fatura encontrada.");

    if (!groups) {
      return '<div class="invoice-grid">' + invoices.map(renderInvoiceCard).join("") + "</div>";
    }

    return (
      buildInvoiceSection("Faturas consolidadas", groups.consolidated) +
      buildInvoiceSection("Faturas abertas", groups.open) +
      buildInvoiceSection("Faturas pagas", groups.paid)
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: TRANSAÇÕES
   * ════════════════════════════════════════════════ */

  function buildTransactionsTab(report) {
    var txList = report.allTransactions;
    if (!txList || txList.length === 0) return emptyPanel("Nenhuma transação encontrada.");

    /* coletar opções de filtro únicas */
    var types    = {}, flows = {}, months = {}, cards = {}, accounts = {};
    txList.forEach(function (tx) {
      if (tx.type)            types[tx.type]                       = TX_TYPE_LABELS[tx.type] || tx.type;
      if (tx.flow)            flows[tx.flow]                       = FLOW_LABELS[tx.flow]    || tx.flow;
      if (tx.competenceMonth) months[tx.competenceMonth]           = true;
      if (tx.cardId    && tx.cardName)    cards[tx.cardId]         = tx.cardName;
      if (tx.accountId && tx.accountName) accounts[tx.accountId]   = tx.accountName;
    });

    function optRows(map) {
      return Object.keys(map).sort().map(function (k) {
        return '<option value="' + esc(k) + '">' + esc(map[k]) + "</option>";
      }).join("");
    }

    var monthOpts = Object.keys(months).sort().map(function (m) {
      return '<option value="' + esc(m) + '">' + esc(fmonth(m)) + "</option>";
    }).join("");

    var hasCards    = Object.keys(cards).length    > 0;
    var hasAccounts = Object.keys(accounts).length > 0;
    var reviewCount = txList.filter(function (tx) { return tx.needsEffectiveReview; }).length;

    var cardSelect = hasCards
      ? '<select class="filter-bar__select" id="tx-filter-card"><option value="">Todos os cartões</option>' + optRows(cards) + '</select>'
      : '<select class="filter-bar__select" id="tx-filter-card" hidden><option value=""></option></select>';

    var accountSelect = hasAccounts
      ? '<select class="filter-bar__select" id="tx-filter-account"><option value="">Todas as contas</option>' + optRows(accounts) + '</select>'
      : '<select class="filter-bar__select" id="tx-filter-account" hidden><option value=""></option></select>';

    var reviewFilter = reviewCount > 0
      ? '<label class="filter-bar__label">' +
        '<input type="checkbox" id="tx-filter-review" /> Apenas itens para revisar (' + reviewCount + ")</label>"
      : '<input type="checkbox" id="tx-filter-review" hidden />';

    return (
      '<div id="tx-compare-panel" class="tx-compare-panel" hidden role="region" aria-label="Comparação de lançamentos"></div>' +
      '<div class="filter-bar">' +
      '  <select class="filter-bar__select" id="tx-filter-type"><option value="">Todos os tipos</option>'          + optRows(types) + '</select>' +
      '  <select class="filter-bar__select" id="tx-filter-flow"><option value="">Todas as direções</option>'       + optRows(flows) + '</select>' +
      '  <select class="filter-bar__select" id="tx-filter-competence"><option value="">Todas as competências</option>' + monthOpts + '</select>' +
      cardSelect + accountSelect + reviewFilter +
      '  <span class="filter-bar__count" id="tx-filter-count"></span>' +
      '</div>' +
      '<div id="tx-list-container"></div>'
    );
  }

  function renderCompareTransactionCard(tx, report, compareHint, contextKind) {
    if (!tx) return "";
    var ignored = isTransactionIgnored(tx.stableRef);
    var cls = "tx-compare-card" + (ignored ? " tx-compare-card--ignored" : "");
    var invoiceText = tx.invoiceLabel
      ? "Fatura " + tx.invoiceLabel
      : "";
    var via = tx.cardName || tx.accountName || "";
    var sem = CFM.importSemantics || {};
    var typeLabel = sem.getTransactionTypeLabel
      ? sem.getTransactionTypeLabel(tx.type, tx)
      : (tx.typeLabel || "");
    var metaParts = [
      displayMoney(tx.amountFmt, tx.amountCents),
      displayDate(tx.dateFmt || tx.date || tx.competenceMonth),
      via,
      invoiceText
    ].filter(Boolean);
    var catLine = tx.categoryLabel || tx.category || "";
    var hint = compareHint || "";
    if (contextKind === "installment_related") {
      hint = "Confira se estas movimentações pertencem ao mesmo parcelamento.";
    } else if (contextKind === "installment_group") {
      hint = "Confira se estas movimentações pertencem ao mesmo parcelamento.";
    } else if (contextKind === "repeated_purchase" && tx.amountFmt) {
      hint = hint || "Mesmo valor — confira se foram compras distintas ou duplicata.";
    }
    return (
      '<article class="' + cls + '" data-tx-ref="' + esc(tx.stableRef) + '">' +
      '  <header class="tx-compare-card__header">' +
      '    <strong class="tx-compare-card__desc">' + esc(tx.description) + "</strong>" +
      (ignored ? ' <span class="status-chip status-chip--other">Ignorada na importação</span>' : "") +
      "  </header>" +
      '  <p class="tx-compare-card__meta">' + esc(metaParts.join(" · ")) + "</p>" +
      (catLine ? '  <p class="tx-compare-card__cat">Categoria: ' + esc(catLine) + "</p>" : "") +
      (typeLabel ? '  <p class="tx-compare-card__cat">Tipo: ' + esc(typeLabel) + "</p>" : "") +
      (tx.installmentLabel
        ? '  <p class="tx-compare-card__inst">' + esc(tx.installmentLabel) + "</p>"
        : "") +
      (tx.merchantDisplayName && tx.merchantDisplayName !== tx.description
        ? '  <p class="tx-compare-card__norm">Nome normalizado: ' + esc(tx.merchantDisplayName) + "</p>"
        : "") +
      (hint ? '  <p class="tx-compare-card__hint">' + esc(hint) + "</p>" : "") +
      "</article>"
    );
  }

  function renderTransactionRows(txList, highlightRefs, compareMode, contextKind) {
    if (!txList || txList.length === 0) {
      return '<p class="report-empty">Nenhuma transação corresponde aos filtros.</p>';
    }
    if (compareMode && compareMode.active) {
      var sem = CFM.importSemantics || {};
      var hint = "";
      if (txList.length >= 2 && sem.getTransactionCompareHint) {
        hint = sem.getTransactionCompareHint(txList[0], txList[1]);
      }
      return (
        '<div class="tx-compare-cards">' +
        txList.map(function (tx) {
          return renderCompareTransactionCard(
            tx,
            currentReport,
            hint,
            compareMode.contextKind || compareMode.mode
          );
        }).join("") +
        "</div>"
      );
    }
    var highlightSet = {};
    (highlightRefs || []).forEach(function (r) { highlightSet[r] = true; });
    var parts = [];
    txList.forEach(function (tx) {
      var cls = "tx-item";
      if (tx.isInvalid)           cls += " tx-item--invalid";
      if (tx.needsEffectiveReview) cls += " tx-item--review";
      if (tx.isInvoiceInternalCredit) cls += " tx-item--invoice-credit";
      else if (tx.isInvoiceSettlement || tx.isCreditCardPayment) cls += " tx-item--settlement";
      if (highlightSet[tx.stableRef]) cls += " tx-item--compare-highlight";

      var via = tx.cardName || tx.accountName || "";
      var invoiceMeta = tx.invoiceLabel
        ? '<span class="tx-item__invoice">Fatura: ' + esc(tx.invoiceLabel) + "</span>"
        : "";

      parts.push(
        '<li class="' + cls + '">' +
        '  <div class="tx-item__main">' +
        '    <span class="tx-item__desc">' + esc(tx.description) + "</span>" +
        '    <span class="tx-item__amount">' + esc(displayMoney(tx.amountFmt, tx.amountCents)) + "</span>" +
        "  </div>" +
        '  <div class="tx-item__tags">' +
        flowBadge(tx.flow) + typeBadge(tx.type, tx) +
        (tx.needsEffectiveReview
          ? '<span class="tx-item__review-flag" title="' + esc(tx.reviewReason) + '">' +
            ic("warning", "cfm-icon--sm cfm-icon--warning") + "</span>"
          : "") +
        "  </div>" +
        '  <div class="tx-item__meta">' +
        '    <span class="tx-item__date">' + esc(displayDate(tx.dateFmt || tx.date || tx.competenceMonth)) + "</span>" +
        (via ? '<span class="tx-item__via">' + esc(via) + "</span>" : "") +
        invoiceMeta +
        "  </div>" +
        "</li>"
      );
    });
    return '<ul class="tx-list">' + parts.join("") + "</ul>";
  }

  function wireTransactionFilters(panel, report, container) {
    var state = {
      type: "", flow: "", competenceMonth: "",
      cardId: "", accountId: "", reviewOnly: false,
      compareRefs: txCompareFilter && txCompareFilter.refs ? txCompareFilter.refs.slice() : null,
      comparePairKey: txCompareFilter && txCompareFilter.pairKey ? txCompareFilter.pairKey : null,
      dupPickerOpen: false
    };

    function clearCompare() {
      state.compareRefs = null;
      state.comparePairKey = null;
      state.dupPickerOpen = false;
      txCompareFilter = null;
      renderComparePanel();
      applyFilters();
    }

    function renderComparePanel() {
      var comparePanel = panel.querySelector("#tx-compare-panel");
      if (!comparePanel) return;
      if (!state.compareRefs || !state.compareRefs.length) {
        comparePanel.hidden = true;
        comparePanel.innerHTML = "";
        return;
      }
      var ctx = (txCompareFilter && txCompareFilter.contextKind) || "repeated_purchase";
      var mode = (txCompareFilter && txCompareFilter.mode) || "";

      if (ctx === "installment_related" || mode === "installment_pair" || mode === "installment_group") {
        comparePanel.hidden = false;
        var instPairKey = state.comparePairKey || (txCompareFilter && txCompareFilter.pairKey) || "";
        var panelTitle = mode === "installment_group"
          ? "Conferindo lançamentos do grupo"
          : "Conferindo par de parcelas";
        var panelSubtitle = mode === "installment_group"
          ? "Confira data, fatura, cartão e parcela de cada lançamento antes de validar."
          : "Compare data, fatura, cartão e parcela antes de validar.";
        comparePanel.innerHTML =
          '<div class="tx-compare-panel__head">' +
          '  <div><h4 class="tx-compare-panel__title">' + esc(panelTitle) + "</h4>" +
          '  <p class="tx-compare-panel__subtitle">' + esc(panelSubtitle) + "</p></div>" +
          "</div>" +
          '<div class="tx-compare-panel__actions">' +
          '  <button type="button" class="btn btn--ghost btn--xs" id="tx-inst-correct"' +
          ' aria-label="Confirmar que as parcelas estão corretas">Parcelas corretas</button>' +
          '  <button type="button" class="btn btn--ghost btn--xs" id="tx-inst-not-group"' +
          ' aria-label="Indicar que não é parcelamento">Não é parcelamento</button>' +
          '  <button type="button" class="btn btn--ghost btn--xs" id="tx-inst-later"' +
          ' aria-label="Revisar par de parcelas depois">Revisar depois</button>' +
          '  <button type="button" class="btn btn--ghost btn--xs" id="tx-compare-clear"' +
          ' aria-label="Limpar comparação de lançamentos">Limpar comparação</button>' +
          "</div>";

        var btnInstCorrect = comparePanel.querySelector("#tx-inst-correct");
        var btnInstNotGroup = comparePanel.querySelector("#tx-inst-not-group");
        var btnInstLater = comparePanel.querySelector("#tx-inst-later");
        var btnInstClear = comparePanel.querySelector("#tx-compare-clear");

        if (btnInstCorrect) btnInstCorrect.addEventListener("click", function () {
          if (instPairKey) {
            dismissedObservations[instPairKey] = true;
            saveDismissedObservations(currentReport);
          }
          clearCompare();
          if (container) refreshSimilaritiesTab(container);
        });
        if (btnInstNotGroup) btnInstNotGroup.addEventListener("click", function () {
          if (instPairKey) observationContextOverrides[instPairKey] = "repeated_purchase";
          clearCompare();
          if (container) refreshSimilaritiesTab(container);
        });
        if (btnInstLater) btnInstLater.addEventListener("click", clearCompare);
        if (btnInstClear) btnInstClear.addEventListener("click", clearCompare);
        return;
      }

      if (ctx !== "repeated_purchase") {
        comparePanel.hidden = true;
        comparePanel.innerHTML = "";
        return;
      }
      comparePanel.hidden = false;
      var dupPickerHtml = "";
      if (state.dupPickerOpen && state.compareRefs.length >= 2) {
        dupPickerHtml =
          '<div class="tx-compare-dup-picker" id="tx-compare-dup-picker">' +
          '  <p class="tx-compare-dup-picker__title">Qual lançamento manter?</p>' +
          '  <div class="tx-compare-dup-picker__actions">' +
          state.compareRefs.map(function (ref) {
            return '<button type="button" class="btn btn--ghost btn--xs tx-dup-keep-btn"' +
              ' data-keep-ref="' + esc(ref) + '" aria-label="Manter este lançamento">Manter este</button>';
          }).join("") +
          state.compareRefs.map(function (ref) {
            return '<button type="button" class="btn btn--ghost btn--xs tx-dup-ignore-btn"' +
              ' data-ignore-ref="' + esc(ref) + '" aria-label="Ignorar este lançamento">Ignorar este</button>';
          }).join("") +
          "  </div></div>";
      }
      comparePanel.innerHTML =
        '<div class="tx-compare-panel__head">' +
        '  <div><h4 class="tx-compare-panel__title">Comparando compras semelhantes</h4>' +
        '  <p class="tx-compare-panel__subtitle">Confira data, valor, cartão e fatura antes de decidir se são compras distintas ou duplicadas.</p></div>' +
        "</div>" +
        '<div class="tx-compare-panel__actions">' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="tx-decide-different"' +
        ' aria-label="Marcar como compras diferentes">São compras diferentes</button>' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="tx-decide-duplicate"' +
        ' aria-label="Marcar como duplicata">É duplicata</button>' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="tx-decide-later"' +
        ' aria-label="Revisar observação depois">Revisar depois</button>' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="tx-compare-clear"' +
        ' aria-label="Limpar comparação de lançamentos">Limpar comparação</button>' +
        "</div>" +
        dupPickerHtml;

      var btnDifferent = comparePanel.querySelector("#tx-decide-different");
      var btnDuplicate = comparePanel.querySelector("#tx-decide-duplicate");
      var btnLater = comparePanel.querySelector("#tx-decide-later");
      var btnClear = comparePanel.querySelector("#tx-compare-clear");

      if (btnDifferent) btnDifferent.addEventListener("click", function () {
        if (state.comparePairKey) {
          dismissedObservations[state.comparePairKey] = true;
          saveDismissedObservations(currentReport);
        }
        clearCompare();
        if (container) refreshSimilaritiesTab(container);
      });
      if (btnDuplicate) btnDuplicate.addEventListener("click", function () {
        state.dupPickerOpen = true;
        renderComparePanel();
      });
      if (btnLater) btnLater.addEventListener("click", clearCompare);
      if (btnClear) btnClear.addEventListener("click", clearCompare);

      comparePanel.querySelectorAll(".tx-dup-keep-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var keepRef = btn.getAttribute("data-keep-ref");
          state.compareRefs.forEach(function (ref) {
            if (ref !== keepRef) markTransactionIgnored(ref);
          });
          if (state.comparePairKey) {
            dismissedObservations[state.comparePairKey] = true;
            saveDismissedObservations(currentReport);
          }
          clearCompare();
          if (container) refreshSimilaritiesTab(container);
        });
      });
      comparePanel.querySelectorAll(".tx-dup-ignore-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          markTransactionIgnored(btn.getAttribute("data-ignore-ref"));
          applyFilters();
        });
      });
    }

    function applyFilters() {
      var sem = CFM.importSemantics || {};
      function txInCompare(tx) {
        if (!state.compareRefs || !state.compareRefs.length) return true;
        for (var c = 0; c < state.compareRefs.length; c++) {
          if (sem.matchTransactionRef && sem.matchTransactionRef(tx, state.compareRefs[c])) return true;
          if (tx.stableRef === state.compareRefs[c]) return true;
        }
        return false;
      }

      var filtered = report.allTransactions.filter(function (tx) {
        if (state.compareRefs && state.compareRefs.length && !txInCompare(tx)) return false;
        if (state.type            && tx.type            !== state.type)            return false;
        if (state.flow            && tx.flow            !== state.flow)            return false;
        if (state.competenceMonth && tx.competenceMonth !== state.competenceMonth) return false;
        if (state.cardId          && tx.cardId          !== state.cardId)          return false;
        if (state.accountId       && tx.accountId       !== state.accountId)       return false;
        if (state.reviewOnly      && !tx.needsEffectiveReview)                         return false;
        return true;
      });

      var countEl = panel.querySelector("#tx-filter-count");
      if (countEl) {
        countEl.textContent = state.compareRefs && state.compareRefs.length
          ? filtered.length + " lançamento(s) na comparação"
          : filtered.length + " de " + report.allTransactions.length + " transações";
      }

      var compareMode = state.compareRefs && state.compareRefs.length
        ? {
          active: true,
          refs: state.compareRefs,
          contextKind: (txCompareFilter && txCompareFilter.contextKind) || "repeated_purchase",
          mode: (txCompareFilter && txCompareFilter.mode) || ""
        }
        : null;
      var listEl = panel.querySelector("#tx-list-container");
      if (listEl) {
        listEl.innerHTML = renderTransactionRows(filtered, state.compareRefs, compareMode, compareMode && compareMode.contextKind);
        if (state.compareRefs && state.compareRefs.length) {
          var first = listEl.querySelector(".tx-compare-card, .tx-item--compare-highlight");
          if (first && first.scrollIntoView) {
            first.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      }
    }

    function wire(id, key) {
      var el = panel.querySelector("#" + id);
      if (el) el.addEventListener("change", function () { state[key] = this.value; applyFilters(); });
    }
    wire("tx-filter-type",       "type");
    wire("tx-filter-flow",       "flow");
    wire("tx-filter-competence", "competenceMonth");
    wire("tx-filter-card",       "cardId");
    wire("tx-filter-account",    "accountId");

    var cb = panel.querySelector("#tx-filter-review");
    if (cb) cb.addEventListener("change", function () { state.reviewOnly = this.checked; applyFilters(); });

    renderComparePanel();
    applyFilters();
  }

  function findTransactionByStableRef(report, ref) {
    if (!report || !ref) return null;
    var sem = CFM.importSemantics || {};
    var list = report.allTransactions || [];
    for (var i = 0; i < list.length; i++) {
      if (sem.matchTransactionRef && sem.matchTransactionRef(list[i], ref)) return list[i];
      if (list[i] && list[i].stableRef === ref) return list[i];
    }
    return null;
  }

  function isTransactionIgnored(ref) {
    return !!(ignoredTransactions && ignoredTransactions[ref]);
  }

  function markTransactionIgnored(ref) {
    if (!ref) return;
    ignoredTransactions[ref] = true;
    saveIgnoredTransactions(currentReport);
  }

  function navigateToCompareTransactions(container, refs, label, pairKey, contextKind, mode) {
    if (!refs || !refs.length) return;
    txCompareFilter = {
      refs: refs.slice(),
      transactionRefs: refs.slice(),
      stableRefs: refs.slice(),
      pairKey: pairKey || null,
      sourceObservationKey: pairKey || null,
      label: label || ("Comparando " + refs.length + " lançamentos da observação"),
      contextKind: contextKind || "repeated_purchase",
      mode: mode || (contextKind === "installment_related" ? "installment_pair" : "purchase")
    };
    renderedTabs.transactions = false;
    activateTab("transactions", container);
  }

  function navigateToCompareInstallmentPair(container, pairKey) {
    var pair = findObservationPair(currentReport, pairKey);
    var refs = getObservationCompareRefs(pair);
    if (!refs.length) return;
    navigateToCompareTransactions(container, refs, null, pairKey, "installment_related", "installment_pair");
  }

  function navigateToAllRelatedInstallments(container) {
    var observations = collectActiveInstallmentObservations(currentReport);
    if (!observations.length) return;
    var sem = CFM.importSemantics || {};
    installmentObservationFilter = sem.buildInstallmentObservationFilter
      ? sem.buildInstallmentObservationFilter(
        observations,
        currentReport.allTransactions || [],
        currentReport.allInstallmentPlans || []
      )
      : { mode: "all_related_observations", observationCount: observations.length, pairKeys: [] };
    renderedTabs.installments = false;
    activateTab("installments", container);
  }

  /* ════════════════════════════════════════════════
   * TAB: REVISÃO
   * ════════════════════════════════════════════════ */

  function buildReviewTab(report) {
    var groups = report.reviewPriorityGroups;
    var confirmGroups = (groups || []).filter(function (g) { return g.id !== "low"; });
    var suggestionGroup = (groups || []).filter(function (g) { return g.id === "low"; })[0];
    var hasConfirm = confirmGroups.some(function (g) { return g.items.length > 0; });
    var hasSuggestions = suggestionGroup && suggestionGroup.items.length > 0;

    if (!hasConfirm && !hasSuggestions) {
      var autoN = (report.autoResolvedReview || []).length;
      return (
        '<div class="review-empty-state">' +
        '  <div class="notice notice--success" role="status">' +
        '    <span>' + ic("success", "cfm-icon--success") + '</span>' +
        '    <span><strong>Tudo certo para importar.</strong> Nenhuma pendência obrigatória.' +
        (autoN > 0 ? " " + autoN + " itens foram classificados automaticamente." : "") +
        "    </span></div></div>"
      );
    }

    if (!hasConfirm && hasSuggestions) {
      var meta = REVIEW_PRIORITY_META.low;
      var itemsHtml = suggestionGroup.items.map(function (item) {
        var entityLabel = item.entityType === "invoice" ? "Fatura" : "Lançamento";
        return (
          '<li class="review-item ' + meta.cls + '">' +
          '  <div class="review-item__header">' +
          '    <span class="review-item__entity">' + esc(entityLabel) + " #" + item.index + "</span>" +
          "  </div>" +
          '  <p class="review-item__desc">' + esc(item.description) + "</p>" +
          '  <p class="review-item__reason">' + esc(item.reason) + "</p>" +
          "</li>"
        );
      }).join("");
      return (
        '<div class="review-empty-state">' +
        '  <div class="notice notice--success" role="status">' +
        '    <span>' + ic("success", "cfm-icon--success") + '</span>' +
        '    <span><strong>Nenhuma pendência obrigatória.</strong> As sugestões abaixo são opcionais e não bloqueiam a importação.</span>' +
        "  </div></div>" +
        '<section class="review-group review-group--suggestions ' + meta.cls + '">' +
        '  <h4 class="review-group__title">' + ic(meta.icon) + " Sugestões opcionais" +
        '    <span class="review-group__count">' + suggestionGroup.items.length + "</span></h4>" +
        '  <ul class="review-list">' + itemsHtml + "</ul></section>"
      );
    }

    return (
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>' + ic("info", "cfm-icon--info") + '</span>' +
      '  <span>Itens abaixo exigem sua atenção antes de importar. Sugestões opcionais aparecem ao final e não bloqueiam.</span>' +
      "</div>" +
      confirmGroups.filter(function (g) { return g.items.length > 0; }).map(function (group) {
        var meta = REVIEW_PRIORITY_META[group.id] || REVIEW_PRIORITY_META.important;
        var itemsHtml = group.items.map(function (item) {
          var entityLabel = item.entityType === "invoice" ? "Fatura" : "Lançamento";
          return (
            '<li class="review-item ' + meta.cls + '">' +
            '  <div class="review-item__header">' +
            '    <span class="review-item__entity">' + esc(entityLabel) + " #" + item.index + "</span>" +
            (item.type ? typeBadge(item.type) : "") +
            (item.flow ? flowBadge(item.flow) : "") +
            "  </div>" +
            '  <p class="review-item__desc">' + esc(item.description) + "</p>" +
            '  <div class="review-item__meta">' +
            (item.amountFmt  ? '<span>Valor: <strong>' + esc(displayMoney(item.amountFmt, item.amountCents)) + "</strong></span>" : "") +
            (item.date       ? '<span>Data: '  + esc(displayDate(item.date))               + "</span>" : "") +
            (item.competence ? '<span>Competência: ' + esc(fmonth(item.competence))   + "</span>" : "") +
            "  </div>" +
            '  <p class="review-item__reason"><strong>Motivo:</strong> ' + esc(item.reason) + "</p>" +
            (item.suggestedActionLabel ?
              '<p class="review-item__action"><strong>Sugestão:</strong> ' + esc(item.suggestedActionLabel) +
              ' <span class="review-item__action-note">(não aplicada automaticamente)</span></p>' : "") +
            "</li>"
          );
        }).join("");

        return (
          '<section class="review-group ' + meta.cls + '">' +
          '  <h4 class="review-group__title">' + ic(meta.icon) + " " + esc(group.label) +
          '    <span class="review-group__count">' + group.items.length + "</span></h4>" +
          '  <ul class="review-list">' + itemsHtml + "</ul>" +
          "</section>"
        );
      }).join("") +
      (hasSuggestions
        ? (function () {
          var meta = REVIEW_PRIORITY_META.low;
          var itemsHtml = suggestionGroup.items.map(function (item) {
            var entityLabel = item.entityType === "invoice" ? "Fatura" : "Transação";
            return (
              '<li class="review-item ' + meta.cls + '">' +
              '  <div class="review-item__header">' +
              '    <span class="review-item__entity">' + esc(entityLabel) + " #" + item.index + "</span>" +
              "  </div>" +
              '  <p class="review-item__desc">' + esc(item.description) + "</p>" +
              '  <p class="review-item__reason"><strong>Motivo:</strong> ' + esc(item.reason) + "</p>" +
              "</li>"
            );
          }).join("");
          return (
            '<section class="review-group review-group--suggestions ' + meta.cls + '">' +
            '  <h4 class="review-group__title">' + ic(meta.icon) + " Sugestões opcionais" +
            '    <span class="review-group__count">' + suggestionGroup.items.length + "</span></h4>" +
            '  <ul class="review-list">' + itemsHtml + "</ul></section>"
          );
        })()
        : "")
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: SEMELHANÇAS
   * ════════════════════════════════════════════════ */

  function buildSimilaritiesTab(report) {
    var obsCounts = countActiveObservations(report);
    var blocking = obsCounts.blocking;
    var attention = obsCounts.attention;
    var infoCount = obsCounts.informational;
    var repeated = filterActiveObservations(report.repeatedPurchases || []);
    var infoInstallments = filterActiveObservations(report.informationalInstallments || []);
    var categoryHints = filterActiveObservations(report.categoryReviewHints || []);
    var sem = CFM.importSemantics || {};
    var banner = sem.buildObservationBanner
      ? sem.buildObservationBanner(blocking, attention, infoCount)
      : {
          noticeClass: blocking > 0 ? "notice--warning" : "notice--info",
          icon: blocking > 0 ? "warning" : "info",
          text: blocking > 0
            ? "Existem pendências que bloqueiam a importação."
            : "Nenhum bloqueio encontrado. " + attention +
              " item(ns) merece(m) atenção e " + infoCount + " são informativos.",
          counts: blocking + " bloqueantes · " + attention + " atenções · " + infoCount + " informativos"
        };

    if (!blocking && !attention && !infoCount) {
      return emptyPanel("Nenhuma observação pendente neste arquivo.");
    }

    var sectionsHtml = SIMILARITY_SECTIONS.map(function (sec) {
      var list = filterActiveObservations(filterObservationsByTier(report[sec.key] || [], "blocking"));
      if (list.length === 0) return "";
      var rows = list.map(function (pair) { return similarityPairRow(pair, sec.title); }).join("");
      return (
        '<section class="report-section similarity-section similarity-section--blocking">' +
        '  <h4 class="report-section__title">' + esc(sec.title) +
        '    <span class="similarity-section__count">' + list.length + "</span></h4>" +
        '  <ul class="similarity-list">' + rows + "</ul></section>"
      );
    }).join("");

    var attentionHtml = ATTENTION_SIMILARITY_SECTIONS.map(function (sec) {
      var list = filterActiveObservations(filterObservationsByTier(report[sec.key] || [], "attention"));
      if (list.length === 0) return "";
      var rows = list.map(function (pair) { return similarityPairRow(pair, sec.title); }).join("");
      return (
        '<section class="report-section similarity-section similarity-section--attention">' +
        '  <h4 class="report-section__title">' + esc(sec.title) +
        '    <span class="similarity-section__count">' + list.length + "</span></h4>" +
        '  <p class="similarity-intro">Sugestões do motor — revise se quiser, mas não bloqueiam a importação.</p>' +
        '  <ul class="similarity-list">' + rows + "</ul></section>"
      );
    }).join("");

    function buildInfoSection(title, list, intro, collapsed) {
      if (!list.length) return "";
      var body =
        (intro ? '<p class="similarity-intro">' + esc(intro) + "</p>" : "") +
        '  <ul class="similarity-list">' +
        list.map(function (pair) { return similarityPairRow(pair, title); }).join("") +
        "</ul>";
      if (collapsed) {
        return (
          '<details class="similarity-details similarity-details--info">' +
          '  <summary class="similarity-details__summary">' + esc(title) +
          '    <span class="similarity-section__count">' + list.length + "</span></summary>" +
          '  <div class="similarity-details__body">' + body + "</div></details>"
        );
      }
      return (
        '<section class="report-section similarity-section similarity-section--info">' +
        '  <h4 class="report-section__title">' + esc(title) +
        '    <span class="similarity-section__count">' + list.length + "</span></h4>" +
        body +
        "</section>"
      );
    }

    function buildInstallmentObservationsSection(list, intro) {
      if (!list.length) return "";
      var globalBtn =
        '<div class="similarity-section__global-actions">' +
        '  <button type="button" class="btn btn--ghost btn--sm obs-view-all-installments"' +
        '   aria-label="Ver todas as parcelas relacionadas das observações">' +
        "Ver todas as parcelas relacionadas</button>" +
        "</div>";
      var body =
        (intro ? '<p class="similarity-intro">' + esc(intro) + "</p>" : "") +
        globalBtn +
        '  <ul class="similarity-list">' +
        list.map(function (pair) { return similarityPairRow(pair, "Parcelas relacionadas"); }).join("") +
        "</ul>";
      return (
        '<details class="similarity-details similarity-details--info">' +
        '  <summary class="similarity-details__summary">Parcelas relacionadas' +
        '    <span class="similarity-section__count">' + list.length + "</span></summary>" +
        '  <div class="similarity-details__body">' + body + "</div></details>"
      );
    }

    var infoHtml =
      buildInstallmentObservationsSection(
        infoInstallments,
        "Parcelas vinculadas para conferência — revise quando quiser, sem bloquear a importação."
      ) +
      buildInfoSection(
        "Categorias a revisar",
        categoryHints,
        "Categoria genérica — ajuste apenas se quiser refinar.",
        true
      ) +
      buildInfoSection(
        "Compras repetidas",
        repeated,
        "Transações legítimas em dias diferentes — não indicam erro.",
        false
      );

    if (!sectionsHtml && !attentionHtml && !infoHtml) {
      return emptyPanel("Nenhuma observação relevante neste arquivo.");
    }

    var noticeMod = blocking > 0 ? "" : " obs-status-banner obs-status-banner--ok";
    return (
      '<div class="notice ' + banner.noticeClass + ' similarity-notice' + noticeMod + '" role="note">' +
      '  <span class="similarity-notice__icon">' +
      ic(banner.icon, blocking > 0 ? "cfm-icon--warning" : "cfm-icon--success") + "</span>" +
      '  <div class="similarity-notice__body">' +
      '    <p class="similarity-notice__title">' + esc(banner.text) + "</p>" +
      '    <p class="similarity-notice__counts">' + esc(banner.counts) + "</p>" +
      "  </div></div>" +
      sectionsHtml + attentionHtml + infoHtml
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: RECORRÊNCIAS
   * ════════════════════════════════════════════════ */

  function buildRecurringTab(report) {
    var rules = report.allRecurringRules;
    if (!rules || rules.length === 0) return emptyPanel("Nenhuma recorrência reconhecida.");

    var rows = rules.map(function (rule) {
      var freqLabel = rule.frequency === "monthly" ? "Mensal" :
                      rule.frequency === "weekly"  ? "Semanal" :
                      rule.frequency === "yearly"  ? "Anual" : rule.frequency || "—";
      var amountLine = rule.hasRecurringAmount
        ? displayMoney(rule.recurringAmountLabel || rule.amountFmt, rule.expectedAmountCents)
        : (rule.recurringAmountLabel || rule.amountFmt || "Valor a confirmar");
      var sem = CFM.importSemantics || {};
      var badges = rule.recurringBadges && rule.recurringBadges.length
        ? rule.recurringBadges
        : (sem.getRecurringRuleBadges ? sem.getRecurringRuleBadges(rule) : []);
      var stateBadges = badges.map(recurringBadgeHtml).join("");
      var impact = rule.recurringImpact || (sem.getRecurringRuleImportImpact
        ? sem.getRecurringRuleImportImpact(rule) : {});
      var nonBlocking = impact.showNonBlockingNote
        ? ' <span class="similarity-item__hint">Não bloqueia a importação</span>'
        : "";

      return (
        '<li class="recurring-item recurring-item--' + esc(rule.recurringDisplay || rule.recurrenceKind || "imported") + '">' +
        '  <div class="recurring-item__header">' +
        '    <span class="recurring-item__desc">' + esc(rule.description) + "</span>" +
        '    ' + flowBadge(rule.flow) + stateBadges + nonBlocking +
        "  </div>" +
        '  <div class="recurring-item__meta">' +
        '<span>' + esc(amountLine) + " · " + esc(freqLabel) +
        (rule.dayOfMonth ? ", dia " + rule.dayOfMonth : "") + "</span>" +
        (rule.accountName ? '<span>Conta: ' + esc(rule.accountName) + "</span>" : "") +
        (rule.cardName    ? '<span>Cartão: ' + esc(rule.cardName)    + "</span>" : "") +
        (rule.categoryLabel || rule.category
          ? '<span>Cat.: ' + esc(rule.categoryLabel || rule.category) + "</span>"
          : "") +
        "  </div>" +
        "</li>"
      );
    });

    return (
      '<ul class="entity-list recurring-list">' + rows.join("") + "</ul>"
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: PARCELAMENTOS
   * ════════════════════════════════════════════════ */

  function buildInstallmentsTab(report) {
    var plans = report.recognizedFinancing || report.allInstallmentPlans;
    if (!plans || plans.length === 0) return emptyPanel("Nenhum parcelamento encontrado.");

    var rows = plans.map(function (plan) {
      var progress = plan.totalInstallments > 0
        ? plan.currentInstallment + "/" + plan.totalInstallments
        : "—";
      var kindChip = plan.kindLabel
        ? '<span class="status-chip ' +
          (plan.isInvoiceInstallment ? "status-chip--open" :
           plan.isFinancing ? "status-chip--paid" : "status-chip--other") + '">' +
          esc(plan.kindLabel) + "</span>"
        : "";
      var remainHtml = plan.remainingMonths != null
        ? '<span>Restantes: <strong>' + plan.remainingMonths + " meses</strong></span>"
        : "";
      var planRef = plan.planStableRef || plan.externalRef || plan.id || "";
      return (
        '<li class="installment-item' +
        (plan.isInvoiceInstallment ? " installment-item--invoice" : "") +
        (plan.isFinancing ? " installment-item--financing" : "") +
        '" data-plan-ref="' + esc(planRef) + '"' +
        ' data-group-key="' + esc(plan.groupKey || "") + '">' +
        '  <div class="installment-item__header">' +
        '    <span class="installment-item__desc">' + esc(plan.description) + "</span>" +
        kindChip +
        "  </div>" +
        '  <div class="installment-item__meta">' +
        '    <span>Parcela: <strong>' + esc(progress) + "</strong></span>" +
        remainHtml +
        '    <span>Valor/parcela: <strong>' + esc(displayMoney(plan.installmentAmtFmt, plan.installmentAmountCents)) + "</strong></span>" +
        (plan.totalAmtFmt ? '    <span>Total: ' + esc(displayMoney(plan.totalAmtFmt, plan.totalAmtCents)) + "</span>" : "") +
        '    ' + flowBadge(plan.flow || "out") +
        (plan.cardName ? '    <span>Cartão: ' + esc(plan.cardName) + (plan.cardLastFour ? " ···" + esc(plan.cardLastFour) : "") + "</span>" : "") +
        (plan.startCompetence ? '    <span>Início: ' + esc(plan.startCompetence) + "</span>" : "") +
        (plan.isInvoiceInstallment ? '    <span>Impacta previsão mensal futura</span>' : "") +
        "  </div>" +
        "</li>"
      );
    });

    return (
      '<div id="inst-compare-panel" class="inst-compare-panel" hidden role="region"' +
      ' aria-label="Conferência de parcelas relacionadas"></div>' +
      '<div id="inst-group-banner" class="inst-group-banner" hidden role="status">' +
      '  <span class="inst-group-banner__text">Filtrando grupo de parcelas relacionado</span>' +
      '  <button type="button" class="btn btn--ghost btn--xs" id="inst-group-banner-clear"' +
      ' aria-label="Limpar filtro de grupo de parcelas">Limpar filtro</button>' +
      "</div>" +
      '<div class="filter-bar filter-bar--installments">' +
      '  <span class="filter-bar__count" id="inst-filter-count"></span>' +
      "</div>" +
      '<ul class="entity-list" id="inst-list-container">' + rows.join("") + "</ul>" +
      '<div id="inst-groups-container" class="inst-groups-container" hidden></div>' +
      '<div id="inst-feedback" class="inst-feedback" hidden role="status"></div>' +
      '<div id="inst-fallback-container" class="inst-fallback-container" hidden></div>'
    );
  }

  function renderInstallmentGroupActionsHtml(group) {
    var sem = CFM.importSemantics || {};
    var txRefs = group.transactionRefs || [];
    var pairKeys = (group.pairKeys || group.observationKeys || []).join(",");
    var actions = sem.getInstallmentGroupCardActions
      ? sem.getInstallmentGroupCardActions(group)
      : ["Marcar grupo como concluído"];
    var parts = [];
    if (actions.indexOf("Comparar este par") >= 0 && txRefs.length === 2) {
      parts.push(
        '<button type="button" class="btn btn--ghost btn--xs inst-group-compare-pair"' +
        ' data-pair-key="' + esc(group.pairKey || "") + '"' +
        ' data-tx-refs="' + esc(txRefs.join(",")) + '"' +
        ' aria-label="Comparar par de parcelas deste grupo">Comparar este par</button>'
      );
    }
    if (actions.indexOf("Ver lançamentos do grupo") >= 0 && txRefs.length > 2) {
      parts.push(
        '<button type="button" class="btn btn--ghost btn--xs inst-group-view-txs"' +
        ' data-pair-key="' + esc(group.pairKey || "") + '"' +
        ' data-tx-refs="' + esc(txRefs.join(",")) + '"' +
        ' aria-label="Ver lançamentos deste grupo">Ver lançamentos do grupo</button>'
      );
    }
    parts.push(
      '<button type="button" class="btn btn--ghost btn--xs inst-group-dismiss-btn"' +
      ' data-group-key="' + esc(group.groupKey || "") + '"' +
      ' data-pair-keys="' + esc(pairKeys) + '"' +
      ' aria-label="Marcar grupo como concluído">Marcar grupo como concluído</button>'
    );
    return '<div class="inst-group-card__actions">' + parts.join("") + "</div>";
  }

  function renderInstallmentDisplayGroupsHtml(groups) {
    if (!groups || !groups.length) {
      return renderInstallmentGroupsEmptyStateHtml();
    }
    return (
      '<ul class="entity-list inst-obs-derived-list">' +
      groups.map(function (group) {
        var txLines = (group.transactions || []).map(function (tx) {
          var meta = [
            displayMoney(tx.amountFmt, tx.amountCents),
            displayDate(tx.dateFmt || tx.date || tx.competenceMonth),
            tx.cardName || "",
            tx.invoiceLabel ? ("Fatura " + tx.invoiceLabel) : "",
            tx.installmentLabel || ""
          ].filter(Boolean).join(" · ");
          return (
            '<li class="inst-obs-derived-tx">' +
            '  <strong>' + esc(tx.description) + "</strong>" +
            '  <span class="inst-obs-derived-tx__meta">' + esc(meta) + "</span>" +
            "</li>"
          );
        }).join("");
        if (group.plan && !txLines) {
          var plan = group.plan;
          txLines =
            '<li class="inst-obs-derived-tx">' +
            '  <strong>' + esc(plan.description) + "</strong>" +
            '  <span class="inst-obs-derived-tx__meta">' +
            esc([
              displayMoney(plan.installmentAmtFmt, plan.installmentAmountCents),
              plan.totalInstallments ? (plan.currentInstallment + "/" + plan.totalInstallments) : "",
              plan.cardName || ""
            ].filter(Boolean).join(" · ")) +
            "</span></li>";
        }
        var dates = [group.date1, group.date2].filter(Boolean).map(displayDate).join(" · ");
        var badge = formatInstallmentGroupBadgeLabel(
          group.badgeLabel || group.fallbackLabel || "Grupo identificado nas observações"
        );
        return (
          '<li class="inst-obs-derived-item inst-group-card installment-item--group-highlight"' +
          ' data-group-key="' + esc(group.groupKey || "") + '"' +
          ' data-pair-key="' + esc(group.pairKey || "") + '">' +
          '  <div class="installment-item__header">' +
          '    <span class="installment-item__desc">' + esc(group.title) + "</span>" +
          '    <span class="status-chip status-chip--other">' + esc(badge) + "</span>" +
          "  </div>" +
          '  <div class="installment-item__meta">' +
          (group.amountFmt ? '    <span>Valor: <strong>' +
            esc(displayMoney(group.amountFmt, group.amountCents)) + "</strong></span>" : "") +
          (dates ? '    <span>Datas: ' + esc(dates) + "</span>" : "") +
          "  </div>" +
          (txLines ? '  <ul class="inst-obs-derived-tx-list">' + txLines + "</ul>" : "") +
          renderInstallmentGroupActionsHtml(group) +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderInstallmentGroupsEmptyStateHtml() {
    return (
      '<div class="inst-all-done-state" role="status">' +
      '  <h4 class="inst-all-done-state__title">Todas as parcelas relacionadas foram conferidas</h4>' +
      '  <p class="inst-all-done-state__text">Não há mais grupos pendentes neste filtro.</p>' +
      '  <div class="inst-all-done-state__actions">' +
      '    <button type="button" class="btn btn--ghost btn--xs" id="inst-go-observations"' +
      ' aria-label="Voltar para aba Observações">Voltar para observações</button>' +
      '    <button type="button" class="btn btn--ghost btn--xs" id="inst-empty-clear-filter"' +
      ' aria-label="Limpar filtro de parcelas">Limpar filtro</button>' +
      "  </div></div>"
    );
  }

  function showInstGroupFeedback(panel, message) {
    var el = panel.querySelector("#inst-feedback");
    if (!el) return;
    el.hidden = false;
    el.textContent = message || "Grupo marcado como concluído.";
    if (showInstGroupFeedback._timer) clearTimeout(showInstGroupFeedback._timer);
    showInstGroupFeedback._timer = setTimeout(function () {
      el.hidden = true;
      el.textContent = "";
    }, 4000);
  }

  function wireInstallmentGroupFilter(panel, report, container) {
    var sem = CFM.importSemantics || {};
    var state = {
      obsFilter: installmentObservationFilter
        ? Object.assign({}, installmentObservationFilter)
        : null
    };

    function clearObsFilter() {
      state.obsFilter = null;
      installmentObservationFilter = null;
      renderInstPanel();
      applyFilter();
    }

    function renderInstPanel() {
      var instPanel = panel.querySelector("#inst-compare-panel");
      var banner = panel.querySelector("#inst-group-banner");
      var bannerText = banner ? banner.querySelector(".inst-group-banner__text") : null;

      if (banner) {
        banner.hidden = !(state.obsFilter && state.obsFilter.mode === "all_related_observations");
      }
      if (bannerText && state.obsFilter && state.obsFilter.mode === "all_related_observations") {
        bannerText.textContent = "Revisando parcelas vinculadas para conferência";
      }

      if (!instPanel) return;
      if (!state.obsFilter || state.obsFilter.mode !== "all_related_observations") {
        instPanel.hidden = true;
        instPanel.innerHTML = "";
        return;
      }

      instPanel.hidden = false;
      instPanel.innerHTML =
        '<div class="inst-compare-panel__head">' +
        '  <div><h4 class="inst-compare-panel__title">Parcelas vinculadas para conferência</h4>' +
        '  <p class="inst-compare-panel__subtitle">Revise cada grupo antes de validar a importação. O arquivo JSON não será alterado.</p></div>' +
        "</div>" +
        '<div class="inst-compare-panel__actions">' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="inst-dismiss-all"' +
        ' aria-label="Marcar todas as observações de parcelas como conferidas">Marcar todas como conferidas</button>' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="inst-decide-later"' +
        ' aria-label="Revisar parcelas depois">Revisar depois</button>' +
        '  <button type="button" class="btn btn--ghost btn--xs" id="inst-group-clear"' +
        ' aria-label="Limpar filtro de parcelas relacionadas">Limpar filtro</button>' +
        "</div>";

      var btnDismissAll = instPanel.querySelector("#inst-dismiss-all");
      var btnLater = instPanel.querySelector("#inst-decide-later");
      var btnClear = instPanel.querySelector("#inst-group-clear");

      if (btnDismissAll) btnDismissAll.addEventListener("click", function () {
        var openConfirm = CFM.openAppConfirm;
        if (!openConfirm) return;
        openConfirm({
          title: "Marcar todas como conferidas?",
          message: "Isso remove os avisos de parcelas relacionadas desta importação. O arquivo JSON não será alterado.",
          confirmLabel: "Marcar todas",
          cancelLabel: "Cancelar",
          tone: "warning",
          triggerEl: btnDismissAll
        }).then(function (confirmed) {
          if (!confirmed) return;
          (state.obsFilter.pairKeys || []).forEach(function (pairKey) {
            if (pairKey) dismissedObservations[pairKey] = true;
          });
          saveDismissedObservations(currentReport);
          clearObsFilter();
          if (container) refreshSimilaritiesTab(container);
        });
      });
      if (btnLater) btnLater.addEventListener("click", clearObsFilter);
      if (btnClear) btnClear.addEventListener("click", clearObsFilter);
    }

    function syncObsFilterFromActive() {
      var observations = collectActiveInstallmentObservations(currentReport);
      if (!observations.length) {
        state.obsFilter = null;
        installmentObservationFilter = null;
        return false;
      }
      state.obsFilter = sem.buildInstallmentObservationFilter
        ? sem.buildInstallmentObservationFilter(
          observations,
          report.allTransactions || [],
          report.allInstallmentPlans || []
        )
        : state.obsFilter;
      installmentObservationFilter = state.obsFilter;
      return true;
    }

    function dismissGroupByPairKeys(pairKeysRaw) {
      (pairKeysRaw || "").split(",").filter(Boolean).forEach(function (pairKey) {
        dismissedObservations[pairKey] = true;
      });
      saveDismissedObservations(currentReport);
    }

    function applyFilter() {
      var plans = report.recognizedFinancing || report.allInstallmentPlans || [];
      var listEl = panel.querySelector("#inst-list-container");
      var groupsEl = panel.querySelector("#inst-groups-container");
      var fallbackEl = panel.querySelector("#inst-fallback-container");
      var countEl = panel.querySelector("#inst-filter-count");

      if (!state.obsFilter || state.obsFilter.mode !== "all_related_observations") {
        if (countEl) countEl.textContent = plans.length + " parcelamento(s)";
        if (listEl) {
          listEl.hidden = false;
          listEl.querySelectorAll(".installment-item").forEach(function (item) {
            item.hidden = false;
            item.classList.remove("installment-item--group-highlight");
          });
        }
        if (groupsEl) {
          groupsEl.hidden = true;
          groupsEl.innerHTML = "";
        }
        if (fallbackEl) {
          fallbackEl.hidden = true;
          fallbackEl.innerHTML = "";
        }
        return;
      }

      syncObsFilterFromActive();
      if (!state.obsFilter) {
        clearObsFilter();
        if (container) refreshSimilaritiesTab(container);
        return;
      }

      var allGroups = sem.buildInstallmentDisplayGroups
        ? sem.buildInstallmentDisplayGroups(
          state.obsFilter,
          plans,
          report.allTransactions || [],
          report.allInstallmentPlans || []
        )
        : [];
      var activeGroups = sem.filterActiveInstallmentGroups
        ? sem.filterActiveInstallmentGroups(allGroups, dismissedObservations)
        : allGroups;

      if (listEl) listEl.hidden = true;
      if (fallbackEl) {
        fallbackEl.hidden = true;
        fallbackEl.innerHTML = "";
      }
      if (groupsEl) {
        groupsEl.hidden = false;
        groupsEl.innerHTML = renderInstallmentDisplayGroupsHtml(activeGroups);
      }

      var pendingObs = activeGroups.reduce(function (sum, group) {
        return sum + ((group.pairKeys || group.observationKeys || []).length || 1);
      }, 0);
      if (countEl) {
        if (activeGroups.length) {
          countEl.textContent = activeGroups.length + " grupo(s) pendente(s) · " +
            pendingObs + " ocorrência(s) nas observações";
        } else {
          countEl.textContent = "0 grupo(s) pendente(s)";
        }
      }

      if (groupsEl) {
        var first = groupsEl.querySelector(".inst-group-card, .inst-all-done-state");
        if (first && first.scrollIntoView) {
          first.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }

    function wireGroupActions() {
      if (panel.getAttribute("data-inst-groups-wired") === "1") return;
      panel.setAttribute("data-inst-groups-wired", "1");
      panel.addEventListener("click", function (e) {
        var target = e.target;
        if (!target || !target.closest) return;

        var dismissBtn = target.closest(".inst-group-dismiss-btn");
        if (dismissBtn) {
          dismissGroupByPairKeys(dismissBtn.getAttribute("data-pair-keys") || "");
          showInstGroupFeedback(panel, "Grupo marcado como concluído.");
          applyFilter();
          if (container) refreshSimilaritiesTab(container);
          return;
        }

        var compareBtn = target.closest(".inst-group-compare-pair");
        if (compareBtn) {
          var pairKey = compareBtn.getAttribute("data-pair-key") || "";
          navigateToCompareInstallmentPair(container, pairKey);
          return;
        }

        var viewTxBtn = target.closest(".inst-group-view-txs");
        if (viewTxBtn) {
          var refsRaw = viewTxBtn.getAttribute("data-tx-refs") || "";
          var refs = refsRaw.split(",").filter(Boolean);
          var pk = viewTxBtn.getAttribute("data-pair-key") || "";
          navigateToCompareTransactions(container, refs, null, pk, "installment_related", "installment_group");
          return;
        }

        if (target.closest("#inst-go-observations")) {
          if (container) activateTab("similarities", container);
          return;
        }
        if (target.closest("#inst-empty-clear-filter")) {
          clearObsFilter();
        }
      });
    }

    var bannerClear = panel.querySelector("#inst-group-banner-clear");
    if (bannerClear) bannerClear.addEventListener("click", clearObsFilter);

    wireGroupActions();
    renderInstPanel();
    applyFilter();
  }

  /* ════════════════════════════════════════════════
   * TAB: PRIVACIDADE
   * ════════════════════════════════════════════════ */

  function buildPrivacyTab(report) {
    var alerts = report.privacyAlerts || [];

    var CHECKS = [
      { type: "cpf",         label: "CPF detectado" },
      { type: "card_number", label: "cartão completo detectado" },
      { type: "boleto",      label: "linha digitável detectada" },
      { type: "long_number", label: "sequência numérica sensível detectada" }
    ];

    var checkRows = CHECKS.map(function (chk) {
      var found = alerts.filter(function (a) { return a.type === chk.type; });
      if (found.length === 0) {
        return (
          '<div class="privacy-check privacy-check--ok">' +
          '  <span aria-hidden="true">' + ic("success", "cfm-icon--success") + '</span>' +
          '  <span>Nenhum ' + esc(chk.label) + "</span>" +
          "</div>"
        );
      }
      var items = found.map(function (a) {
        return (
          '<li class="issue-item issue-item--' + (a.severity === "high" ? "error" : "warning") + '">' +
          '  <span>' + (a.severity === "high" ? ic("critical", "cfm-icon--danger") : ic("warning", "cfm-icon--warning")) + "</span> " +
          '<strong>' + esc(a.label) + "</strong> em " +
          "<code>" + esc(a.context) + "</code>" +
          "</li>"
        );
      }).join("");
      return '<ul class="issue-list" style="margin-top:0.5rem">' + items + "</ul>";
    }).join("");

    var c = report.counters || {};

    return (
      '<p class="privacy-intro">Verificação automática de dados sensíveis no arquivo importado.</p>' +
      checkRows
    );
  }

  /* ════════════════════════════════════════════════
   * BUILDERS DE ESTADO
   * ════════════════════════════════════════════════ */

  function buildUploadZone() {
    return (
      '<div class="upload-zone" id="upload-zone" role="region" aria-label="Área de importação de arquivo JSON">' +
      '  <div class="upload-zone__icon" aria-hidden="true">' + ic("file", "cfm-icon--xl") + '</div>' +
      '  <p class="upload-zone__title">Arraste seu arquivo JSON aqui ou selecione no dispositivo.</p>' +
      '  <p class="upload-zone__hint">Formato aceito: exportação Controle Financeiro Mensal (.json)</p>' +
      '  <div class="upload-zone__actions">' +
      '    <label class="btn btn--primary" tabindex="0" role="button" id="import-file-label">' +
      '      Selecionar arquivo' +
      '      <input type="file" accept=".json,application/json"' +
      '             id="import-file" class="sr-only" tabindex="-1" />' +
      '    </label>' +
      "  </div>" +
      "</div>"
    );
  }

  function buildLoadingState() {
    return (
      '<div class="import-state import-state--loading" role="status" aria-live="polite">' +
      '  <span class="import-state__spinner" aria-hidden="true">' + ic("spinner", "cfm-icon--md cfm-icon--spin") + '</span>' +
      "  <span>Lendo, validando e analisando arquivo…</span>" +
      "</div>"
    );
  }

  function buildErrorState(report) {
    var errsHtml = (report.errors || []).map(function (e) {
      return '<li class="issue-item issue-item--error">' + esc(e) + "</li>";
    }).join("");
    return (
      '<div class="import-state import-state--error" role="alert">' +
      '  <div class="import-state__header">' +
      '    <span class="import-state__icon" aria-hidden="true">' + ic("error", "cfm-icon--lg cfm-icon--danger") + '</span>' +
      '    <div><p class="import-state__title">Arquivo não aceito</p>' +
      '    <p class="import-state__meta">' + esc(report.fileName || "") + " · " + esc(report.fileSizeFormatted || "") + "</p></div>" +
      "  </div>" +
      '  <ul class="issue-list" aria-label="Erros">' + errsHtml + "</ul>" +
      "</div>"
    );
  }

  function buildReportHtml(report) {
    var incrementalBanner = "";
    var diffInfo = (report && report.importDiff) || importDiffResult || {};
    if (report && report.legacyBlockedImport) {
      incrementalBanner =
        '<div class="import-incremental-banner notice notice--warning" role="status">' +
        "<strong>Arquivo antigo ou sobreposto detectado</strong>" +
        "<span>Revise antes de importar. Nenhum lançamento será salvo automaticamente.</span>" +
        "<span>" + esc(String(diffInfo.alreadyImportedTransactions.length || 0)) +
        " existente(s), " + esc(String(diffInfo.possibleDuplicates.length || 0)) +
        " possível(is) duplicidade(s), " + esc(String(diffInfo.unsafeLegacyCandidates.length || 0)) +
        " candidato(s) inseguro(s).</span></div>";
    } else if (report && report.incrementalImport && diffInfo) {
      var safeCount = (diffInfo.safeNewTransactions || diffInfo.newTransactions || []).length;
      var alreadyCount = (diffInfo.alreadyImportedTransactions || []).length;
      var possibleCount = (diffInfo.possibleDuplicates || []).length;
      var bannerTitle = report.safeIncremental ? "Importação incremental segura" : "Importação incremental";
      incrementalBanner =
        '<div class="import-incremental-banner notice notice--info" role="status">' +
        "<strong>" + esc(bannerTitle) + "</strong>" +
        "<span>Encontramos " + esc(String(safeCount)) + " lançamento(s) novo(s)." +
        (alreadyCount > 0 || possibleCount > 0
          ? " " + esc(String(alreadyCount)) + " lançamento(s) já existem e " +
            esc(String(possibleCount)) + " possível(is) duplicidade(s) não serão importadas automaticamente."
          : "") +
        "</span></div>";
    }

    var fileMeta = [
      report.source && report.source.institution ? esc(report.source.institution) : "",
      esc(report.fileSizeFormatted || "")
    ].filter(Boolean).join(" · ");
    var fileInfo =
      '<div class="import-file-card" role="region" aria-label="Arquivo importado">' +
      '  <div class="import-file-card__icon" aria-hidden="true">' + ic("file-text") + "</div>" +
      '  <div class="import-file-card__body">' +
      '    <p class="import-file-card__label">Arquivo analisado</p>' +
      '    <p class="import-file-card__name import-file-info__name">' + esc(report.fileName || "") + "</p>" +
      (fileMeta ? '    <p class="import-file-card__meta">' + fileMeta + "</p>" : "") +
      "  </div></div>";

    /* tab nav */
    var obsCountsInit = countActiveObservations(report);
    var tabBtns = TABS.map(function (tab, i) {
      var count = tab.countKey ? (report.counters[tab.countKey] || 0) : 0;
      if (tab.id === "similarities") {
        var badge = obsCountsInit.blocking > 0 ? countBadge(obsCountsInit.blocking) :
          (obsCountsInit.attention > 0 ? countBadge(obsCountsInit.attention) :
          (obsCountsInit.informational > 0
            ? '<span class="tab-badge tab-badge--info" title="' + obsCountsInit.informational +
              ' informativos">' + obsCountsInit.informational + "</span>"
            : ""));
        return (
          '<button class="tab-btn' + (i === 0 ? " is-active" : "") + '"' +
          '  data-tab="' + tab.id + '" role="tab"' +
          '  aria-controls="tab-' + tab.id + '">' +
          esc(tab.label) + badge +
          "</button>"
        );
      }
      var badge = count > 0 ? countBadge(count) : "";
      return (
        '<button class="tab-btn' + (i === 0 ? " is-active" : "") + '"' +
        '  data-tab="' + tab.id + '" role="tab"' +
        '  aria-controls="tab-' + tab.id + '">' +
        esc(tab.label) + badge +
        "</button>"
      );
    }).join("");

    /* tab panels (only summary pre-rendered) */
    var tabPanels = TABS.map(function (tab, i) {
      var content = i === 0 ? buildSummaryTab(report) : "";
      return (
        '<div class="tab-panel' + (i === 0 ? " is-active" : "") + '"' +
        '  id="tab-' + tab.id + '" role="tabpanel">' +
        content +
        "</div>"
      );
    }).join("");

    return (
      '<div class="import-report-container">' +
      incrementalBanner +
      fileInfo +
      '<div class="import-tabs-wrap">' +
      '  <div class="import-tabs-fade import-tabs-fade--left" aria-hidden="true"></div>' +
      '  <nav class="import-tabs" role="tablist" aria-label="Painéis de importação">' +
      tabBtns + "</nav>" +
      '  <div class="import-tabs-fade import-tabs-fade--right" aria-hidden="true"></div>' +
      "</div>" +
      '<div class="tab-panels">' + tabPanels + "</div>" +
      "</div>"
    );
  }

  function canConfirmImport(report) {
    if (!report || report.state === "error") return false;
    if (report.legacyBlockedImport) return false;
    if (importDiffResult && importDiffResult.blockedSave) return false;
    if (report.overallStatus === "has_blockers") return false;
    var obs = countActiveObservations(report);
    if (obs.blocking > 0) return false;
    var c = report.counters || {};
    if ((c.blockingConfirmCount || 0) > 0) return false;
    if (report.incrementalImport && importDiffResult &&
        importDiffResult.status === "incremental" && importDiffResult.safeIncremental === false) {
      return false;
    }
    return true;
  }

  function formatSaveCounts(counts) {
    if (!counts) return "";
    var parts = [];
    if (counts.transactions != null) parts.push(counts.transactions + " lançamentos");
    if (counts.cards != null) parts.push(counts.cards + " cartões");
    if (counts.invoices != null) parts.push(counts.invoices + " faturas");
    if (counts.installmentPlans != null) parts.push(counts.installmentPlans + " parcelas");
    if (counts.recurringRules != null) parts.push(counts.recurringRules + " recorrências");
    return parts.join(", ");
  }

  function buildActions(report, ui) {
    ui = ui || {};
    var canConfirm = canConfirmImport(report);
    var saving = !!ui.saving;
    var saved = !!ui.saved;
    var confirmDisabled = !canConfirm || saving || saved;
    var confirmTitle = "";
    if (!report) {
      confirmTitle = "Selecione um arquivo validado";
    } else if (saved) {
      confirmTitle = "Importação já salva nesta sessão";
    } else if (!canConfirm) {
      confirmTitle = "Resolva pendências bloqueantes antes de confirmar";
    }

    var confirmLabel = saving ? "Salvando…" : (saved ? "Importação salva" : "Confirmar importação");
    var noteHtml = "";
    if (saved && ui.savedCounts) {
      var successTitle = ui.incremental
        ? "Importação incremental concluída"
        : "Importação concluída";
      var successBody = ui.incremental && ui.addedCount != null
        ? esc(String(ui.addedCount)) + " novo(s) lançamento(s) salvo(s)."
        : "Salvos localmente: " + esc(formatSaveCounts(ui.savedCounts)) + ".";
      noteHtml =
        '<div class="import-save-success notice notice--success" role="status">' +
        "<strong>" + successTitle + "</strong>" +
        "<span>" + successBody + "</span>" +
        "</div>";
    } else if (ui.saveError) {
      noteHtml = '<p class="import-actions__note import-actions__note--error">' + esc(ui.saveError) + "</p>";
    } else if (report && canConfirm && report.incrementalImport && report.safeIncremental) {
      noteHtml = '<p class="import-actions__note">Somente os lançamentos novos seguros serão mesclados ao armazenamento local.</p>';
    } else if (report && report.legacyBlockedImport) {
      noteHtml = '<p class="import-actions__note">Arquivo antigo ou sobreposto detectado. Revise antes de importar.</p>';
    } else if (report && importDiffResult && importDiffResult.blockedSave) {
      noteHtml = '<p class="import-actions__note">Confirmação desabilitada até revisar conflitos e sobreposições.</p>';
    } else if (report && canConfirm) {
      noteHtml = '<p class="import-actions__note">Os dados aprovados serão salvos no navegador (localStorage).</p>';
    } else if (report) {
      noteHtml = '<p class="import-actions__note">Resolva pendências bloqueantes para habilitar a confirmação.</p>';
    }

    return (
      '<div class="import-actions import-actions-bar" role="group" aria-label="Ações da importação">' +
      '  <button type="button" class="btn btn--ghost" id="import-clear">Limpar importação</button>' +
      '  <button type="button" class="btn btn--primary" id="import-confirm"' +
      (confirmDisabled ? ' disabled aria-disabled="true"' : "") +
      (confirmTitle ? ' title="' + esc(confirmTitle) + '"' : "") +
      ">" + confirmLabel + "</button>" +
      noteHtml +
      "</div>"
    );
  }

  /* ════════════════════════════════════════════════
   * GERENCIAMENTO DE ESTADO
   * ════════════════════════════════════════════════ */

  var currentReport         = null;
  var baseReport            = null;
  var importDiffResult      = null;
  var renderedTabs          = {};
  var dismissedObservations = {};
  var txCompareFilter       = null;
  var installmentObservationFilter = null;
  var ignoredTransactions   = {};
  var changedExistingDecisions = {};
  var observationContextOverrides = {};
  var importerContainerRef  = null;
  var importSaveUi          = { saved: false, saving: false, saveError: null, savedCounts: null };

  function dismissedStorageKey(report) {
    return "cfm-import-dismissed:" + (report && report.fileName ? report.fileName : "unknown");
  }

  function loadDismissedObservations(report) {
    dismissedObservations = {};
    if (!report || !report.fileName) return;
    try {
      var raw = sessionStorage.getItem(dismissedStorageKey(report));
      if (raw) dismissedObservations = JSON.parse(raw) || {};
    } catch (e) {
      dismissedObservations = {};
    }
  }

  function saveDismissedObservations(report) {
    if (!report || !report.fileName) return;
    try {
      sessionStorage.setItem(dismissedStorageKey(report), JSON.stringify(dismissedObservations));
    } catch (e) { /* ignore quota / private mode */ }
    refreshImportActions();
  }

  function ignoredStorageKey(report) {
    return "cfm-import-ignored:" + (report && report.fileName ? report.fileName : "unknown");
  }

  function loadIgnoredTransactions(report) {
    ignoredTransactions = {};
    if (!report || !report.fileName) return;
    try {
      var raw = sessionStorage.getItem(ignoredStorageKey(report));
      if (raw) ignoredTransactions = JSON.parse(raw) || {};
    } catch (e) {
      ignoredTransactions = {};
    }
  }

  function saveIgnoredTransactions(report) {
    if (!report || !report.fileName) return;
    try {
      sessionStorage.setItem(ignoredStorageKey(report), JSON.stringify(ignoredTransactions));
    } catch (e) { /* ignore */ }
    refreshImportActions();
  }

  function refreshImportActions() {
    if (!importerContainerRef) return;
    setActions(importerContainerRef, buildActions(currentReport, importSaveUi));
    wireActions(importerContainerRef);
  }

  function getImportDecisions() {
    return {
      ignoredTransactions: ignoredTransactions,
      dismissedObservations: dismissedObservations,
      changedExistingDecisions: changedExistingDecisions
    };
  }

  function applyImportSaveResult(container, result) {
    if (result.ok) {
      importSaveUi = {
        saved: true,
        saving: false,
        saveError: null,
        savedCounts: result.counts || null,
        incremental: !!result.incremental,
        addedCount: result.addedCounts && result.addedCounts.transactions != null
          ? result.addedCounts.transactions
          : null
      };
    } else if (result.noNewOccurrences) {
      importSaveUi = {
        saved: false,
        saving: false,
        saveError: null,
        savedCounts: null
      };
      if (result.legacyOverlap) {
        showLegacyOverlapModal(container);
      } else {
        showNoNewOccurrencesModal(container);
      }
    } else {
      importSaveUi = {
        saved: false,
        saving: false,
        saveError: result.error || "Não foi possível salvar a importação.",
        savedCounts: null
      };
    }
    refreshImportActions();
  }

  function showLegacyOverlapModal(container, options) {
    options = options || {};
    if (!CFM.openAppConfirm) {
      if (options.resetAfter !== false) resetToIdle(container);
      return;
    }
    CFM.openAppConfirm({
      title: "Arquivo antigo já contemplado",
      message: "Este arquivo parece uma versão anterior de dados já importados. Nenhum lançamento seguro para importar foi encontrado. Nada será duplicado.",
      confirmLabel: "Entendi",
      tone: "warning",
      acknowledgeOnly: true
    }).then(function () {
      if (options.resetAfter !== false) resetToIdle(container);
    });
  }

  function showNoNewOccurrencesModal(container, options) {
    options = options || {};
    if (!CFM.openAppConfirm) {
      if (options.resetAfter !== false) resetToIdle(container);
      return;
    }
    CFM.openAppConfirm({
      title: "Arquivo já importado",
      message: "Este arquivo não possui novos lançamentos. Nada será duplicado.",
      confirmLabel: "Entendi",
      tone: "neutral",
      acknowledgeOnly: true
    }).then(function () {
      if (options.resetAfter !== false) resetToIdle(container);
    });
  }

  function processImportDiff(report, container) {
    if (!CFM.importDiff || !CFM.importDiff.analyzeImportDiff) {
      return { handled: false, report: report };
    }
    var diff = CFM.importDiff.analyzeImportDiff(report, {
      ignoredTransactions: ignoredTransactions
    });
    importDiffResult = diff;
    baseReport = report;

    if (diff.status === "no_new_occurrences") {
      setContent(container, buildUploadZone());
      wireUploadZone(container);
      setActions(container, "");
      showNoNewOccurrencesModal(container, { resetAfter: false });
      return { handled: true };
    }

    if (diff.status === "legacy_overlap" || diff.status === "unsafe_legacy_import") {
      setContent(container, buildUploadZone());
      wireUploadZone(container);
      setActions(container, "");
      showLegacyOverlapModal(container, { resetAfter: false });
      return { handled: true };
    }

    if (diff.status === "legacy_overlap_blocked" || diff.status === "requires_review") {
      var blockedReport = CFM.importDiff.buildIncrementalDisplayReport
        ? CFM.importDiff.buildIncrementalDisplayReport(report, diff)
        : Object.assign({}, report, { legacyBlockedImport: true, importDiff: diff });
      return { handled: false, report: blockedReport };
    }

    if (diff.status === "incremental" && CFM.importDiff.buildIncrementalDisplayReport) {
      return {
        handled: false,
        report: CFM.importDiff.buildIncrementalDisplayReport(report, diff)
      };
    }

    return { handled: false, report: report };
  }

  function performImportSave(container) {
    if (!currentReport || !CFM.localStoreService) return;
    if (!canConfirmImport(currentReport)) return;

    importSaveUi = { saved: false, saving: true, saveError: null, savedCounts: null };
    refreshImportActions();

    var decisions = getImportDecisions();
    var reportToSave = baseReport || currentReport;
    var result = CFM.localStoreService.saveImportBatch(reportToSave, decisions);
    applyImportSaveResult(container, result);
  }

  function updateSimilaritiesTabBadge(container, report) {
    if (!report) return;
    var obsCounts = countActiveObservations(report);
    var btn = container.querySelector('[data-tab="similarities"]');
    if (!btn) return;
    var baseLabel = "Observações";
    if (obsCounts.blocking > 0) {
      btn.innerHTML = esc(baseLabel) + countBadge(obsCounts.blocking);
    } else if (obsCounts.attention > 0) {
      btn.innerHTML = esc(baseLabel) + countBadge(obsCounts.attention);
    } else if (obsCounts.informational > 0) {
      btn.innerHTML = esc(baseLabel) +
        '<span class="tab-badge tab-badge--info" title="' + obsCounts.informational +
        ' informativos">' + obsCounts.informational + "</span>";
    } else {
      btn.innerHTML = esc(baseLabel);
    }
  }

  function refreshSimilaritiesTab(container) {
    if (!currentReport) return;
    var panel = container.querySelector("#tab-similarities");
    if (panel) {
      panel.innerHTML = buildSimilaritiesTab(currentReport);
      wireSimilaritiesPanel(panel, container);
    }
    updateSimilaritiesTabBadge(container, currentReport);
  }

  function wireSimilaritiesPanel(panel, container) {
    if (panel.getAttribute("data-obs-wired") === "1") return;
    panel.setAttribute("data-obs-wired", "1");
    panel.addEventListener("click", function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      var compareBtn = target.closest(".obs-compare-btn, .obs-compare-purchase-btn, .obs-compare-installment-pair");
      if (compareBtn) {
        var pairKey = compareBtn.getAttribute("data-pair-key") || "";
        if (compareBtn.classList.contains("obs-compare-installment-pair")) {
          navigateToCompareInstallmentPair(container, pairKey);
          return;
        }
        var refsRaw = compareBtn.getAttribute("data-tx-refs") || "";
        var refs = refsRaw.split(",").filter(Boolean);
        var ctx = compareBtn.classList.contains("obs-compare-purchase-btn")
          ? "repeated_purchase"
          : "generic";
        navigateToCompareTransactions(container, refs, null, pairKey, ctx);
        return;
      }

      var allInstBtn = target.closest(".obs-view-all-installments");
      if (allInstBtn) {
        navigateToAllRelatedInstallments(container);
        return;
      }

      var txLink = target.closest(".obs-tx-link");
      if (txLink) {
        var ref = txLink.getAttribute("data-tx-ref");
        var item = txLink.closest(".similarity-item");
        var itemKey = item ? item.getAttribute("data-pair-key") : "";
        var itemCtx = item ? item.getAttribute("data-context-kind") : "";
        if (itemCtx === "installment_related") {
          navigateToCompareInstallmentPair(container, itemKey);
        } else if (ref) {
          navigateToCompareTransactions(container, [ref], null, itemKey, itemCtx || "repeated_purchase");
        }
        return;
      }

      var dismissBtn = target.closest(".obs-dismiss-btn");
      if (dismissBtn) {
        var pairKey = dismissBtn.getAttribute("data-pair-key");
        if (pairKey) {
          dismissedObservations[pairKey] = true;
          saveDismissedObservations(currentReport);
          refreshSimilaritiesTab(container);
        }
      }
    });
  }

  function setContent(container, html) {
    var el = container.querySelector("#import-content");
    if (el) el.innerHTML = html;
  }

  function setActions(container, html) {
    var el = container.querySelector("#import-actions-wrap");
    if (el) el.innerHTML = html;
  }

  function resetToIdle(container) {
    currentReport = null;
    baseReport = null;
    importDiffResult = null;
    renderedTabs  = {};
    dismissedObservations = {};
    txCompareFilter = null;
    installmentObservationFilter = null;
    observationContextOverrides = {};
    ignoredTransactions = {};
    importSaveUi = { saved: false, saving: false, saveError: null, savedCounts: null };
    var pageEl = container.querySelector(".page--import");
    if (pageEl) pageEl.classList.remove("has-report");
    setContent(container, buildUploadZone());
    setActions(container, "");
    wireUploadZone(container);
  }

  /* ── Lazy tab rendering ── */
  function buildTabContent(tabId, report) {
    switch (tabId) {
      case "summary":      return buildSummaryTab(report);
      case "cards":        return buildCardsTab(report);
      case "invoices":     return buildInvoicesTab(report);
      case "transactions": return buildTransactionsTab(report);
      case "review":       return buildReviewTab(report);
      case "similarities": return buildSimilaritiesTab(report);
      case "recurring":    return buildRecurringTab(report);
      case "installments": return buildInstallmentsTab(report);
      case "privacy":      return buildPrivacyTab(report);
      default:             return '<p class="report-empty">Painel não encontrado.</p>';
    }
  }

  function activateTab(tabId, container) {
    /* deactivate all */
    container.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
    });
    container.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.remove("is-active");
    });

    /* activate target */
    var btn   = container.querySelector('[data-tab="' + tabId + '"]');
    var panel = container.querySelector("#tab-" + tabId);
    if (btn)   { btn.classList.add("is-active"); btn.setAttribute("aria-selected", "true"); }
    if (panel)  panel.classList.add("is-active");

    /* lazy render */
    if (!renderedTabs[tabId] && currentReport) {
      if (panel) {
        panel.innerHTML = buildTabContent(tabId, currentReport);
        renderedTabs[tabId] = true;
        if (tabId === "transactions") wireTransactionFilters(panel, currentReport, container);
        if (tabId === "installments") wireInstallmentGroupFilter(panel, currentReport, container);
        if (tabId === "similarities") wireSimilaritiesPanel(panel, container);
      }
    }
  }

  /* ════════════════════════════════════════════════
   * WIRING DE EVENTOS
   * ════════════════════════════════════════════════ */

  function isJsonFile(file) {
    if (!file) return false;
    var name = String(file.name || "").toLowerCase();
    var type = String(file.type || "").toLowerCase();
    return name.endsWith(".json") || type === "application/json" || type === "text/json";
  }

  function showFileError(container, fileName, errors) {
    setContent(container, buildErrorState({
      fileName: fileName || "",
      fileSizeFormatted: "",
      errors: errors
    }));
    setActions(container, buildActions(null, importSaveUi));
    wireActions(container);
  }

  /** Pipeline comum para arquivo selecionado ou arrastado. */
  function processImportFile(file, container) {
    if (!file) return;

    if (!isJsonFile(file)) {
      showFileError(container, file.name, [
        "Apenas arquivos JSON (.json) são aceitos.",
        "Tipo recebido: " + (file.type || "desconhecido") + "."
      ]);
      return;
    }

    handleFileSelected(file, container);
  }

  function wireFileInput(container) {
    var input = container.querySelector("#import-file");
    var label = container.querySelector("#import-file-label");

    if (input) {
      input.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) processImportFile(file, container);
        e.target.value = "";
      });
    }
    if (label) {
      label.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (input) input.click();
        }
      });
    }
  }

  function wireDropZone(container) {
    var zone = container.querySelector("#upload-zone");
    if (!zone) return;

    var dragCounter = 0;

    function preventDefault(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    zone.addEventListener("dragenter", function (e) {
      preventDefault(e);
      dragCounter++;
      zone.classList.add("is-dragover");
    });

    zone.addEventListener("dragover", function (e) {
      preventDefault(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      zone.classList.add("is-dragover");
    });

    zone.addEventListener("dragleave", function (e) {
      preventDefault(e);
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        zone.classList.remove("is-dragover");
      }
    });

    zone.addEventListener("drop", function (e) {
      preventDefault(e);
      dragCounter = 0;
      zone.classList.remove("is-dragover");

      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;

      if (files.length > 1) {
        showFileError(container, "", [
          "Arraste apenas um arquivo JSON por vez.",
          "Foram detectados " + files.length + " arquivos."
        ]);
        return;
      }

      processImportFile(files[0], container);
    });
  }

  function wireUploadZone(container) {
    wireFileInput(container);
    wireDropZone(container);
  }

  function wireTabScroll(container) {
    var wrap = container.querySelector(".import-tabs-wrap");
    var nav = container.querySelector(".import-tabs");
    if (!wrap || !nav) return;

    function updateFade() {
      var maxScroll = nav.scrollWidth - nav.clientWidth;
      var canScroll = maxScroll > 6;
      wrap.classList.toggle("import-tabs-wrap--scrollable", canScroll);
      wrap.classList.toggle("import-tabs-wrap--start", nav.scrollLeft > 6);
      wrap.classList.toggle("import-tabs-wrap--end", canScroll && nav.scrollLeft < maxScroll - 6);
    }

    nav.addEventListener("scroll", updateFade, { passive: true });
    window.addEventListener("resize", updateFade);
    updateFade();
  }

  function wireTabSystem(container) {
    container.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateTab(btn.getAttribute("data-tab"), container);
      });
    });
    wireTabScroll(container);
  }

  function wireActions(container) {
    importerContainerRef = container;
    var clearBtn = container.querySelector("#import-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () { resetToIdle(container); });
    }
    var confirmBtn = container.querySelector("#import-confirm");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        if (confirmBtn.disabled || importSaveUi.saving || importSaveUi.saved) return;
        performImportSave(container);
      });
    }
    container.querySelectorAll("[data-changed-decision]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ref = btn.getAttribute("data-changed-ref");
        var decision = btn.getAttribute("data-changed-decision");
        if (!ref || !decision) return;
        changedExistingDecisions[ref] = decision;
        if (baseReport && CFM.importDiff && CFM.importDiff.analyzeImportDiff) {
          importDiffResult = CFM.importDiff.analyzeImportDiff(baseReport, getImportDecisions());
          if (currentReport) {
            currentReport.importDiff = importDiffResult;
          }
        }
        refreshImportActions();
      });
    });
  }

  function handleFileSelected(file, container) {
    if (!file) return;
    setContent(container, buildLoadingState());
    setActions(container, "");

    if (!CFM.importService || !CFM.importService.processFile) {
      setContent(container, buildErrorState({ fileName: file.name, fileSizeFormatted: "", errors: ["Serviço de importação não carregado."] }));
      setActions(container, buildActions(null, importSaveUi)); wireActions(container);
      return;
    }

    CFM.importService.processFile(file)
      .then(function (report) {
        loadDismissedObservations(report);
        loadIgnoredTransactions(report);
        txCompareFilter = null;
        installmentObservationFilter = null;
        observationContextOverrides = {};
        importSaveUi = { saved: false, saving: false, saveError: null, savedCounts: null };
        baseReport = null;
        importDiffResult = null;
        currentReport = report;
        renderedTabs  = {};
        renderedTabs["summary"] = true;

        if (report.state === "error") {
          setContent(container, buildErrorState(report));
          container.querySelector(".page--import").classList.remove("has-report");
        } else {
          var diffOutcome = processImportDiff(report, container);
          if (diffOutcome.handled) {
            return;
          }
          currentReport = diffOutcome.report || report;
          setContent(container, buildReportHtml(currentReport));
          var pageEl = container.querySelector(".page--import");
          if (pageEl) pageEl.classList.add("has-report");
          wireTabSystem(container);
        }
        setActions(container, buildActions(currentReport, importSaveUi));
        wireActions(container);
      })
      .catch(function (err) {
        var fmtSize = CFM.formatters && CFM.formatters.formatFileSize ? CFM.formatters.formatFileSize(file.size) : "";
        setContent(container, buildErrorState({
          fileName: file.name,
          fileSizeFormatted: fmtSize,
          errors: [err.message || "Erro ao processar o arquivo."]
        }));
        setActions(container, buildActions(null, importSaveUi));
        wireActions(container);
      });
  }

  /* ════════════════════════════════════════════════
   * RENDER PRINCIPAL
   * ════════════════════════════════════════════════ */

  function render(container) {
    container.innerHTML =
      '<div class="page-view page--import">' +
      '  <header class="page-header page-header--import">' +
      '    <h2 class="page-header__title">Importar extrato</h2>' +
      '    <p class="page-header__desc">Envie seu arquivo JSON para validar lançamentos, cartões e faturas antes de confirmar a importação.</p>' +
      "  </header>" +
      '  <div class="import-local-notice" role="note">' +
      '    <span class="import-local-notice__icon" aria-hidden="true">' + ic("shield-check", "cfm-icon--info") + "</span>" +
      '    <div class="import-local-notice__text">' +
      '      <strong>Validação local</strong>' +
      "      <span>Revise o relatório e confirme para salvar os dados aprovados no navegador.</span>" +
      "    </div></div>" +
      '  <div id="import-content">' + buildUploadZone() + "</div>" +
      '  <div id="import-actions-wrap"></div>' +
      buildIdleTechnicalDetails() +
      "</div>";

    wireUploadZone(container);
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.importer = { render: render };
})(window.CFM);
