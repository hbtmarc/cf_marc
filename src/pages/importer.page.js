/**
 * Página de importação — Fase 0.3.8
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

  var INV_STATUS_LABELS = {
    open:    "Aberta",
    closed:  "Fechada",
    paid:    "Paga",
    pending: "Pendente",
    overdue: "Vencida"
  };

  var OVERALL_STATUS = {
    ready:        { icon: "✅", label: "Arquivo validado",             mod: "ready"        },
    has_pending:  { icon: "📋", label: "Precisa revisar",                mod: "has-pending"  },
    has_blockers: { icon: "❌", label: "Precisa revisar",                mod: "has-blockers" },
    empty:        { icon: "📭", label: "Arquivo sem dados relevantes", mod: "empty"        }
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
    critical:  { cls: "review-priority--critical",  icon: "🚨" },
    important: { cls: "review-priority--important", icon: "⚠️" },
    low:       { cls: "review-priority--low",       icon: "💡" }
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

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmt() { return CFM.formatters || {}; }
  function fcents(c)  { return fmt().formatCurrencyFromCents ? fmt().formatCurrencyFromCents(c) : String(c) + " cts"; }
  function fdate(d)   { return fmt().formatDate  ? fmt().formatDate(d)  : d; }
  function fmonth(m)  { return fmt().formatMonth ? fmt().formatMonth(m) : m; }

  function flowBadge(flow) {
    if (flow === "in")
      return '<span class="flow-badge flow-badge--in">↑ entrada</span>';
    if (flow === "out")
      return '<span class="flow-badge flow-badge--out">↓ saída</span>';
    return '<span class="flow-badge flow-badge--neutral">⇄ neutro</span>';
  }

  function typeBadge(type, tx) {
    var sem = CFM.importSemantics;
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

  function similarityPairRow(pair, groupLabel) {
    var title = pair.classificationLabel || groupLabel || "Observação";
    if (pair.classification === "exact_duplicate") title = "Duplicata exata";
    else if (pair.classification === "probable_duplicate") title = "Duplicata provável";
    else if (pair.classification === "category_review") title = "Categoria a revisar";
    else if (pair.classification === "installment_related" && pair.informational) {
      title = "Parcelas relacionadas";
    }
    return (
      '<li class="similarity-item' + (pair.informational ? " similarity-item--info" : "") + '">' +
      '  <div class="similarity-item__header">' +
      '    <strong>' + esc(title) + "</strong> " +
      observationSeverityBadge(pair) +
      observationExtraBadges(pair) +
      "  </div>" +
      '  <p class="similarity-item__desc">' +
      '"' + esc(pair.description1) + '" · ' + esc(pair.amountFmt || "") +
      (pair.date1 ? " · " + esc(pair.date1) : "") +
      "</p>" +
      '  <p class="similarity-item__desc similarity-item__desc--secondary">' +
      '"' + esc(pair.description2) + '"' +
      (pair.date2 ? " · " + esc(pair.date2) : "") +
      (pair.month2 && pair.month1 !== pair.month2 ? " · " + esc(pair.month2) : "") +
      "</p>" +
      '  <small class="similarity-item__refs">Transações #' + pair.index1 + " e #" + pair.index2 + "</small>" +
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
    if (src.periodStart)  srcRows += '<div class="source-info__row"><dt>Período</dt><dd>'     + esc(src.periodStart)  + " → " + esc(src.periodEnd || "—") + "</dd></div>";
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
        '  <span>✅</span>' +
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
        srcBrief += (src.institution ? " · " : "") + esc(src.periodStart) + " → " + esc(src.periodEnd || "—");
      }
      srcBrief += "</p>";
    }

    return (
      '<section class="summary-hero import-status-banner import-status-banner--' + si.mod + '">' +
      '  <div class="summary-hero__main">' +
      '    <p class="summary-hero__eyebrow">Posso importar com segurança?</p>' +
      '    <p class="summary-hero__title"><span aria-hidden="true">' + si.icon + '</span> ' + esc(si.label) + "</p>" +
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
        '  <p class="summary-card-mini__row"><span>Limite</span><strong>' + esc(card.limitFmt) + "</strong></p>" +
        '  <p class="summary-card-mini__row"><span>Usado</span><strong>' + esc(card.usedFmt) + "</strong></p>" +
        '  <p class="summary-card-mini__row"><span>Disponível</span><strong>' + esc(card.availableFmt) + "</strong></p>" +
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
        '    <span>Limite: <strong>' + esc(card.limitFmt) + "</strong></span>" +
        '    <span>Usado: <strong>' + esc(card.usedFmt) + "</strong></span>" +
        '    <span>Disponível: <strong>' + esc(card.availableFmt) + "</strong></span>" +
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
            (card.consolidatedInvoiceTotalFmt ? "<span>Faturas: " + esc(card.consolidatedInvoiceTotalFmt) + "</span>" : "") +
            (card.purchaseTotalFmt ? "<span>Compras: " + esc(card.purchaseTotalFmt) + "</span>" : "") +
            (card.futureInstallmentTotalFmt && card.futureInstallmentCount > 0
              ? "<span>Parcelas futuras: " + esc(card.futureInstallmentTotalFmt) + "/mês</span>" : "") +
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
      amountHtml = '<p class="invoice-amount">' + esc(inv.amountDueFmt || inv.totalFmt) + "</p>";
    }

    var creditHtml = "";
    if (inv.hasCredit) {
      var msg = inv.creditBehavior === "applies_to_next_invoice"
        ? "Saldo positivo de " + inv.creditBalanceFmt + " será abatido da próxima fatura."
        : "Saldo credor de " + inv.creditBalanceFmt + " (não é receita).";
      creditHtml = '<div class="credit-balance">💚 ' + esc(msg) + "</div>";
    }

    var reconHtml = "";
    var stmtHtml = "";
    if (!inv.isReference && inv.invoiceChargesFmt) {
      stmtHtml =
        '<div class="invoice-statement-summary">' +
        '<span>Encargos: <strong>' + esc(inv.invoiceChargesFmt) + "</strong></span>" +
        (inv.invoicePaymentsCreditsFmt && inv.invoicePaymentsCreditsCents
          ? '<span>Pagamentos/créditos: <strong>' + esc(inv.invoicePaymentsCreditsFmt) + "</strong></span>"
          : "") +
        (inv.settlementPaymentsFmt && inv.settlementPaymentsCents
          ? '<span>Liquidação bancária: <strong>' + esc(inv.settlementPaymentsFmt) + "</strong></span>"
          : "") +
        "</div>";
    }

    var ui = inv.reconciliationUi;
    if (!inv.isReference && ui) {
      var uiCls = ui.cssClass === "ok" ? "reconciliation-ok"
        : ui.cssClass === "gap" ? "reconciliation-gap"
        : ui.cssClass === "partial" ? "reconciliation-partial"
        : "reconciliation-info";
      var uiIcon = ui.severity === "success" ? "✅"
        : ui.severity === "warning" ? "⚠️" : "ℹ️";
      reconHtml =
        '<div class="' + uiCls + '">' + uiIcon + " <strong>" + esc(ui.label) + "</strong> — " +
        esc(ui.message) + "</div>";
      if (inv.isWithinReconciliationTolerance && inv.reconciliationDiffFmt &&
          inv.reconciliationDiff && Math.abs(inv.reconciliationDiff) > 0) {
        reconHtml += '<p class="invoice-recon-tolerance">Diferença informativa: ' +
          esc(inv.reconciliationDiffFmt) + " (dentro da tolerância).</p>";
      }
    } else if (!inv.isReference && inv.reconciliationPartial) {
      reconHtml = '<div class="reconciliation-partial">ℹ️ ' +
        esc(inv.reconciliationMessage || "Conciliação parcial — nem todas as transações da fatura estão presentes no JSON.") +
        "</div>";
    } else if (!inv.isReference && inv.hasCredit) {
      reconHtml = '<div class="reconciliation-ok">💚 ' +
        esc(inv.reconciliationMessage || "Saldo credor — não entra na conciliação de compras.") +
        "</div>";
    } else if (!inv.isReference && inv.explainedByPayments && inv.reconciliationMessage) {
      reconHtml = '<div class="reconciliation-ok">✅ ' + esc(inv.reconciliationMessage) + "</div>";
    } else if (!inv.isReference && inv.hasReconciliationGap && inv.reconciliationStatus === "requires_review") {
      var diffLabel = inv.reconciliationDiff > 0 ? "fatura maior que encargos vinculados" : "encargos vinculados maiores que fatura";
      reconHtml = '<div class="reconciliation-gap">⚖️ Diferença de ' +
        esc(inv.reconciliationDiffFmt) + " (" + esc(diffLabel) + ")</div>";
    } else if (!inv.isReference && inv.reconciliationStatus === "consistent" && inv.reconciliationMessage) {
      reconHtml = '<div class="reconciliation-ok">✅ ' + esc(inv.reconciliationMessage) +
        (inv.linkedTransactionCount ? " (" + inv.linkedTransactionCount + " transação(ões))" : "") +
        "</div>";
    } else if (!inv.isReference && inv.linkedTransactionCount > 0 && inv.reconciliationMessage) {
      reconHtml = '<div class="reconciliation-ok">✅ ' + esc(inv.reconciliationMessage) +
        " (" + inv.linkedTransactionCount + " transação(ões))</div>";
    } else if (!inv.isReference && inv.linkedTransactionCount > 0) {
      reconHtml = '<div class="reconciliation-ok">✅ ' + inv.linkedTransactionCount + " transação(ões) vinculada(s)</div>";
    } else if (inv.isReference && inv.linkedTransactionCount > 0) {
      reconHtml = '<div class="reconciliation-ok">🔗 ' + inv.linkedTransactionCount + " transação(ões) vinculada(s)</div>";
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
      '      <p class="invoice-card__period">' + esc(inv.competenceFmt) + "</p>" +
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

    var stubNotice = (groups.reference && groups.reference.length)
      ? '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
        '  <span>ℹ️</span>' +
        '  <span>Algumas entradas são referências de vínculo — não representam faturas consolidadas.</span>' +
        "</div>"
      : "";

    return (
      stubNotice +
      buildInvoiceSection("Faturas consolidadas", groups.consolidated) +
      buildInvoiceSection("Faturas abertas", groups.open) +
      buildInvoiceSection("Faturas pagas", groups.paid) +
      buildInvoiceSection("Faturas de referência / stub", groups.reference)
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
      return '<option value="' + esc(m) + '">' + esc(m) + "</option>";
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

  function renderTransactionRows(txList) {
    if (!txList || txList.length === 0) {
      return '<p class="report-empty">Nenhuma transação corresponde aos filtros.</p>';
    }
    var parts = [];
    txList.forEach(function (tx) {
      var cls = "tx-item";
      if (tx.isInvalid)           cls += " tx-item--invalid";
      if (tx.needsEffectiveReview) cls += " tx-item--review";
      if (tx.isInvoiceSettlement || tx.isCreditCardPayment) cls += " tx-item--settlement";

      var via = tx.cardName || tx.accountName || "";

      parts.push(
        '<li class="' + cls + '">' +
        '  <div class="tx-item__main">' +
        '    <span class="tx-item__desc">' + esc(tx.description) + "</span>" +
        '    <span class="tx-item__amount">' + esc(tx.amountFmt) + "</span>" +
        "  </div>" +
        '  <div class="tx-item__tags">' +
        flowBadge(tx.flow) + typeBadge(tx.type, tx) +
        (tx.needsEffectiveReview ? '<span class="tx-item__review-flag" title="' + esc(tx.reviewReason) + '">⚠</span>' : "") +
        "  </div>" +
        '  <div class="tx-item__meta">' +
        '    <span class="tx-item__date">' + esc(tx.date || tx.competenceMonth) + "</span>" +
        (via ? '<span class="tx-item__via">' + esc(via) + "</span>" : "") +
        (tx.invoiceId ? '<span class="tx-item__invoice">Fatura: ' + esc(tx.invoiceId) + "</span>" : "") +
        "  </div>" +
        "</li>"
      );
    });
    return '<ul class="tx-list">' + parts.join("") + "</ul>";
  }

  function wireTransactionFilters(panel, report) {
    var state = {
      type: "", flow: "", competenceMonth: "",
      cardId: "", accountId: "", reviewOnly: false
    };

    function applyFilters() {
      var filtered = report.allTransactions.filter(function (tx) {
        if (state.type            && tx.type            !== state.type)            return false;
        if (state.flow            && tx.flow            !== state.flow)            return false;
        if (state.competenceMonth && tx.competenceMonth !== state.competenceMonth) return false;
        if (state.cardId          && tx.cardId          !== state.cardId)          return false;
        if (state.accountId       && tx.accountId       !== state.accountId)       return false;
        if (state.reviewOnly      && !tx.needsEffectiveReview)                         return false;
        return true;
      });

      var countEl = panel.querySelector("#tx-filter-count");
      if (countEl) countEl.textContent = filtered.length + " de " + report.allTransactions.length + " transações";

      var listEl = panel.querySelector("#tx-list-container");
      if (listEl) listEl.innerHTML = renderTransactionRows(filtered);
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

    applyFilters();
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
        '    <span>✅</span>' +
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
        '    <span>✅</span>' +
        '    <span><strong>Nenhuma pendência obrigatória.</strong> As sugestões abaixo são opcionais e não bloqueiam a importação.</span>' +
        "  </div></div>" +
        '<section class="review-group review-group--suggestions ' + meta.cls + '">' +
        '  <h4 class="review-group__title">' + meta.icon + " Sugestões opcionais" +
        '    <span class="review-group__count">' + suggestionGroup.items.length + "</span></h4>" +
        '  <ul class="review-list">' + itemsHtml + "</ul></section>"
      );
    }

    return (
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>ℹ️</span>' +
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
            (item.amountFmt  ? '<span>Valor: <strong>' + esc(item.amountFmt)  + "</strong></span>" : "") +
            (item.date       ? '<span>Data: '  + esc(item.date)               + "</span>" : "") +
            (item.competence ? '<span>Competência: ' + esc(item.competence)   + "</span>" : "") +
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
          '  <h4 class="review-group__title">' + meta.icon + " " + esc(group.label) +
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
            '  <h4 class="review-group__title">' + meta.icon + " Sugestões opcionais" +
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
    var c = report.counters || {};
    var blocking = c.blockingSimilarityCount || 0;
    var attention = c.attentionSimilarityCount || 0;
    var infoCount = c.informationalSimilarityCount || 0;
    var repeated = report.repeatedPurchases || [];
    var infoInstallments = report.informationalInstallments || [];
    var categoryHints = report.categoryReviewHints || [];
    var sem = CFM.importSemantics || {};
    var banner = sem.buildObservationBanner
      ? sem.buildObservationBanner(blocking, attention, infoCount)
      : {
          noticeClass: blocking > 0 ? "notice--warning" : "notice--info",
          icon: blocking > 0 ? "⚠️" : "ℹ️",
          text: blocking > 0
            ? "Existem pendências que bloqueiam a importação."
            : "Nenhum bloqueio encontrado. " + attention +
              " item(ns) merece(m) atenção e " + infoCount + " são informativos.",
          counts: blocking + " bloqueantes · " + attention + " atenções · " + infoCount + " informativos"
        };

    if (!blocking && !attention && !infoCount && repeated.length === 0 &&
        infoInstallments.length === 0 && categoryHints.length === 0) {
      return emptyPanel("Nenhuma observação relevante neste arquivo.");
    }

    var sectionsHtml = SIMILARITY_SECTIONS.map(function (sec) {
      var list = filterObservationsByTier(report[sec.key] || [], "blocking");
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
      var list = filterObservationsByTier(report[sec.key] || [], "attention");
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

    var infoHtml =
      buildInfoSection(
        "Parcelas relacionadas",
        infoInstallments,
        "Parcelas vinculadas a plano consistente — não indicam erro.",
        true
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

    return (
      '<div class="notice ' + banner.noticeClass + ' similarity-notice" role="note">' +
      '  <span>' + banner.icon + '</span>' +
      '  <span><strong>' + esc(banner.text) + '</strong> ' + esc(banner.counts) + ".</span>" +
      "</div>" +
      sectionsHtml + attentionHtml + infoHtml
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: RECORRÊNCIAS
   * ════════════════════════════════════════════════ */

  function buildRecurringTab(report) {
    var rules = report.allRecurringRules;
    if (!rules || rules.length === 0) return emptyPanel("Nenhuma recorrência reconhecida.");

    var SOURCE_LABELS = {
      imported_json:    "Importada do JSON",
      personal_local:   "Regra pessoal local",
      example:          "Regra de exemplo",
      engine_suggested: "Sugerida pelo motor"
    };

    var RECURRENCE_KIND = {
      imported:       "Importada",
      personal_rule:  "Regra pessoal",
      candidate:      "Candidata"
    };

    var rows = rules.map(function (rule) {
      var freqLabel = rule.frequency === "monthly" ? "Mensal" :
                      rule.frequency === "weekly"  ? "Semanal" :
                      rule.frequency === "yearly"  ? "Anual" : rule.frequency || "—";
      var activeChip = rule.isActive
        ? '<span class="status-chip status-chip--paid">Ativa</span>'
        : '<span class="status-chip status-chip--other">Inativa</span>';
      var sourceLabels = rule.sourceLabels && rule.sourceLabels.length
        ? rule.sourceLabels
        : (rule.source
          ? [SOURCE_LABELS[rule.source] || rule.sourceLabel || rule.source]
          : (rule.sourceLabel ? [rule.sourceLabel] : []));
      var sourceChips = sourceLabels.map(function (lbl) {
        return ' <span class="status-chip status-chip--open">' + esc(lbl) + "</span>";
      }).join("");
      var kindLabel = rule.recurrenceKind === "merged"
        ? "Reconhecida"
        : (RECURRENCE_KIND[rule.recurrenceKind] || "");

      return (
        '<li class="recurring-item recurring-item--' + esc(rule.recurrenceKind || "imported") + '">' +
        '  <div class="recurring-item__header">' +
        '    <span class="recurring-item__desc">' + esc(rule.description) + "</span>" +
        '    ' + flowBadge(rule.flow) + " " + activeChip +
        sourceChips +
        (kindLabel && rule.recurrenceKind !== "merged"
          ? ' <span class="status-chip status-chip--other">' + esc(kindLabel) + "</span>"
          : "") +
        "  </div>" +
        '  <div class="recurring-item__meta">' +
        '<span>' + esc(rule.amountFmt) + '</span>' +
        '<span>' + esc(freqLabel) + (rule.dayOfMonth ? ", dia " + rule.dayOfMonth : "") + "</span>" +
        (rule.accountName ? '<span>Conta: ' + esc(rule.accountName) + "</span>" : "") +
        (rule.cardName    ? '<span>Cartão: ' + esc(rule.cardName)    + "</span>" : "") +
        (rule.categoryLabel || rule.category
          ? '<span>Cat.: ' + esc(rule.categoryLabel || rule.category) + "</span>"
          : "") +
        (rule.confidence  ? '<span>Confiança: ' + esc(String(rule.confidence)) + "</span>" : "") +
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
      var sourceHtml = plan.sourceLabel
        ? '<span>Origem: ' + esc(plan.sourceLabel) + "</span>"
        : "";

      return (
        '<li class="installment-item' +
        (plan.isInvoiceInstallment ? " installment-item--invoice" : "") +
        (plan.isFinancing ? " installment-item--financing" : "") + '">' +
        '  <div class="installment-item__header">' +
        '    <span class="installment-item__desc">' + esc(plan.description) + "</span>" +
        kindChip +
        "  </div>" +
        '  <div class="installment-item__meta">' +
        '    <span>Parcela: <strong>' + esc(progress) + "</strong></span>" +
        remainHtml +
        '    <span>Valor/parcela: <strong>' + esc(plan.installmentAmtFmt || "—") + "</strong></span>" +
        (plan.totalAmtFmt ? '    <span>Total: ' + esc(plan.totalAmtFmt) + "</span>" : "") +
        '    ' + flowBadge(plan.flow || "out") +
        (plan.cardName ? '    <span>Cartão: ' + esc(plan.cardName) + (plan.cardLastFour ? " ···" + esc(plan.cardLastFour) : "") + "</span>" : "") +
        (plan.startCompetence ? '    <span>Início: ' + esc(plan.startCompetence) + "</span>" : "") +
        sourceHtml +
        (plan.isInvoiceInstallment ? '    <span>Impacta previsão mensal futura</span>' : "") +
        "  </div>" +
        "</li>"
      );
    });

    return '<ul class="entity-list">' + rows.join("") + "</ul>";
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
          '  <span aria-hidden="true">✅</span>' +
          '  <span>Nenhum ' + esc(chk.label) + "</span>" +
          "</div>"
        );
      }
      var items = found.map(function (a) {
        return (
          '<li class="issue-item issue-item--' + (a.severity === "high" ? "error" : "warning") + '">' +
          '  <span>' + (a.severity === "high" ? "🚨" : "⚠️") + "</span> " +
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
      '  <div class="upload-zone__icon" aria-hidden="true">📄</div>' +
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
      '  <span class="import-state__spinner" aria-hidden="true">⏳</span>' +
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
      '    <span class="import-state__icon" aria-hidden="true">❌</span>' +
      '    <div><p class="import-state__title">Arquivo não aceito</p>' +
      '    <p class="import-state__meta">' + esc(report.fileName || "") + " · " + esc(report.fileSizeFormatted || "") + "</p></div>" +
      "  </div>" +
      '  <ul class="issue-list" aria-label="Erros">' + errsHtml + "</ul>" +
      "</div>"
    );
  }

  function buildReportHtml(report) {
    var fileInfo =
      '<div class="import-file-info">' +
      '  <span class="import-file-info__name">' + esc(report.fileName || "") + "</span>" +
      (report.source && report.source.institution
        ? ' · <span class="import-file-info__bank">' + esc(report.source.institution) + "</span>"
        : "") +
      " · " + esc(report.fileSizeFormatted || "") +
      "</div>";

    /* tab nav */
    var tabBtns = TABS.map(function (tab, i) {
      var count = tab.countKey ? (report.counters[tab.countKey] || 0) : 0;
      if (tab.id === "similarities") {
        var infoN = report.counters.informationalSimilarityCount || 0;
        var badge = count > 0 ? countBadge(count) :
          (infoN > 0 ? '<span class="tab-badge tab-badge--info" title="' + infoN + ' informativas">' + infoN + "</span>" : "");
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

  function buildActions() {
    return (
      '<div class="import-actions import-actions-bar" role="group" aria-label="Ações da importação">' +
      '  <button type="button" class="btn btn--ghost" id="import-clear">Limpar importação</button>' +
      '  <button type="button" class="btn btn--primary" disabled aria-disabled="true"' +
      '          title="Confirmação será liberada após Firebase Auth + RTDB Rules">' +
      "    Confirmar importação" +
      "  </button>" +
      '  <p class="import-actions__note">A confirmação final será liberada em uma fase futura. Nada é gravado agora.</p>' +
      "</div>"
    );
  }

  /* ════════════════════════════════════════════════
   * GERENCIAMENTO DE ESTADO
   * ════════════════════════════════════════════════ */

  var currentReport  = null;
  var renderedTabs   = {};

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
    renderedTabs  = {};
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
        if (tabId === "transactions") wireTransactionFilters(panel, currentReport);
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
    setActions(container, buildActions());
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
    var clearBtn = container.querySelector("#import-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () { resetToIdle(container); });
  }

  function handleFileSelected(file, container) {
    if (!file) return;
    setContent(container, buildLoadingState());
    setActions(container, "");

    if (!CFM.importService || !CFM.importService.processFile) {
      setContent(container, buildErrorState({ fileName: file.name, fileSizeFormatted: "", errors: ["Serviço de importação não carregado."] }));
      setActions(container, buildActions()); wireActions(container);
      return;
    }

    CFM.importService.processFile(file)
      .then(function (report) {
        currentReport = report;
        renderedTabs  = {};  /* summary pré-renderizado pelo buildReportHtml */
        renderedTabs["summary"] = true;

        if (report.state === "error") {
          setContent(container, buildErrorState(report));
          container.querySelector(".page--import").classList.remove("has-report");
        } else {
          setContent(container, buildReportHtml(report));
          var pageEl = container.querySelector(".page--import");
          if (pageEl) pageEl.classList.add("has-report");
          wireTabSystem(container);
        }
        setActions(container, buildActions());
        wireActions(container);
      })
      .catch(function (err) {
        var fmtSize = CFM.formatters && CFM.formatters.formatFileSize ? CFM.formatters.formatFileSize(file.size) : "";
        setContent(container, buildErrorState({
          fileName: file.name,
          fileSizeFormatted: fmtSize,
          errors: [err.message || "Erro ao processar o arquivo."]
        }));
        setActions(container, buildActions());
        wireActions(container);
      });
  }

  /* ════════════════════════════════════════════════
   * RENDER PRINCIPAL
   * ════════════════════════════════════════════════ */

  function render(container) {
    container.innerHTML =
      '<div class="page-view page--import">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Importar extrato</h2>' +
      '    <p class="page-header__desc">Envie seu arquivo JSON para validar lançamentos, cartões e faturas antes de confirmar a importação.</p>' +
      "  </header>" +
      '  <div class="notice notice--warning" role="note">' +
      '    <span aria-hidden="true">⚠</span>' +
      '    <span>Validação local — nada é gravado nesta fase.</span>' +
      "  </div>" +
      '  <div id="import-content">' + buildUploadZone() + "</div>" +
      '  <div id="import-actions-wrap"></div>' +
      buildIdleTechnicalDetails() +
      "</div>";

    wireUploadZone(container);
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.importer = { render: render };
})(window.CFM);
