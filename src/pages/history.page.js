window.CFM = window.CFM || {};

(function (CFM) {
  function render(container) {
    container.innerHTML =
      '<div class="page-view page--history">' +
      '  <header class="page-header">' +
      '    <h2 class="page-header__title">Histórico mensal</h2>' +
      '    <p class="page-header__desc">Consulte meses anteriores, compare entradas e saídas e acompanhe a evolução do saldo ao longo do tempo.</p>' +
      "  </header>" +
      '  <div class="month-selector">' +
      '    <span class="month-chip">2026-04</span>' +
      '    <span class="month-chip">2026-05</span>' +
      '    <span class="month-chip is-current">2026-06</span>' +
      "  </div>" +
      '  <div class="table-wrap">' +
      '    <table class="table-placeholder" aria-label="Histórico mensal — placeholder">' +
      "      <thead>" +
      "        <tr>" +
      "          <th>Mês</th>" +
      "          <th>Entradas</th>" +
      "          <th>Saídas</th>" +
      "          <th>Saldo</th>" +
      "        </tr>" +
      "      </thead>" +
      "      <tbody>" +
      "        <tr>" +
      "          <td>2026-06</td>" +
      "          <td>—</td>" +
      "          <td>—</td>" +
      "          <td>—</td>" +
      "        </tr>" +
      "        <tr>" +
      "          <td>2026-05</td>" +
      "          <td>—</td>" +
      "          <td>—</td>" +
      "          <td>—</td>" +
      "        </tr>" +
      "        <tr>" +
      "          <td>2026-04</td>" +
      "          <td>—</td>" +
      "          <td>—</td>" +
      "          <td>—</td>" +
      "        </tr>" +
      "      </tbody>" +
      "    </table>" +
      "  </div>" +
      '  <div class="empty-state">' +
      '    <div class="empty-state__icon" aria-hidden="true">' +
      CFM.icon("calendar", { className: "cfm-icon cfm-icon--xl" }) +
      '</div>' +
      '    <h3 class="empty-state__title">Histórico vazio</h3>' +
      '    <p class="empty-state__text">Após importar ou registrar lançamentos, o histórico mensal será preenchido automaticamente.</p>' +
      "  </div>" +
      "</div>";
  }

  CFM.pages = CFM.pages || {};
  CFM.pages.history = { render: render };
})(window.CFM);
