window.CFM = window.CFM || {};

(function (CFM) {
  function esc(value) {
    return CFM.formatters && CFM.formatters.escapeHtml
      ? CFM.formatters.escapeHtml(value)
      : String(value == null ? "" : value);
  }

  function money(cents) {
    return CFM.formatters && CFM.formatters.formatCurrencyBRL
      ? CFM.formatters.formatCurrencyBRL(cents)
      : "—";
  }

  function renderMonthChips(history, currentMonth) {
    return (history || []).map(function (row) {
      var cls = row.competenceMonth === currentMonth ? "month-chip is-current" : "month-chip";
      return '<span class="' + cls + '">' + esc(row.labelShort || row.competenceMonth) + "</span>";
    }).join("");
  }

  function renderHistoryRows(history) {
    return (history || []).map(function (row) {
      return (
        "<tr>" +
        "<td>" + esc(row.label || row.labelShort || row.competenceMonth) + "</td>" +
        "<td>" + esc(money(row.inCents)) + "</td>" +
        "<td>" + esc(money(row.outCents)) + "</td>" +
        "<td>" + esc(money(row.netCents)) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function render(container) {
    var model = CFM.financialReadModel && CFM.financialReadModel.getFinancialReadModel
      ? CFM.financialReadModel.getFinancialReadModel()
      : null;
    var history = model && model.monthlyHistory ? model.monthlyHistory : [];
    var hasHistory = history.length > 0;
    var batch = model && model.activeBatch;
    var metaHtml = hasHistory && batch
      ? '<p class="page-header__meta">' + esc(history.length) + " meses · lote " +
        esc(batch.sourceName || batch.fileName || "") + "</p>"
      : "";

    var contentHtml = hasHistory
      ? '<div class="month-selector" aria-label="Meses importados">' +
        renderMonthChips(history, model.currentCompetenceMonth) +
        "</div>" +
        '<div class="table-wrap">' +
        '  <table class="table-placeholder" aria-label="Histórico mensal importado">' +
        "    <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>" +
        "    <tbody>" + renderHistoryRows(history) + "</tbody>" +
        "  </table>" +
        "</div>"
      : "";

    var emptyHidden = hasHistory ? ' style="display:none"' : "";

    container.innerHTML =
      '<div class="page-view page--history">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Histórico mensal</h2>' +
      '    <p class="page-header__desc">Totais por competência a partir dos lançamentos confirmados (pagamentos de fatura excluídos para evitar duplicidade).</p>' +
      metaHtml +
      "  </header>" +
      contentHtml +
      '  <div class="empty-state"' + emptyHidden + ">" +
      '    <div class="empty-state__icon" aria-hidden="true">' +
      CFM.icon("calendar", { className: "cfm-icon cfm-icon--xl" }) +
      '</div>' +
      '    <h3 class="empty-state__title">Histórico vazio</h3>' +
      '    <p class="empty-state__text">Após importar e confirmar lançamentos, o histórico mensal será preenchido automaticamente.</p>' +
      '    <div class="empty-state__actions">' +
      '      <button type="button" class="btn btn--primary" data-nav="/importar">Ir para importação</button>' +
      "    </div>" +
      "  </div>" +
      "</div>";

    var navBtn = container.querySelector("[data-nav]");
    if (navBtn && CFM.router) {
      navBtn.addEventListener("click", function () {
        CFM.router.navigate("/importar");
      });
    }
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.history = { render: render };
})(window.CFM);
