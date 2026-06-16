/**
 * Exemplos genéricos de regras de classificação — SEM dados pessoais reais.
 * Copie o padrão para classification-rules.local.js (gitignored) e adapte localmente.
 *
 * Fase 1+: regras serão persistidas em /users/{uid}/classificationRules/{ruleId}
 */
window.CFM = window.CFM || {};

CFM.classificationRulesExample = [
  {
    id: "example_internet_recurring",
    label: "Internet recorrente (exemplo genérico)",
    enabled: false,
    priority: 10,
    source: "example",
    match: {
      normalizedDescriptionIncludes: ["provedor internet demo", "operadora fibra demo"],
      type: "expense",
      flow: "out"
    },
    classification: {
      type: "expense",
      flow: "out",
      categoryLabel: "Internet / Telecom",
      recurring: true,
      recurrenceFrequency: "monthly",
      autoResolve: true,
      reviewPriority: "none",
      confidence: "high",
      note: "Exemplo desabilitado — ative apenas como referência."
    }
  },
  {
    id: "example_pix_sent_person",
    label: "Pix enviado para pessoa (exemplo genérico)",
    enabled: false,
    priority: 5,
    source: "example",
    match: {
      pixSentToPerson: true
    },
    classification: {
      type: "expense",
      flow: "out",
      categoryLabel: "Despesa pessoal / Pix enviado",
      autoResolve: true,
      reviewPriority: "none",
      confidence: "medium",
      note: "Exemplo desabilitado."
    }
  }
];
