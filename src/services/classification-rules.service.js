/**
 * Motor de regras pessoais de classificação — Fase 0.3.5
 * Regras locais não são versionadas; carregadas de classification-rules.local.js (opcional).
 * NUNCA logar regras completas com transações no console.
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var MATCH_THRESHOLD = 65;

  function norm(val) {
    var v = CFM.validators && CFM.validators.normalizeDescription;
    return v ? v(val) : String(val || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function getDayOfMonth(tx) {
    var d = tx && (tx.date || tx.transactionDate || tx.postedDate || "");
    if (!d || d.length < 10) return null;
    var day = parseInt(d.substring(8, 10), 10);
    return isNaN(day) ? null : day;
  }

  function textBlob(tx, context) {
    var desc = String((tx && tx.description) || "");
    var reason = String((tx && tx.review && tx.review.reason) || "");
    return (desc + " " + reason).toLowerCase();
  }

  function isPixSentToPerson(tx) {
    if (!tx || tx.flow !== "out") return false;
    var blob = textBlob(tx);
    if (!/pix/i.test(blob)) return false;
    if (/receb/i.test(blob) && !/enviad/i.test(blob)) return false;
    return /enviad|para\s|transferência pix|pix para/i.test(blob) ||
      (/pix/i.test(blob) && /pessoa\s*f[ií]sica|cpf|\bpf\b/i.test(blob));
  }

  function isPixReceivedFromPerson(tx) {
    if (!tx || tx.flow !== "in") return false;
    var blob = textBlob(tx);
    if (!/pix/i.test(blob)) return false;
    return /receb|de\s|pix de/i.test(blob) &&
      /pessoa\s*f[ií]sica|cpf|\bpf\b/i.test(blob);
  }

  function isTedReceived(tx) {
    if (!tx || tx.flow !== "in") return false;
    var blob = textBlob(tx);
    return /ted/i.test(blob) && (/receb|cr[eé]dito|entrada/i.test(blob) || tx.type === "income");
  }

  function isOwnAccountHint(tx) {
    var blob = textBlob(tx);
    return /titularidade|conta pr[oó]pria|entre contas|transfer[eê]ncia interna|mesma titular|conta pr[oó]pria|espelh/i.test(blob);
  }

  function isIfoodDelivery(tx) {
    var d = String((tx && tx.description) || "");
    return /^ifd/i.test(d) || /ifood/i.test(d);
  }

  function descriptionStartsWithAny(tx, prefixes) {
    var d = String((tx && tx.description) || "");
    var u = d.toUpperCase();
    return (prefixes || []).some(function (p) {
      var pu = String(p || "").toUpperCase();
      return u.indexOf(pu) === 0 || (pu === "IFD" && /^IFD/i.test(d));
    });
  }

  function includesAny(haystack, needles) {
    if (!needles || !needles.length) return true;
    var h = String(haystack || "").toLowerCase();
    return needles.some(function (n) {
      return h.indexOf(String(n || "").toLowerCase()) >= 0;
    });
  }

  function scoreRuleMatch(tx, rule, context) {
    if (!tx || !rule || rule.enabled === false) return 0;
    var m = rule.match || {};
    var score = 0;
    var max = 0;

    function weigh(points, ok) {
      max += points;
      if (ok) score += points;
    }

    if (m.descriptionIncludes && m.descriptionIncludes.length) {
      weigh(20, includesAny(tx.description, m.descriptionIncludes));
    }
    if (m.normalizedDescriptionIncludes && m.normalizedDescriptionIncludes.length) {
      var nd = norm(tx.description);
      weigh(25, m.normalizedDescriptionIncludes.some(function (n) {
        return nd.indexOf(norm(n)) >= 0;
      }));
    }
    if (m.reviewReasonIncludes && m.reviewReasonIncludes.length) {
      weigh(15, includesAny(tx.review && tx.review.reason, m.reviewReasonIncludes));
    }
    if (m.type) {
      weigh(10, tx.type === m.type);
    }
    if (m.flow) {
      weigh(10, tx.flow === m.flow);
    }
    if (m.amountCents != null) {
      weigh(15, tx.amountCents === m.amountCents);
    }
    if (m.amountRangeCents) {
      var min = m.amountRangeCents.min != null ? m.amountRangeCents.min : 0;
      var maxA = m.amountRangeCents.max != null ? m.amountRangeCents.max : Infinity;
      weigh(15, tx.amountCents >= min && tx.amountCents <= maxA);
    }
    if (m.competenceMonthPattern) {
      var re = m.competenceMonthPattern instanceof RegExp
        ? m.competenceMonthPattern
        : new RegExp(m.competenceMonthPattern);
      weigh(8, re.test(tx.competenceMonth || ""));
    }
    if (m.dayOfMonthRange) {
      var day = getDayOfMonth(tx);
      var dMin = m.dayOfMonthRange.min != null ? m.dayOfMonthRange.min : 1;
      var dMax = m.dayOfMonthRange.max != null ? m.dayOfMonthRange.max : 31;
      weigh(5, day != null && day >= dMin && day <= dMax);
    }
    if (m.institution) {
      weigh(5, (context && context.institution) === m.institution);
    }
    if (m.documentType) {
      weigh(5, (context && context.documentType) === m.documentType);
    }
    if (m.pixSentToPerson === true) {
      weigh(20, isPixSentToPerson(tx));
    }
    if (m.pixReceivedFromPerson === true) {
      weigh(20, isPixReceivedFromPerson(tx));
    }
    if (m.tedReceived === true) {
      weigh(20, isTedReceived(tx));
    }
    if (m.descriptionStartsWith && m.descriptionStartsWith.length) {
      weigh(25, descriptionStartsWithAny(tx, m.descriptionStartsWith));
    }
    if (m.ifoodDelivery === true) {
      weigh(25, isIfoodDelivery(tx));
    }

    if (max === 0) return 0;
    return Math.round((score / max) * 100);
  }

  function matchRule(tx, rule, context) {
    return scoreRuleMatch(tx, rule, context) >= MATCH_THRESHOLD;
  }

  function explainRuleMatch(rule, tx, score) {
    var c = rule.classification || {};
    var parts = [rule.label || rule.id || "Regra"];
    if (c.categoryLabel) parts.push("→ " + c.categoryLabel);
    if (c.recurring) parts.push("(recorrente)");
    if (score != null) parts.push("[" + score + "%]");
    return parts.join(" ");
  }

  function resolveInstallmentFromRule(tx, classification) {
    if (!classification) return null;
    var cur = null;
    var total = classification.totalInstallments || null;
    if (classification.installmentCurrentByCompetence && tx.competenceMonth) {
      cur = classification.installmentCurrentByCompetence[tx.competenceMonth];
    }
    if (cur == null && tx.installment && tx.installment.current) {
      cur = tx.installment.current;
    }
    if (cur == null && classification.knownCurrentInstallment) {
      cur = classification.knownCurrentInstallment;
    }
    if (cur == null && total == null) return null;
    var remaining = total && cur ? Math.max(0, total - cur) : null;
    return { current: cur, total: total, remaining: remaining };
  }

  function applyClassificationRules(tx, context, rules) {
    if (!tx || !rules || !rules.length) {
      return { matched: false, score: 0 };
    }

    var best = null;
    var bestScore = 0;

    rules.forEach(function (rule) {
      if (rule.enabled === false) return;
      var s = scoreRuleMatch(tx, rule, context);
      if (s >= MATCH_THRESHOLD && s > bestScore) {
        bestScore = s;
        best = rule;
      }
    });

    if (!best) return { matched: false, score: 0 };

    var cls = best.classification || {};
    var autoResolve = cls.autoResolve === true;
    var reviewPriority = cls.reviewPriority || "none";

    if (best.match && best.match.pixSentToPerson && isOwnAccountHint(tx)) {
      autoResolve = false;
      reviewPriority = "important";
    }

    if (best.match && best.match.tedReceived && bestScore < 80) {
      autoResolve = false;
      reviewPriority = reviewPriority === "none" ? "low" : reviewPriority;
    }

    if (best.match && best.match.pixReceivedFromPerson) {
      autoResolve = false;
      reviewPriority = reviewPriority === "none" ? "low" : reviewPriority;
    }

    var installment = resolveInstallmentFromRule(tx, cls);

    return {
      matched:          true,
      ruleId:           best.id,
      ruleLabel:        best.label || best.id,
      ruleSource:       best.source || "personal_local",
      score:            bestScore,
      explanation:      explainRuleMatch(best, tx, bestScore),
      classification:   cls,
      autoResolve:      autoResolve,
      reviewPriority:   reviewPriority,
      installment:      installment,
      suggestedCategory: cls.categoryLabel || cls.categoryId || "",
      isFinancing:      !!(cls.financing || cls.installmentKind === "financing"),
      isRecurring:      !!cls.recurring
    };
  }

  function loadClassificationRules() {
    var local = Array.isArray(CFM.classificationRulesLocal)
      ? CFM.classificationRulesLocal.slice() : [];
    var examples = Array.isArray(CFM.classificationRulesExample)
      ? CFM.classificationRulesExample.slice() : [];

    return local.concat(examples)
      .filter(function (r) { return r && r.enabled !== false; })
      .sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
  }

  function applyRulesToTransactions(transactions, context) {
    var rules = loadClassificationRules();
    var results = [];
    if (!Array.isArray(transactions)) return results;

    transactions.forEach(function (tx, index) {
      if (!tx) return;
      var applied = applyClassificationRules(tx, context, rules);
      if (applied.matched) {
        applied.transactionIndex = index;
        results.push(applied);
      }
    });
    return results;
  }

  function recurrenceNormalizedKey(item) {
    var desc = norm(item.description || "");
    return desc + "|" + (item.flow || "out") + "|" + (item.frequency || "monthly");
  }

  function dedupeRecognizedRecurrences(items) {
    var map = {};
    (items || []).forEach(function (item) {
      if (!item) return;
      var key = recurrenceNormalizedKey(item);
      if (!map[key]) {
        map[key] = Object.assign({}, item, {
          sourceLabels: item.sourceLabel ? [item.sourceLabel] : [],
          sources:      item.source ? [item.source] : [],
          recurrenceKinds: item.recurrenceKind ? [item.recurrenceKind] : []
        });
        return;
      }
      var merged = map[key];
      if (item.sourceLabel && merged.sourceLabels.indexOf(item.sourceLabel) < 0) {
        merged.sourceLabels.push(item.sourceLabel);
      }
      if (item.source && merged.sources.indexOf(item.source) < 0) {
        merged.sources.push(item.source);
      }
      if (item.recurrenceKind && merged.recurrenceKinds.indexOf(item.recurrenceKind) < 0) {
        merged.recurrenceKinds.push(item.recurrenceKind);
      }
      if (item.expectedAmountCents && !merged.expectedAmountCents) {
        merged.expectedAmountCents = item.expectedAmountCents;
      }
      if (item.ruleId) merged.ruleId = item.ruleId;
      if (merged.recurrenceKinds.length > 1) merged.recurrenceKind = "merged";
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function buildRecognizedRecurrences(ruleApplications, jsonRules, similarityPairs) {
    var seen = {};
    var list = [];

    function add(item) {
      var key = item.id || item.description + "|" + item.source;
      if (seen[key]) return;
      seen[key] = true;
      list.push(item);
    }

    (jsonRules || []).forEach(function (rule) {
      if (!rule) return;
      add({
        id:          rule.externalRef || rule.id || "",
        externalRef: rule.externalRef || rule.id || "",
        description: rule.description || "",
        expectedAmountCents: rule.expectedAmountCents || rule.amountCents || 0,
        type:        rule.type || "expense",
        flow:        rule.flow || "out",
        frequency:   rule.frequency || "monthly",
        categoryLabel: rule.categoryLabel || rule.category || "",
        startCompetenceMonth: rule.startCompetenceMonth || "",
        sourcePattern: rule.sourcePattern || "",
        sourceInstitution: rule.sourceInstitution || "",
        source:      "imported_json",
        sourceLabel: "Importada do JSON",
        recurrenceKind: rule.status === "candidate" || rule.candidate === true
          ? "candidate" : "imported",
        status:      rule.status || "",
        active:      rule.active,
        userConfirmed: rule.userConfirmed,
        candidate:   rule.candidate,
        isActive:    rule.status === "candidate" || rule.candidate === true
          ? false : rule.isActive !== false
      });
    });

    (ruleApplications || []).forEach(function (app) {
      if (!app.isRecurring || !app.classification) return;
      var c = app.classification;
      add({
        id:          "rule_" + app.ruleId,
        description: app.ruleLabel,
        expectedAmountCents: 0,
        flow:        c.flow || "out",
        frequency:   c.recurrenceFrequency || "monthly",
        categoryLabel: c.categoryLabel || c.categoryId || "",
        source:      app.ruleSource || "personal_local",
        sourceLabel: app.ruleSource === "personal_local" ? "Regra pessoal local" : "Regra de exemplo",
        recurrenceKind: "personal_rule",
        isActive:    true,
        ruleId:      app.ruleId,
        confidence:  app.score
      });
    });

    (similarityPairs || []).forEach(function (pair) {
      add({
        id:          "sim_" + pair.index1 + "_" + pair.index2,
        description: pair.description || "Recorrência candidata",
        expectedAmountCents: 0,
        flow:        "out",
        frequency:   "monthly",
        categoryLabel: "",
        source:      "engine_suggested",
        sourceLabel: "Sugerida pelo motor",
        recurrenceKind: "candidate",
        isActive:    true,
        confidence:  pair.confidence || "medium"
      });
    });

    return list;
  }

  function buildRecognizedFinancing(ruleApplications, installmentPlans, transactions) {
    var list = [];

    (installmentPlans || []).forEach(function (plan) {
      if (!plan) return;
      var kind = plan.kind || "unknown";
      list.push({
        id:                 plan.id || "",
        description:        plan.description || "",
        kind:               kind,
        kindLabel:          plan.kindLabel || "",
        totalInstallments:  plan.totalInstallments || 0,
        currentInstallment: plan.currentInstallment || 0,
        remainingMonths:    plan.totalInstallments && plan.currentInstallment
          ? Math.max(0, plan.totalInstallments - plan.currentInstallment) : null,
        installmentAmtFmt:  plan.installmentAmtFmt || "",
        source:             "imported_json",
        sourceLabel:        "Importado do JSON",
        isFinancing:        kind === "financing"
      });
    });

    var financingSeen = {};
    (ruleApplications || []).forEach(function (app) {
      if (!app.isFinancing && !(app.classification && app.classification.installmentKind === "financing")) return;
      var key = app.ruleId;
      if (financingSeen[key]) return;
      financingSeen[key] = true;
      var inst = app.installment || {};
      var tx = transactions && transactions[app.transactionIndex];
      list.push({
        id:                 "fin_" + app.ruleId,
        description:        (tx && tx.description) ? String(tx.description).substring(0, 80) : app.ruleLabel,
        kind:               "financing",
        kindLabel:          "Financiamento",
        totalInstallments:  inst.total || app.classification.totalInstallments || 0,
        currentInstallment: inst.current || 0,
        remainingMonths:    inst.remaining,
        installmentAmtFmt:  tx && tx.amountCents ? tx.amountCents : 0,
        source:             app.ruleSource || "personal_local",
        sourceLabel:        "Regra pessoal local",
        isFinancing:        true,
        ruleId:             app.ruleId
      });
    });

    return list;
  }

  CFM.classificationRulesService = {
    loadClassificationRules:     loadClassificationRules,
    applyClassificationRules:    applyClassificationRules,
    applyRulesToTransactions:    applyRulesToTransactions,
    matchRule:                   matchRule,
    scoreRuleMatch:              scoreRuleMatch,
    explainRuleMatch:            explainRuleMatch,
    buildRecognizedRecurrences:  buildRecognizedRecurrences,
    dedupeRecognizedRecurrences: dedupeRecognizedRecurrences,
    buildRecognizedFinancing:    buildRecognizedFinancing,
    isPixSentToPerson:           isPixSentToPerson,
    isPixReceivedFromPerson:     isPixReceivedFromPerson,
    isTedReceived:               isTedReceived,
    isOwnAccountHint:            isOwnAccountHint,
    isIfoodDelivery:             isIfoodDelivery
  };
})(window.CFM);
