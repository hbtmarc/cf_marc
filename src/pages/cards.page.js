window.CFM = window.CFM || {};

(function (CFM) {
  function esc(value) {
    return CFM.formatters && CFM.formatters.escapeHtml
      ? CFM.formatters.escapeHtml(value)
      : String(value == null ? "" : value);
  }

  function money(cents) {
    if (cents == null || typeof cents !== "number") return "—";
    return CFM.formatters && CFM.formatters.formatCurrencyBRL
      ? CFM.formatters.formatCurrencyBRL(cents)
      : "—";
  }

  function formatLastFour(lastFour) {
    if (!lastFour) return "";
    var s = String(lastFour).replace(/\D/g, "");
    if (!s) return "";
    return " ·••• " + esc(s.slice(-4));
  }

  function renderCardItem(card) {
    var pct = card.usedPercent;
    var barCls = pct == null ? ""
      : pct >= 90 ? "limit-bar__fill--danger"
        : pct >= 70 ? "limit-bar__fill--warning"
          : "limit-bar__fill--ok";
    var barHtml = pct != null
      ? '<div class="limit-bar" role="presentation"><div class="limit-bar__fill ' + barCls +
        '" style="width:' + pct + '%"></div></div>'
      : "";

    return (
      '<li class="card-limit-item">' +
      '  <div class="card-limit-item__header">' +
      '    <span class="card-limit-item__name">' + esc(card.name) + formatLastFour(card.lastFour) + "</span>" +
      (card.hasSnapshot
        ? ' <span class="status-chip status-chip--paid">Snapshot importado</span>'
        : ' <span class="status-chip status-chip--other">Sem snapshot</span>') +
      "  </div>" +
      (card.brand ? '  <p class="card-limit-item__brand">' + esc(card.brand) + "</p>" : "") +
      '  <div class="card-limit-item__amounts">' +
      '    <span>Limite: <strong>' + esc(money(card.limitCents)) + "</strong></span>" +
      '    <span>Usado: <strong>' + esc(money(card.usedCents)) + "</strong></span>" +
      '    <span>Disponível: <strong>' + esc(money(card.availableCents)) + "</strong></span>" +
      (pct != null ? '    <span>Utilizado: <strong>' + pct + "%</strong></span>" : "") +
      "  </div>" +
      barHtml +
      '  <div class="card-limit-item__links">' +
      '    <span><strong>' + card.invoiceCount + "</strong> fatura(s)</span>" +
      '    <span><strong>' + card.purchaseCount + "</strong> compra(s)</span>" +
      '    <span><strong>' + card.installmentPlanCount + "</strong> parcelamento(s)</span>" +
      "  </div>" +
      "</li>"
    );
  }

  function render(container) {
    var model = CFM.financialReadModel && CFM.financialReadModel.getFinancialReadModel
      ? CFM.financialReadModel.getFinancialReadModel()
      : null;
    var cards = model && model.enrichedCards ? model.enrichedCards : [];
    var hasCards = cards.length > 0;
    var batch = model && model.activeBatch;
    var metaHtml = hasCards && batch
      ? '<p class="page-header__meta">' + esc(cards.length) + " cartões do lote " +
        esc(batch.sourceName || batch.fileName || "") + "</p>"
      : "";

    var listHtml = hasCards
      ? '<ul class="card-limit-grid">' + cards.map(renderCardItem).join("") + "</ul>"
      : "";

    var emptyHidden = hasCards ? ' style="display:none"' : "";

    container.innerHTML =
      '<div class="page-view page--cards">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Cartões de crédito</h2>' +
      '    <p class="page-header__desc">Limites, faturas e parcelamentos dos cartões confirmados na importação.</p>' +
      metaHtml +
      "  </header>" +
      listHtml +
      '  <div class="empty-state"' + emptyHidden + ">" +
      '    <div class="empty-state__icon" aria-hidden="true">' +
      CFM.icon("card", { className: "cfm-icon cfm-icon--xl" }) +
      '</div>' +
      '    <h3 class="empty-state__title">Nenhum cartão cadastrado</h3>' +
      '    <p class="empty-state__text">Importe e confirme um JSON com cartões para vê-los listados aqui.</p>' +
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
  CFM.pages.cards = { render: render };
})(window.CFM);
