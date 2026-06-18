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

  function render(container) {
    var model = CFM.financialReadModel && CFM.financialReadModel.getFinancialReadModel
      ? CFM.financialReadModel.getFinancialReadModel()
      : null;
    var hasData = model && model.hasData;
    var fmt = CFM.formatters || {};
    var month = model && model.dashboardMonth;
    var batch = model && model.activeBatch;
    var counts = (model && model.counts) || {};

    var inValue = "R$ —";
    var outValue = "R$ —";
    var balanceValue = "R$ —";
    var monthLabel = "";
    var inHint = "Nenhum lançamento registrado";
    var outHint = "Nenhum lançamento registrado";
    var balanceHint = "Inclui recorrências e parcelas";

    if (hasData && month) {
      inValue = money(month.inCents);
      outValue = money(month.outCents);
      balanceValue = money(month.netCents);
      monthLabel = month.label || month.competenceMonth;
      inHint = month.transactionCount + " lançamentos em " + monthLabel;
      outHint = counts.invoices + " faturas · " + counts.cards + " cartões no lote";
      if (model.recurringOutCents > 0) {
        balanceHint = "Saldo do mês · " + counts.recurringRules + " recorrências (" +
          money(model.recurringOutCents) + "/mês estimado)";
      } else {
        balanceHint = counts.recurringRules + " recorrências · " +
          counts.installmentPlans + " parcelas no lote";
      }
    } else if (hasData) {
      inHint = counts.transactions + " lançamentos importados";
      outHint = counts.invoices + " faturas no lote ativo";
      balanceHint = counts.recurringRules + " recorrências · " +
        counts.installmentPlans + " parcelas";
    }

    var batchNote = "";
    if (hasData && batch) {
      batchNote =
        '<p class="page-header__meta">' +
        esc(batch.sourceName || batch.fileName || "Importação local") +
        " · importado em " +
        esc(fmt.formatDateBR ? fmt.formatDateBR(batch.importedAt) : batch.importedAt) +
        "</p>";
    }

    var emptyHidden = hasData ? ' style="display:none"' : "";

    container.innerHTML =
      '<div class="page-view page--dashboard">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Visão do mês</h2>' +
      '    <p class="page-header__desc">Resumo consolidado de entradas, saídas e saldo do período importado.</p>' +
      batchNote +
      "  </header>" +
      '  <div class="card-grid">' +
      '    <article class="card card--stat">' +
      '      <span class="card__label">Entradas</span>' +
      '      <span class="card__value card__value--in">' + esc(inValue) + "</span>" +
      '      <span class="card__hint">' + esc(inHint) + "</span>" +
      "    </article>" +
      '    <article class="card card--stat">' +
      '      <span class="card__label">Saídas</span>' +
      '      <span class="card__value card__value--out">' + esc(outValue) + "</span>" +
      '      <span class="card__hint">' + esc(outHint) + "</span>" +
      "    </article>" +
      '    <article class="card card--stat">' +
      '      <span class="card__label">Saldo do mês</span>' +
      '      <span class="card__value">' + esc(balanceValue) + "</span>" +
      '      <span class="card__hint">' + esc(balanceHint) + "</span>" +
      "    </article>" +
      "  </div>" +
      '  <div class="summary-row">' +
      '    <article class="card">' +
      '      <span class="card__label">Lote importado</span>' +
      '      <p class="card__hint" style="margin-top:0.75rem">' +
      (hasData
        ? esc(counts.transactions + " lançamentos · " + counts.invoices + " faturas · " +
            counts.cards + " cartões")
        : "Confirme uma importação para popular o dashboard.") +
      "</p></article>" +
      '    <article class="card">' +
      '      <span class="card__label">Recorrências e parcelas</span>' +
      '      <p class="card__hint" style="margin-top:0.75rem">' +
      (hasData
        ? esc(counts.recurringRules + " recorrências · " + counts.installmentPlans + " planos de parcelamento")
        : "Projeções avançadas virão em fases futuras.") +
      "</p></article>" +
      "  </div>" +
      '  <div class="empty-state"' + emptyHidden + ">" +
      '    <div class="empty-state__icon" aria-hidden="true">' +
      CFM.icon("chart", { className: "cfm-icon cfm-icon--xl" }) +
      '</div>' +
      '    <h3 class="empty-state__title">Seu dashboard está pronto para receber dados</h3>' +
      '    <p class="empty-state__text">Importe um JSON no formato cfm.import.v1 e confirme a importação para ver o resumo aqui.</p>' +
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
  CFM.pages.dashboard = { render: render };
})(window.CFM);
