/**
 * Ponto de entrada — inicializa app após DOM pronto.
 */
(function () {
  function boot() {
    if (!window.CFM || !window.CFM.bootstrap) {
      console.error("[CFM] Bootstrap não encontrado. Verifique ordem dos scripts.");
      return;
    }
    window.CFM.bootstrap.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
