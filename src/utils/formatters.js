/**
 * Utilitários de formatação — CFM
 * Sem dependências externas. Compatível com file:// e GitHub Pages.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var MONTH_NAMES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  var currencyFormatter = null;

  function getCurrencyFormatter() {
    if (!currencyFormatter) {
      currencyFormatter = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return currencyFormatter;
  }

  /**
   * Formata centavos para Real brasileiro (sempre 2 casas decimais).
   * @param {number} cents
   * @returns {string}
   */
  function formatCurrencyFromCents(cents) {
    if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
    try {
      return getCurrencyFormatter().format(cents / 100);
    } catch (_) {
      return "R$ " + (cents / 100).toFixed(2).replace(".", ",");
    }
  }

  /**
   * Alias principal — aceita centavos (number) ou string monetária legada.
   * @param {number|string} valueCentsOrNumber
   * @returns {string}
   */
  function formatCurrencyBRL(valueCentsOrNumber) {
    if (typeof valueCentsOrNumber === "string") {
      if (isNonMonetaryLabel(valueCentsOrNumber)) return valueCentsOrNumber;
      var parsed = parseBrazilianCurrencyToCents(valueCentsOrNumber);
      if (parsed == null) return valueCentsOrNumber;
      return formatCurrencyFromCents(parsed);
    }
    return formatCurrencyFromCents(valueCentsOrNumber);
  }

  function isNonMonetaryLabel(str) {
    var t = String(str || "").trim();
    if (!t || t === "—") return true;
    if (!/[\d]/.test(t)) return true;
    if (/^valor\b/i.test(t)) return true;
    return false;
  }

  /**
   * Converte "R$ 1.676,5", "70,6" ou centavos numéricos em centavos inteiros.
   * @param {number|string} value
   * @returns {number|null}
   */
  function parseBrazilianCurrencyToCents(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? value : Math.round(value * 100);
    }
    var s = String(value).trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
    if (!s || !/[\d]/.test(s)) return null;
    if (s.indexOf(",") >= 0) {
      s = s.replace(/\./g, "").replace(",", ".");
    }
    var n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  /**
   * Formata data YYYY-MM-DD para DD/MM/YYYY (PT-BR) via Intl.
   * @param {string} dateStr
   * @returns {string}
   */
  function formatDateBR(dateStr) {
    if (!dateStr) return "—";
    var s = String(dateStr).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var parts = s.split("-");
      var y = parseInt(parts[0], 10);
      var mo = parseInt(parts[1], 10) - 1;
      var d = parseInt(parts[2], 10);
      try {
        return new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }).format(new Date(y, mo, d));
      } catch (_) {
        return parts[2] + "/" + parts[1] + "/" + parts[0];
      }
    }
    return s;
  }

  /** @deprecated use formatDateBR */
  function formatDate(dateStr) {
    return formatDateBR(dateStr);
  }

  /**
   * Competência mensal YYYY-MM → Junho/2026
   * @param {string} month
   * @returns {string}
   */
  function formatCompetenceBR(month) {
    if (!month) return "—";
    var s = String(month).trim();
    if (/^[A-Za-zÀ-ú]+\/\d{4}$/.test(s)) return s;
    var parts = s.split("-");
    if (parts.length === 2) {
      var m = parseInt(parts[1], 10);
      if (m >= 1 && m <= 12) return MONTH_NAMES_PT[m - 1] + "/" + parts[0];
    }
    return s;
  }

  /**
   * Formata mês YYYY-MM para MM/YYYY (filtros técnicos).
   * @param {string} month
   * @returns {string}
   */
  function formatMonth(month) {
    if (!month) return "—";
    var parts = String(month).split("-");
    if (parts.length === 2) return parts[1] + "/" + parts[0];
    return month;
  }

  /**
   * Data ou competência para exibição ao usuário.
   * @param {string} value
   * @returns {string}
   */
  function formatDisplayDate(value) {
    if (!value) return "—";
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDateBR(s);
    if (/^\d{4}-\d{2}$/.test(s)) return formatCompetenceBR(s);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (/^[A-Za-zÀ-ú]+\/\d{4}$/.test(s)) return s;
    return s;
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

  CFM.formatters = {
    formatCurrencyFromCents: formatCurrencyFromCents,
    formatCurrencyBRL: formatCurrencyBRL,
    parseBrazilianCurrencyToCents: parseBrazilianCurrencyToCents,
    formatDate: formatDate,
    formatDateBR: formatDateBR,
    formatDisplayDate: formatDisplayDate,
    formatMonth: formatMonth,
    formatCompetenceBR: formatCompetenceBR,
    formatFileSize: formatFileSize
  };
})(window.CFM);
