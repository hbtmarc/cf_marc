window.CFM = window.CFM || {};

(function (CFM) {
  var containerRef = null;

  function esc(value) {
    return CFM.formatters && CFM.formatters.escapeHtml
      ? CFM.formatters.escapeHtml(value)
      : String(value == null ? "" : value);
  }

  function money(cents) {
    if (cents == null || typeof cents !== "number") return "R$ —";
    return CFM.formatters && CFM.formatters.formatCurrencyBRL
      ? CFM.formatters.formatCurrencyBRL(cents)
      : "R$ —";
  }

  function formatDate(value) {
    return CFM.formatters && CFM.formatters.formatDateBR
      ? CFM.formatters.formatDateBR(value)
      : value || "—";
  }

  function icon(name, className) {
    return CFM.icon ? CFM.icon(name, { className: className || "cfm-icon" }) : "";
  }

  function renderMonthSelector(dashboard, hasData) {
    if (!hasData || !dashboard.availableMonths.length) return "";
    return (
      '<div class="dashboard-month-bar" role="group" aria-label="Competência exibida">' +
      '<span class="dashboard-month-bar__label">Competência</span>' +
      '<div class="dashboard-month-bar__chips">' +
      dashboard.availableMonths.map(function (month) {
        var isActive = month === dashboard.selectedCompetenceMonth;
        var label = dashboard.summary && month === dashboard.selectedCompetenceMonth
          ? dashboard.summary.labelShort
          : month.slice(5, 7) + "/" + month.slice(0, 4);
        return (
          '<button type="button" class="month-chip' + (isActive ? " is-current" : "") + '"' +
          ' data-dashboard-month="' + esc(month) + '"' +
          (isActive ? ' aria-current="true"' : "") +
          ">" + esc(label) + "</button>"
        );
      }).join("") +
      "</div></div>"
    );
  }

  function renderKpiGrid(summary) {
    if (!summary) return "";
    return (
      '<div class="card-grid dashboard-kpi-grid">' +
      '  <article class="card card--stat">' +
      '    <span class="card__label">Entradas</span>' +
      '    <span class="card__value card__value--in">' + esc(money(summary.inCents)) + "</span>" +
      '    <span class="card__hint">' + esc(summary.transactionCount + " lançamentos no mês") + "</span>" +
      "  </article>" +
      '  <article class="card card--stat">' +
      '    <span class="card__label">Saídas</span>' +
      '    <span class="card__value card__value--out">' + esc(money(summary.outCents)) + "</span>" +
      '    <span class="card__hint">Pagamentos de fatura excluídos</span>' +
      "  </article>" +
      '  <article class="card card--stat">' +
      '    <span class="card__label">Saldo do mês</span>' +
      '    <span class="card__value">' + esc(money(summary.netCents)) + "</span>" +
      '    <span class="card__hint">' + esc(summary.label) + "</span>" +
      "  </article>" +
      "</div>" +
      '<div class="card-grid dashboard-secondary-grid">' +
      '  <article class="card card--stat card--compact">' +
      '    <span class="card__label">Lançamentos</span>' +
      '    <span class="card__value card__value--sm">' + esc(String(summary.transactionCount)) + "</span>" +
      "  </article>" +
      '  <article class="card card--stat card--compact">' +
      '    <span class="card__label">Faturas</span>' +
      '    <span class="card__value card__value--sm">' +
      esc(summary.openInvoiceCount + " abertas · " + summary.paidInvoiceCount + " pagas") +
      "</span>" +
      '    <span class="card__hint">' + esc(money(summary.openInvoiceCents) + " em aberto") + "</span>" +
      "  </article>" +
      '  <article class="card card--stat card--compact">' +
      '    <span class="card__label">Recorrências ativas</span>' +
      '    <span class="card__value card__value--sm">' + esc(String(summary.activeRecurringCount)) + "</span>" +
      '    <span class="card__hint">' + esc(money(summary.recurringOutCents) + "/mês estimado") + "</span>" +
      "  </article>" +
      '  <article class="card card--stat card--compact">' +
      '    <span class="card__label">Parcelas futuras</span>' +
      '    <span class="card__value card__value--sm">' + esc(String(summary.futureInstallmentCount)) + "</span>" +
      '    <span class="card__hint">' + esc(money(summary.futureInstallmentCents) + " por ciclo") + "</span>" +
      "  </article>" +
      "</div>"
    );
  }

  function renderDueList(items) {
    if (!items.length) {
      return '<p class="dashboard-panel__empty">Nenhum vencimento relevante para esta competência.</p>';
    }
    return (
      '<ul class="dashboard-list">' +
      items.map(function (item) {
        var typeLabel = item.type === "invoice" ? "Fatura"
          : item.type === "recurring" ? "Recorrência"
            : "Parcela";
        return (
          '<li class="dashboard-list__item">' +
          '  <div class="dashboard-list__main">' +
          '    <span class="dashboard-list__type">' + esc(typeLabel) + "</span>" +
          '    <strong class="dashboard-list__title">' + esc(item.label) + "</strong>" +
          '    <span class="dashboard-list__meta">' + esc(item.detail) + " · " + esc(formatDate(item.sortDate)) + "</span>" +
          "  </div>" +
          '  <span class="dashboard-list__amount">' + esc(money(item.amountCents)) + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderAttentionCards(cards) {
    if (!cards.length) {
      return '<p class="dashboard-panel__empty">Nenhum cartão precisa de atenção nesta competência.</p>';
    }
    return (
      '<ul class="dashboard-list dashboard-list--attention">' +
      cards.map(function (card) {
        var reasonText = card.reasons.indexOf("limite_critico") >= 0
          ? "Limite crítico"
          : card.reasons.indexOf("fatura_aberta") >= 0
            ? "Fatura aberta"
            : "Uso elevado";
        return (
          '<li class="dashboard-list__item dashboard-list__item--' + esc(card.severity) + '">' +
          '  <div class="dashboard-list__main">' +
          '    <strong class="dashboard-list__title">' + esc(card.name) +
          (card.lastFour ? " ·••• " + esc(String(card.lastFour).slice(-4)) : "") +
          "</strong>" +
          '    <span class="dashboard-list__meta">' + esc(reasonText) +
          (card.usedPercent != null ? " · " + card.usedPercent + "% usado" : "") +
          "</span>" +
          "  </div>" +
          '  <span class="dashboard-list__amount">' + esc(money(card.usedCents)) + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderTopExpenses(groups) {
    if (!groups.length) {
      return '<p class="dashboard-panel__empty">Sem saídas registradas nesta competência.</p>';
    }
    var max = groups[0].amountCents || 1;
    return (
      '<ul class="dashboard-expense-list">' +
      groups.map(function (group) {
        var pct = Math.max(8, Math.round((group.amountCents / max) * 100));
        return (
          '<li class="dashboard-expense-list__item">' +
          '  <div class="dashboard-expense-list__head">' +
          '    <span class="dashboard-expense-list__label">' + esc(group.label) + "</span>" +
          '    <span class="dashboard-expense-list__amount">' + esc(money(group.amountCents)) + "</span>" +
          "  </div>" +
          '  <div class="dashboard-expense-list__bar" role="presentation">' +
          '    <span class="dashboard-expense-list__fill" style="width:' + pct + '%"></span>' +
          "  </div>" +
          '  <span class="dashboard-expense-list__meta">' + esc(group.count + " lançamento(s)") + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderPanels(dashboard) {
    return (
      '<div class="dashboard-panels">' +
      '  <section class="dashboard-panel card">' +
      '    <header class="dashboard-panel__header">' +
      '      <h3 class="dashboard-panel__title">' + icon("calendar", "cfm-icon cfm-icon--sm") +
      " Próximos vencimentos</h3>" +
      '      <p class="dashboard-panel__desc">Faturas abertas, recorrências e parcelas a partir desta competência.</p>' +
      "    </header>" +
      renderDueList(dashboard.upcomingDueItems) +
      "  </section>" +
      '  <section class="dashboard-panel card">' +
      '    <header class="dashboard-panel__header">' +
      '      <h3 class="dashboard-panel__title">' + icon("card", "cfm-icon cfm-icon--sm") +
      " Cartões em atenção</h3>" +
      '      <p class="dashboard-panel__desc">Limite alto ou fatura aberta na competência selecionada.</p>' +
      "    </header>" +
      renderAttentionCards(dashboard.attentionCards) +
      "  </section>" +
      '  <section class="dashboard-panel card dashboard-panel--wide">' +
      '    <header class="dashboard-panel__header">' +
      '      <h3 class="dashboard-panel__title">' + icon("chart", "cfm-icon cfm-icon--sm") +
      " Maiores saídas do mês</h3>" +
      '      <p class="dashboard-panel__desc">Agrupamento por descrição/categoria — sem pagamentos de fatura.</p>' +
      "    </header>" +
      renderTopExpenses(dashboard.topExpenseGroups) +
      "  </section>" +
      "</div>"
    );
  }

  function wireNavigation(container) {
    container.querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (CFM.router) CFM.router.navigate(btn.getAttribute("data-nav"));
      });
    });
  }

  function wireMonthSelector(container) {
    container.querySelectorAll("[data-dashboard-month]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var month = btn.getAttribute("data-dashboard-month");
        if (!month || !CFM.financialReadModel) return;
        CFM.financialReadModel.setStoredDashboardCompetenceMonth(month);
        render(containerRef);
      });
    });
  }

  function render(container) {
    containerRef = container;
    var readModel = CFM.financialReadModel;
    var model = readModel && readModel.getFinancialReadModel
      ? readModel.getFinancialReadModel()
      : null;
    var hasData = model && model.hasData;
    var dashboard = (model && model.dashboard) || {
      availableMonths: [],
      selectedCompetenceMonth: "",
      summary: null,
      upcomingDueItems: [],
      attentionCards: [],
      topExpenseGroups: []
    };
    var batch = model && model.activeBatch;
    var fmt = CFM.formatters || {};

    var batchNote = "";
    if (hasData && batch) {
      batchNote =
        '<p class="page-header__meta">' +
        esc(batch.sourceName || batch.fileName || "Importação local") +
        " · importado em " +
        esc(fmt.formatDateBR ? fmt.formatDateBR(batch.importedAt) : batch.importedAt) +
        "</p>";
    }

    var toolbar = hasData
      ? '<div class="dashboard-toolbar">' +
        renderMonthSelector(dashboard, hasData) +
        '<div class="dashboard-toolbar__links">' +
        '  <button type="button" class="btn btn--ghost btn--sm" data-nav="/cartoes">Ver cartões</button>' +
        '  <button type="button" class="btn btn--ghost btn--sm" data-nav="/historico">Ver histórico</button>' +
        "</div></div>"
      : "";

    var contentHtml = hasData
      ? renderKpiGrid(dashboard.summary) + renderPanels(dashboard)
      : "";

    var emptyHidden = hasData ? ' style="display:none"' : "";

    container.innerHTML =
      '<div class="page-view page--dashboard">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Dashboard operacional</h2>' +
      '    <p class="page-header__desc">Visão mensal consolidada dos dados importados — troque a competência para recalcular todos os indicadores.</p>' +
      batchNote +
      "  </header>" +
      toolbar +
      contentHtml +
      '  <div class="empty-state"' + emptyHidden + ">" +
      '    <div class="empty-state__icon" aria-hidden="true">' +
      icon("chart", "cfm-icon cfm-icon--xl") +
      "</div>" +
      '    <h3 class="empty-state__title">Importe seus dados para começar</h3>' +
      '    <p class="empty-state__text">Confirme uma importação JSON no formato cfm.import.v1 para ver entradas, saídas, vencimentos e alertas aqui.</p>' +
      '    <div class="empty-state__actions">' +
      '      <button type="button" class="btn btn--primary" data-nav="/importar">Ir para importação</button>' +
      "    </div>" +
      "  </div>" +
      "</div>";

    wireNavigation(container);
    wireMonthSelector(container);
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.dashboard = { render: render };
})(window.CFM);
