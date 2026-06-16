window.CFM = window.CFM || {};

(function (CFM) {
  function render(container) {
    container.innerHTML =
      '<div class="page-view page--cards">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Cartões de crédito</h2>' +
      '    <p class="page-header__desc">Gerencie faturas, limites e despesas parceladas por cartão. Os cartões importados via JSON aparecerão aqui com faturas e parcelas vinculadas.</p>' +
      "  </header>" +
      '  <div class="empty-state">' +
      '    <div class="empty-state__icon" aria-hidden="true">💳</div>' +
      '    <h3 class="empty-state__title">Nenhum cartão cadastrado</h3>' +
      '    <p class="empty-state__text">Após a integração com Firebase, os cartões importados via JSON ou adicionados manualmente aparecerão aqui com limites, faturas e parcelas vinculadas.</p>' +
      '    <div class="empty-state__actions">' +
      '      <button type="button" class="btn btn--ghost" disabled aria-disabled="true" title="Disponível após integração com Firebase na Fase 1">Disponível em fase futura</button>' +
      "    </div>" +
      "  </div>" +
      "</div>";
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.cards = { render: render };
})(window.CFM);
