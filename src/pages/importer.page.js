/**
 * Página de importação — Fase 0.3.6
 * Tabs, semelhanças classificadas, revisão agrupada, assistente financeiro local.
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
    ready:        { icon: "✅", label: "Arquivo validado",                mod: "ready"        },
    has_pending:  { icon: "📋", label: "Pronto para revisar",             mod: "has-pending"  },
    has_blockers: { icon: "❌", label: "Correção necessária",            mod: "has-blockers" },
    empty:        { icon: "📭", label: "Arquivo sem dados relevantes",    mod: "empty"        }
  };

  var SIMILARITY_SECTIONS = [
    { key: "exactDuplicates",     title: "Duplicatas exatas",              informational: false },
    { key: "probableDuplicates",  title: "Duplicatas prováveis",           informational: false },
    { key: "installmentRelated",  title: "Parcelas relacionadas",          informational: false },
    { key: "recurringCandidates", title: "Recorrências candidatas",        informational: false },
    { key: "similarTransfers",    title: "Transferências semelhantes",     informational: false }
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
    { id: "summary",      label: "Resumo",               countKey: null },
    { id: "cards",        label: "Cartões",              countKey: "cards" },
    { id: "invoices",     label: "Faturas",               countKey: "invoices" },
    { id: "transactions", label: "Transações",            countKey: "transactions" },
    { id: "review",       label: "Itens para confirmar",  countKey: "pendingReview" },
    { id: "similarities", label: "Semelhanças",           countKey: "similaritiesTotal" },
    { id: "recurring",    label: "Recorrências",          countKey: "recurringRules" },
    { id: "installments", label: "Parcelamentos",         countKey: "installmentPlans" },
    { id: "privacy",      label: "Privacidade",           countKey: "privacyAlerts" }
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

  function typeBadge(type) {
    var label = TX_TYPE_LABELS[type] || esc(type);
    var cls   = type === "credit_card_payment"  ? "type-badge--payment"  :
                type === "credit_card_purchase" ? "type-badge--purchase" :
                type === "income"               ? "type-badge--credit"   :
                type === "expense"              ? "type-badge--debit"    :
                type === "refund"               ? "type-badge--credit"   :
                type === "fee"                  ? "type-badge--debit"    : "type-badge--other";
    return '<span class="type-badge ' + cls + '">' + esc(label) + '</span>';
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

  function similarityPairRow(pair, groupLabel) {
    var title = pair.classificationLabel || groupLabel || "Semelhança encontrada";
    if (pair.classification === "exact_duplicate") title = "Duplicata exata";
    else if (pair.classification === "probable_duplicate") title = "Duplicata provável";
    else if (pair.classification !== "exact_duplicate" && pair.classification !== "probable_duplicate") {
      title = pair.classificationLabel || "Semelhança encontrada";
    }
    return (
      '<li class="similarity-item">' +
      '  <div class="similarity-item__header">' +
      '    <strong>' + esc(title) + "</strong> " +
      confidenceBadge(pair.confidence) +
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

  function buildSummaryTab(report) {
    var c   = report.counters;
    var src = report.source;
    var si  = OVERALL_STATUS[report.overallStatus] || OVERALL_STATUS.ready;

    /* source info */
    var srcRows = "";
    if (src.institution)  srcRows += '<div class="source-info__row"><dt>Instituição</dt><dd>' + esc(src.institution)  + "</dd></div>";
    if (src.documentType) srcRows += '<div class="source-info__row"><dt>Tipo</dt><dd>'        + esc(src.documentType) + "</dd></div>";
    if (src.periodStart)  srcRows += '<div class="source-info__row"><dt>Período</dt><dd>'     + esc(src.periodStart)  + " → " + esc(src.periodEnd || "—") + "</dd></div>";
    if (src.label)        srcRows += '<div class="source-info__row"><dt>Origem</dt><dd>'      + esc(src.label)        + "</dd></div>";

    /* stat grid */
    var stats = [
      { label: "Contas",       value: c.accounts },
      { label: "Cartões",      value: c.cards },
      { label: "Faturas",      value: c.invoices },
      { label: "Transações",   value: c.transactions },
      { label: "Parcelas",     value: c.installmentPlans },
      { label: "Recorrências", value: c.recognizedRecurrences || c.recurringRules },
      { label: "Válidos",                 value: c.valid,                  mod: "success" },
      { label: "Inválidos",               value: c.invalid,                mod: c.invalid > 0 ? "danger" : "" },
      { label: "Por regra pessoal",       value: c.ruleClassified || 0,    mod: "success" },
      { label: "Auto-resolvidos",         value: c.autoResolved || 0,      mod: "success" },
      { label: "Para confirmar",          value: c.pendingReview,          mod: c.pendingReview > 0 ? "warning" : "" },
      { label: "Sugestões",               value: c.reviewSuggestions || 0, mod: "" },
      { label: "Financiamentos",          value: c.recognizedFinancing || 0, mod: "" },
      { label: "Dup. exatas",             value: c.exactDuplicates || 0,   mod: (c.exactDuplicates || 0) > 0 ? "danger" : "" },
      { label: "Dup. prováveis",          value: c.probableDuplicates || 0,mod: (c.probableDuplicates || 0) > 0 ? "warning" : "" },
      { label: "Semelhanças",             value: c.classifiedSimilarities || 0, mod: "" }
    ];

    var statHtml = stats.map(function (s) {
      var cls = "stat-item" + (s.mod ? " stat-item--" + s.mod : "");
      return '<div class="' + cls + '"><span class="stat-item__value">' + s.value +
             '</span><span class="stat-item__label">' + esc(s.label) + "</span></div>";
    }).join("");

    /* quick status message for summary */
    var statusNote = "";
    if (report.overallStatus === "has_blockers") {
      statusNote = "Corrija os erros estruturais antes de confirmar a importação futura.";
    } else if (report.overallStatus === "has_pending") {
      statusNote = "A maioria dos itens foi classificada automaticamente. Revise apenas os pontos ambíguos.";
    } else {
      statusNote = "Arquivo pronto. Nada é gravado nesta fase.";
    }

    var reimport = report.reimportSimulation || {};
    var reimportCounts = reimport.counts || {};
    var reimportHtml = "";
    if (reimportCounts.already_imported || reimportCounts.exact_duplicate) {
      reimportHtml =
        '<section class="reimport-panel">' +
        '  <h4 class="report-section__title">Simulação de reimportação (idempotência local)</h4>' +
        '  <p class="report-empty" style="font-style:normal;margin:0.5rem 0">' +
        '    Reimportar o mesmo arquivo resultaria em: ' +
        '<strong>' + (reimportCounts.already_imported || 0) + '</strong> já importados, ' +
        '<strong>' + (reimportCounts.exact_duplicate || 0) + '</strong> duplicatas exatas. ' +
        'Nenhum dado é gravado nesta fase.' +
        '  </p></section>';
    }

    var autoResolved = report.autoResolvedReview || [];
    var ruleResolved = report.ruleResolvedReview || [];
    var autoHtml = "";
    var rulesNotice = "";
    if ((c.ruleClassified || 0) > 0 || report.personalRulesLoaded) {
      rulesNotice =
        '<div class="notice notice--success" role="note" style="margin-bottom:1rem">' +
        '  <span>✅</span>' +
        '  <span>Regras pessoais aplicadas localmente (' + (c.ruleClassified || 0) +
        ' classificações). Nada foi gravado nesta fase.</span></div>';
    }
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

    return (
      '<dl class="source-info" style="margin-bottom:1rem">' + srcRows + '</dl>' +
      rulesNotice +
      '<div class="stat-grid">' + statHtml + '</div>' +
      autoHtml + reimportHtml +
      buildSummaryCardsPanel(report) +
      '<p class="report-empty" style="margin-top:0.75rem;font-style:normal">' +
      '<span aria-hidden="true">' + si.icon + '</span> ' +
      esc(si.label) + ' — ' + esc(statusNote) +
      '</p>'
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: FATURAS
   * ════════════════════════════════════════════════ */

  function buildSummaryCardsPanel(report) {
    var cards = report.cardSummaries;
    if (!cards || !cards.length) return "";
    var rows = cards.filter(function (c) { return c.hasSnapshot; }).slice(0, 4).map(function (card) {
      return (
        '<li class="entity-list__item card-summary-line">' +
        '<strong>' + esc(card.name) + '</strong> — ' +
        'Limite ' + esc(card.limitFmt) + ', usado ' + esc(card.usedFmt) +
        ', disp. ' + esc(card.availableFmt) +
        (card.usedPercent != null ? ' (' + card.usedPercent + '%)' : "") +
        "</li>"
      );
    }).join("");
    if (!rows) return "";
    return (
      '<section class="cards-summary-panel">' +
      '  <h4 class="report-section__title">Limites de cartão (snapshot local)</h4>' +
      '  <ul class="entity-list">' + rows + "</ul>" +
      '  <p class="report-empty" style="font-style:normal;margin:0.5rem 0 0">Overlay local — não versionado. Nada gravado nesta fase.</p>' +
      "</section>"
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: CARTÕES
   * ════════════════════════════════════════════════ */

  function buildCardsTab(report) {
    var cards = report.cardSummaries;
    if (!cards || cards.length === 0) return emptyPanel("Nenhum cartão encontrado no arquivo.");

    var rows = cards.map(function (card) {
      var pct = card.usedPercent != null ? card.usedPercent : 0;
      var barCls = pct >= 90 ? "limit-bar__fill--danger" : pct >= 70 ? "limit-bar__fill--warning" : "limit-bar__fill--ok";

      return (
        '<li class="card-limit-item">' +
        '  <div class="card-limit-item__header">' +
        '    <span class="card-limit-item__name">' + esc(card.name) +
        (card.lastFour ? ' <span class="invoice-card__last4">···' + esc(card.lastFour) + "</span>" : "") +
        "</span>" +
        (card.hasSnapshot
          ? ' <span class="status-chip status-chip--paid">' + esc(card.limitSourceLabel || "Snapshot local") + "</span>"
          : ' <span class="status-chip status-chip--other">Dados do JSON</span>') +
        "  </div>" +
        '  <div class="card-limit-item__amounts">' +
        '    <span>Limite: <strong>' + esc(card.limitFmt) + "</strong></span>" +
        '    <span>Usado: <strong>' + esc(card.usedFmt) + "</strong></span>" +
        '    <span>Disponível: <strong>' + esc(card.availableFmt) + "</strong></span>" +
        "  </div>" +
        (card.usedPercent != null
          ? '<div class="limit-bar" role="presentation"><div class="limit-bar__fill ' + barCls +
            '" style="width:' + pct + '%"></div></div>' +
            '<p class="card-limit-item__pct">' + pct + "% utilizado</p>"
          : "") +
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
        "</li>"
      );
    });

    return (
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>ℹ️</span>' +
      '  <span>Limite, usado e disponível vêm de snapshot local quando disponível. Não confundir limite com total de fatura.</span>' +
      "</div>" +
      '<ul class="entity-list card-limit-list">' + rows.join("") + "</ul>"
    );
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
    if (!inv.isReference && inv.hasReconciliationGap) {
      var diffLabel = inv.reconciliationDiff > 0 ? "fatura maior que transações" : "transações maiores que fatura";
      reconHtml = '<div class="reconciliation-gap">⚖️ Diferença de ' +
        esc(inv.reconciliationDiffFmt) + " (" + esc(diffLabel) + ")</div>";
    } else if (!inv.isReference && inv.linkedTransactionCount > 0) {
      reconHtml = '<div class="reconciliation-ok">✅ ' + inv.linkedTransactionCount + " transação(ões) vinculada(s)</div>";
    } else if (inv.isReference && inv.linkedTransactionCount > 0) {
      reconHtml = '<div class="reconciliation-ok">🔗 ' + inv.linkedTransactionCount + " transação(ões) vinculada(s)</div>";
    }

    return (
      '<div class="' + cls + '">' +
      '  <div class="invoice-card__header">' +
      '    <div>' +
      '      <p class="invoice-card__card-name">' + esc(inv.cardName) +
      (inv.cardLastFour ? ' <span class="invoice-card__last4">···' + esc(inv.cardLastFour) + "</span>" : "") +
      "      </p>" +
      '      <p class="invoice-card__period">' + esc(inv.competenceFmt) + "</p>" +
      "    </div>" +
      '    <div class="invoice-card__badges">' + badges + "</div>" +
      "  </div>" +
      amountHtml +
      (inv.isReference && inv.cardName
        ? '<p class="invoice-stub-note">Cartão: <strong>' + esc(inv.cardName) +
          (inv.cardLastFour ? " ···" + esc(inv.cardLastFour) : "") + "</strong></p>"
        : "") +
      '  <div class="invoice-meta">' +
      (inv.dueDateFmt && !inv.isReference ? '<span class="invoice-meta__item">Vence: <strong>' + esc(inv.dueDateFmt) + "</strong></span>" : "") +
      (inv.closingDateFmt && !inv.isReference ? '<span class="invoice-meta__item">Fecha: <strong>' + esc(inv.closingDateFmt) + "</strong></span>" : "") +
      "  </div>" +
      creditHtml + reconHtml +
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
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>ℹ️</span>' +
      '  <span>Stubs/referências mantêm vínculo com transações — não são faturas consolidadas. Saldo credor não é receita.</span>' +
      "</div>" +
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
    var originalReviewCount = report.counters && report.counters.originalReviewTx;
    var originalNote = (originalReviewCount != null && originalReviewCount > reviewCount)
      ? ' <span class="filter-bar__hint">(' + originalReviewCount + " no JSON)</span>"
      : "";

    var cardSelect = hasCards
      ? '<select class="filter-bar__select" id="tx-filter-card"><option value="">Todos os cartões</option>' + optRows(cards) + '</select>'
      : '<select class="filter-bar__select" id="tx-filter-card" hidden><option value=""></option></select>';

    var accountSelect = hasAccounts
      ? '<select class="filter-bar__select" id="tx-filter-account"><option value="">Todas as contas</option>' + optRows(accounts) + '</select>'
      : '<select class="filter-bar__select" id="tx-filter-account" hidden><option value=""></option></select>';

    var reviewFilter = reviewCount > 0
      ? '<label class="filter-bar__label"><input type="checkbox" id="tx-filter-review" /> Apenas revisão (' + reviewCount + ")" + originalNote + "</label>"
      : '<input type="checkbox" id="tx-filter-review" hidden />';

    return (
      '<div class="filter-bar">' +
      '  <select class="filter-bar__select" id="tx-filter-type"><option value="">Todos os tipos</option>'          + optRows(types) + '</select>' +
      '  <select class="filter-bar__select" id="tx-filter-flow"><option value="">Todos os flows</option>'          + optRows(flows) + '</select>' +
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
      if (tx.isCreditCardPayment) cls += " tx-item--payment";

      var via = tx.cardName || tx.accountName || "";

      parts.push(
        '<li class="' + cls + '">' +
        '  <span class="tx-item__flow">' + flowBadge(tx.flow) + "</span>" +
        '  <span class="tx-item__desc">' + esc(tx.description) + "</span>" +
        '  <span class="tx-item__badges">' + typeBadge(tx.type) + "</span>" +
        '  <span class="tx-item__amount">' + esc(tx.amountFmt) + "</span>" +
        '  <span class="tx-item__meta">' +
        '    <span class="tx-item__date">' + esc(tx.date || tx.competenceMonth) + "</span>" +
        (via ? '<span class="tx-item__via">' + esc(via) + "</span>" : "") +
        (tx.needsEffectiveReview ? '<span class="tx-item__review-flag" title="' + esc(tx.reviewReason) + '">⚠</span>' : "") +
        "  </span>" +
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
    var hasItems = groups && groups.some(function (g) { return g.items.length > 0; });

    if (!hasItems) {
      var autoN = (report.autoResolvedReview || []).length;
      if (autoN > 0) {
        return (
          '<div class="notice notice--success" role="note">' +
          '  <span>✅</span>' +
          '  <span>A maioria dos itens foi classificada automaticamente (' + autoN +
          ' resolvidos). Nenhuma revisão crítica pendente.</span></div>'
        );
      }
      return emptyPanel("Nenhum item pendente de confirmação.");
    }

    return (
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>ℹ️</span>' +
      '  <span>A maioria dos itens foi classificada automaticamente. Revise apenas os pontos ambíguos. Nada é aplicado automaticamente.</span>' +
      "</div>" +
      groups.map(function (group) {
        var meta = REVIEW_PRIORITY_META[group.id] || REVIEW_PRIORITY_META.important;
        var itemsHtml = group.items.map(function (item) {
          var entityLabel = item.entityType === "invoice" ? "Fatura" : "Transação";
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
      }).join("")
    );
  }

  /* ════════════════════════════════════════════════
   * TAB: SEMELHANÇAS
   * ════════════════════════════════════════════════ */

  function buildSimilaritiesTab(report) {
    var total = (report.counters && report.counters.similaritiesTotal) || 0;
    var infoCount = (report.counters && report.counters.informationalSimilarities) || 0;
    var repeated = report.repeatedPurchases || [];

    if (!total && !infoCount) {
      return emptyPanel("Nenhuma semelhança relevante detectada neste arquivo.");
    }

    var sectionsHtml = SIMILARITY_SECTIONS.map(function (sec) {
      var list = report[sec.key] || [];
      if (list.length === 0) return "";
      var rows = list.map(function (pair) { return similarityPairRow(pair, sec.title); }).join("");
      return (
        '<section class="report-section similarity-section">' +
        '  <h4 class="report-section__title">' + esc(sec.title) +
        '    <span class="similarity-section__count">' + list.length + "</span></h4>" +
        '  <ul class="similarity-list">' + rows + "</ul></section>"
      );
    }).join("");

    var infoHtml = "";
    if (repeated.length > 0) {
      infoHtml =
        '<section class="report-section similarity-section similarity-section--info">' +
        '  <h4 class="report-section__title">' + esc(INFORMATIONAL_SIMILARITY.title) +
        '    <span class="similarity-section__count">' + repeated.length + "</span></h4>" +
        '  <p class="report-empty" style="font-style:normal;margin-bottom:0.5rem">Transações legítimas em dias diferentes — não exige revisão.</p>' +
        '  <ul class="similarity-list">' +
        repeated.map(function (pair) { return similarityPairRow(pair, INFORMATIONAL_SIMILARITY.title); }).join("") +
        "</ul></section>";
    }

    if (!sectionsHtml && !infoHtml) {
      return emptyPanel("Nenhuma semelhança relevante detectada neste arquivo.");
    }

    return (
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>ℹ️</span>' +
      '  <span>Nenhum item é removido automaticamente. Compras repetidas são informativas, não duplicidade.</span>' +
      "</div>" +
      sectionsHtml + infoHtml
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
      var sourceLabel = rule.sourceLabel || SOURCE_LABELS[rule.source] || rule.source || "";
      var kindLabel = RECURRENCE_KIND[rule.recurrenceKind] || "";

      return (
        '<li class="recurring-item recurring-item--' + esc(rule.recurrenceKind || "imported") + '">' +
        '  <div class="recurring-item__header">' +
        '    <span class="recurring-item__desc">' + esc(rule.description) + "</span>" +
        '    ' + flowBadge(rule.flow) + " " + activeChip +
        (sourceLabel ? ' <span class="status-chip status-chip--open">' + esc(sourceLabel) + "</span>" : "") +
        (kindLabel ? ' <span class="status-chip status-chip--other">' + esc(kindLabel) + "</span>" : "") +
        "  </div>" +
        '  <div class="recurring-item__meta">' +
        '<span>' + esc(rule.amountFmt) + '</span>' +
        '<span>' + esc(freqLabel) + (rule.dayOfMonth ? ", dia " + rule.dayOfMonth : "") + "</span>" +
        (rule.accountName ? '<span>Conta: ' + esc(rule.accountName) + "</span>" : "") +
        (rule.cardName    ? '<span>Cartão: ' + esc(rule.cardName)    + "</span>" : "") +
        (rule.category    ? '<span>Cat.: '   + esc(rule.category)    + "</span>" : "") +
        (rule.confidence  ? '<span>Confiança: ' + esc(String(rule.confidence)) + "</span>" : "") +
        "  </div>" +
        "</li>"
      );
    });

    return (
      '<div class="notice notice--info" role="note" style="margin-bottom:1rem">' +
      '  <span>ℹ️</span>' +
      '  <span>Recorrências do JSON, regras pessoais locais e sugestões do motor. Nada é gravado nesta fase.</span>' +
      "</div>" +
      '<ul class="entity-list">' + rows.join("") + "</ul>"
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
      { type: "cpf",         label: "CPF" },
      { type: "card_number", label: "número de cartão completo" },
      { type: "boleto",      label: "código de barras / linha digitável" },
      { type: "long_number", label: "sequência numérica longa (≥ 12 dígitos)" }
    ];

    var checkRows = CHECKS.map(function (chk) {
      var found = alerts.filter(function (a) { return a.type === chk.type; });
      if (found.length === 0) {
        return (
          '<div class="privacy-check privacy-check--ok">' +
          '  <span aria-hidden="true">✅</span>' +
          '  <span>Nenhum ' + esc(chk.label) + ' detectado</span>' +
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

    return (
      '<div class="notice notice--warning" role="note" style="margin-bottom:1rem">' +
      '  <span>⚠</span>' +
      '  <span>Este arquivo contém dados financeiros pessoais. Não compartilhe nem versione no repositório.</span>' +
      "</div>" +
      checkRows +
      '<div class="privacy-instructions">' +
      '  <h4 class="report-section__title" style="margin-top:1rem">Boas práticas</h4>' +
      '  <ul class="entity-list" style="margin-top:0.5rem">' +
      '    <li class="entity-list__item">Não copie arquivos financeiros reais para <code>/data</code> do projeto.</li>' +
      '    <li class="entity-list__item">Nunca commite <code>*.real.json</code> ou <code>*.sensitive.json</code>.</li>' +
      '    <li class="entity-list__item">Use apenas <code>lastFour</code> para identificar cartões — nunca o número completo.</li>' +
      '    <li class="entity-list__item">Armazene <code>rawHash</code> de documentos originais, nunca os documentos completos.</li>' +
      "  </ul>" +
      "</div>"
    );
  }

  /* ════════════════════════════════════════════════
   * BUILDERS DE ESTADO
   * ════════════════════════════════════════════════ */

  function buildUploadZone() {
    return (
      '<div class="upload-zone" id="upload-zone" role="region" aria-label="Área de importação de arquivo JSON">' +
      '  <div class="upload-zone__icon" aria-hidden="true">📄</div>' +
      '  <p class="upload-zone__title">Arraste um JSON aqui ou selecione um arquivo.</p>' +
      '  <p class="upload-zone__hint">schemaVersion: <code>cfm.import.v1</code></p>' +
      '  <p class="upload-zone__types">Tipos: <code>income</code>, <code>expense</code>, <code>transfer</code>, <code>credit_card_purchase</code>, <code>credit_card_payment</code>, <code>adjustment</code>, <code>fee</code>, <code>refund</code></p>' +
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
    var si = OVERALL_STATUS[report.overallStatus] || OVERALL_STATUS.ready;

    /* status banner */
    var banner =
      '<div class="import-status-banner import-status-banner--' + si.mod + '" role="status">' +
      '  <span class="import-status-banner__icon" aria-hidden="true">' + si.icon + "</span>" +
      '  <div>' +
      '    <p class="import-status-banner__text">' + esc(si.label) + "</p>" +
      '    <p class="import-status-banner__sub">Validação local. Nada é gravado no Firebase nesta fase.</p>' +
      "  </div>" +
      "</div>";

    /* file info */
    var fileInfo =
      '<div class="import-file-info">' +
      '  <code>' + esc(report.fileName || "") + "</code>" +
      " · " + esc(report.fileSizeFormatted || "") +
      " · <code>" + esc(report.schema || "") + "</code>" +
      (report.source.institution ? " · <strong>" + esc(report.source.institution) + "</strong>" : "") +
      "</div>";

    /* tab nav */
    var tabBtns = TABS.map(function (tab, i) {
      var count = tab.countKey ? (report.counters[tab.countKey] || 0) : 0;
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
      banner + fileInfo +
      '<nav class="import-tabs" role="tablist" aria-label="Painéis de importação">' +
      tabBtns + "</nav>" +
      '<div class="tab-panels">' + tabPanels + "</div>" +
      "</div>"
    );
  }

  function buildActions() {
    return (
      '<div class="import-actions">' +
      '  <button type="button" class="btn btn--ghost" id="import-clear">Limpar importação</button>' +
      '  <button type="button" class="btn btn--primary" disabled aria-disabled="true"' +
      '          title="Confirmação será liberada após Firebase Auth + RTDB Rules">' +
      "    Confirmar importação" +
      "  </button>" +
      '  <span class="import-actions__note">Confirmação será liberada após Firebase Auth + RTDB Rules. Nada é gravado nesta fase.</span>' +
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

  function wireTabSystem(container) {
    container.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateTab(btn.getAttribute("data-tab"), container);
      });
    });
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
        } else {
          setContent(container, buildReportHtml(report));
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
      '    <h2 class="page-header__title">Importação rápida</h2>' +
      '    <p class="page-header__desc">Arraste um JSON aqui ou selecione um arquivo no formato cfm.import.v1. Validação local — nada é gravado no Firebase nesta fase.</p>' +
      "  </header>" +
      '  <div class="notice notice--warning" role="note">' +
      '    <span aria-hidden="true">⚠</span>' +
      '    <span>Persistência desabilitada. A gravação no Firebase RTDB será implementada após integração de autenticação (Fase 1).</span>' +
      "  </div>" +
      '  <div id="import-content">' + buildUploadZone() + "</div>" +
      '  <div id="import-actions-wrap"></div>' +
      '  <div class="schema-ref">' +
      '    Referência: <code>docs/SCHEMA_IMPORTACAO_JSON.md</code>' +
      '    &nbsp;·&nbsp; Exemplo: <code>data/sample-import.cfm.v1.json</code>' +
      "  </div>" +
      '  <ul class="feature-list">' +
      '    <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '      <span class="feature-list__text"><strong>amountCents</strong> sempre positivo; direção definida por <strong>flow</strong> (<code>in</code> / <code>out</code> / <code>neutral</code>).</span></li>' +
      '    <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '      <span class="feature-list__text"><strong>type</strong> obrigatório — valores canônicos: <code>income</code>, <code>expense</code>, <code>transfer</code>, <code>credit_card_purchase</code>, <code>credit_card_payment</code>, <code>adjustment</code>, <code>fee</code>, <code>refund</code>.</span></li>' +
      '    <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '      <span class="feature-list__text"><strong>creditBalanceCents</strong> com <code>balanceDirection: "credit"</code> indica saldo a favor, nunca receita.</span></li>' +
      '    <li class="feature-list__item"><span class="feature-list__dot"></span>' +
      '      <span class="feature-list__text">Arquivos financeiros reais nunca devem ser versionados no repositório.</span></li>' +
      "  </ul>" +
      "</div>";

    wireUploadZone(container);
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.importer = { render: render };
})(window.CFM);
