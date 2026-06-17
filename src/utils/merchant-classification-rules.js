/**
 * Regras locais de classificação por estabelecimento — Fase 0.3.10
 * Enriquecimento interpretativo do importador; não altera o JSON canônico.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  /**
   * Normaliza descrição para matching: remove ruído EC/EBN/WWW/parcelamento.
   */
  function normalizeMerchantDescription(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bec\s*\*?\s*/g, " ")
      .replace(/\bebn\s*\*?\s*/g, " ")
      .replace(/\bwww\./g, "")
      .replace(/\bparcelamento de compra\s*[-–—:]\s*/g, " ")
      .replace(/\bparcela?\s*\d+\s*[/\\]\s*\d+\b/g, " ")
      .replace(/[*#]/g, " ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var MERCHANT_RULES = [
    {
      id: "f1tv",
      pattern: /(?:^|\s)(?:f1\s*com|f1tv|www\s*f1\s*com)(?:\s|$)/,
      categoryLabel: "Assinaturas / Streaming",
      subcategoryLabel: "Esporte / F1TV",
      merchantDisplayName: "F1TV",
      confidence: "high",
      source: "user_rule",
      reviewRequired: false
    },
    {
      id: "t360graus",
      pattern: /(?:^|\s)t360\s*graus(?:\s|$)|(?:^|\s)t360graus(?:\s|$)/,
      categoryLabel: "Lazer / Turismo",
      subcategoryLabel: "Ecoturismo / Passeio",
      merchantDisplayName: "T360graus",
      confidence: "high",
      source: "user_rule",
      reviewRequired: false
    },
    {
      id: "ellisimports",
      pattern: /(?:^|\s)ellis\s*imports(?:\s|$)|(?:^|\s)ellisimports(?:\s|$)/,
      categoryLabel: "Tecnologia / Apple",
      subcategoryLabel: "MacBook / Importados",
      merchantDisplayName: "Ellisimports",
      confidence: "high",
      source: "user_rule",
      reviewRequired: false
    },
    {
      id: "epidemic_sound",
      pattern: /(?:^|\s)epidemic\s*sound(?:\s|$)|(?:^|\s)epidemicsd(?:\s|$)/,
      categoryLabel: "Audiovisual / Áudio",
      subcategoryLabel: "Assinatura / Epidemic Sound",
      merchantDisplayName: "Epidemic Sound",
      confidence: "high",
      source: "user_rule",
      reviewRequired: false
    },
    {
      id: "llcomunidade",
      pattern: /(?:^|\s)ll\s*comunidade(?:\s|$)|(?:^|\s)llcomunidade(?:\s|$)/,
      categoryLabel: "Tecnologia / Aplicativos",
      subcategoryLabel: "Social Media / Instagram",
      merchantDisplayName: "LL Comunidade",
      confidence: "high",
      source: "user_rule",
      reviewRequired: false
    }
  ];

  function classifyMerchantDescription(description) {
    var norm = normalizeMerchantDescription(description);
    var raw = String(description || "").toLowerCase();
    var i, rule, matched;

    for (i = 0; i < MERCHANT_RULES.length; i++) {
      rule = MERCHANT_RULES[i];
      matched = rule.pattern.test(norm) || rule.pattern.test(raw);
      if (!matched && rule.id === "f1tv") {
        matched = /f1\.com|www\.f1\.com|f1tv/i.test(raw);
      }
      if (!matched && rule.id === "epidemic_sound") {
        matched = /ebn\s*\*?\s*epidemicsd|epidemicsd/i.test(raw);
      }
      if (matched) {
        return {
          ruleId: rule.id,
          pattern: rule.pattern,
          categoryLabel: rule.categoryLabel,
          subcategoryLabel: rule.subcategoryLabel,
          merchantDisplayName: rule.merchantDisplayName,
          confidence: rule.confidence,
          source: rule.source,
          reviewRequired: rule.reviewRequired === true
        };
      }
    }
    return null;
  }

  /**
   * Aplica regras por índice de transação — enriquecimento derivado, sem mutar payload.
   */
  function applyToTransactions(transactions) {
    var byIndex = {};
    var applied = [];

    (transactions || []).forEach(function (tx, idx) {
      if (!tx) return;
      var match = classifyMerchantDescription(tx.description);
      if (!match) return;
      byIndex[idx] = match;
      applied.push(Object.assign({ transactionIndex: idx }, match));
    });

    return {
      byIndex: byIndex,
      applied: applied,
      appliedCount: applied.length
    };
  }

  function isMerchantClassified(index, merchantCtx) {
    return !!(merchantCtx && merchantCtx.byIndex && merchantCtx.byIndex[index]);
  }

  CFM.merchantClassificationRules = {
    MERCHANT_RULES:              MERCHANT_RULES,
    normalizeMerchantDescription: normalizeMerchantDescription,
    classifyMerchantDescription: classifyMerchantDescription,
    applyToTransactions:         applyToTransactions,
    isMerchantClassified:        isMerchantClassified
  };
})(window.CFM);
