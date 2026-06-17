window.CFM = window.CFM || {};

(function (CFM) {
  function render(container) {
    container.innerHTML =
      '<div class="page-view page--dashboard">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Visão do mês</h2>' +
      '    <p class="page-header__desc">Resumo consolidado de entradas, saídas e saldo projetado. Os dados aparecerão aqui após a importação e confirmação dos lançamentos.</p>' +
      "  </header>" +
      '  <div class="card-grid">' +
      '    <article class="card card--stat">' +
      '      <span class="card__label">Entradas</span>' +
      '      <span class="card__value card__value--in">R$ —</span>' +
      '      <span class="card__hint">Nenhum lançamento registrado</span>' +
      "    </article>" +
      '    <article class="card card--stat">' +
      '      <span class="card__label">Saídas</span>' +
      '      <span class="card__value card__value--out">R$ —</span>' +
      '      <span class="card__hint">Nenhum lançamento registrado</span>' +
      "    </article>" +
      '    <article class="card card--stat">' +
      '      <span class="card__label">Saldo projetado</span>' +
      '      <span class="card__value">R$ —</span>' +
      '      <span class="card__hint">Inclui recorrências e parcelas</span>' +
      "    </article>" +
      "  </div>" +
      '  <div class="summary-row">' +
      '    <article class="card">' +
      '      <span class="card__label">Próximos vencimentos</span>' +
      '      <p class="card__hint" style="margin-top:0.75rem">Faturas e despesas fixas serão listadas aqui.</p>' +
      "    </article>" +
      '    <article class="card">' +
      '      <span class="card__label">Previsão 3 meses</span>' +
      '      <p class="card__hint" style="margin-top:0.75rem">Projeção baseada em histórico e regras recorrentes.</p>' +
      "    </article>" +
      "  </div>" +
      '  <div class="empty-state">' +
      '    <div class="empty-state__icon" aria-hidden="true">' +
      CFM.icon("chart", { className: "cfm-icon cfm-icon--xl" }) +
      '</div>' +
      '    <h3 class="empty-state__title">Seu dashboard está pronto para receber dados</h3>' +
      '    <p class="empty-state__text">Importe um JSON no formato cfm.import.v1 ou conecte sua conta quando a autenticação estiver disponível.</p>' +
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
