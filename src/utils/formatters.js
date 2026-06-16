/**
 * Utilitários de formatação — CFM
 * Sem dependências externas. Compatível com file:// e GitHub Pages.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  /**
   * Formata centavos para Real brasileiro.
   * @param {number} cents
   * @returns {string}
   */
  function formatCurrencyFromCents(cents) {
    if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2
      }).format(cents / 100);
    } catch (_) {
      return "R$ " + (cents / 100).toFixed(2).replace(".", ",");
    }
  }

  /**
   * Formata tamanho de arquivo.
   * @param {number} bytes
   * @returns {string}
   */
  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    var val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
    return val.replace(".", ",") + "\u00a0" + units[i];
  }

  /**
   * Formata data YYYY-MM-DD para DD/MM/YYYY (PT-BR).
   * @param {string} dateStr
   * @returns {string}
   */
  function formatDate(dateStr) {
    if (!dateStr) return "—";
    var s = String(dateStr);
    var parts = s.split("-");
    if (parts.length === 3) return parts[2] + "/" + parts[1] + "/" + parts[0];
    if (parts.length === 2) return parts[1] + "/" + parts[0];
    return s;
  }

  /**
   * Formata mês YYYY-MM para MM/YYYY (PT-BR).
   * @param {string} month
   * @returns {string}
   */
  function formatMonth(month) {
    if (!month) return "—";
    var parts = String(month).split("-");
    if (parts.length === 2) return parts[1] + "/" + parts[0];
    return month;
  }

  CFM.formatters = {
    formatCurrencyFromCents: formatCurrencyFromCents,
    formatFileSize: formatFileSize,
    formatDate: formatDate,
    formatMonth: formatMonth
  };
})(window.CFM);
