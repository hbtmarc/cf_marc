/**
 * Read model financeiro local — Fase 0.5.1
 * Seletores e agregações sobre localStoreService (sem duplicar persistência).
 */
window.CFM = window.CFM || {};

(function (CFM) {
  function bucketToArray(bucket) {
    if (!bucket) return [];
    if (Array.isArray(bucket)) return bucket.slice();
    return Object.keys(bucket).map(function (id) {
      return bucket[id];
    });
  }

  function getStore() {
    return CFM.localStoreService || CFM.localStore || null;
  }

  function resolveCompetenceMonth(tx) {
    if (!tx) return "";
    if (tx.competenceMonth) return tx.competenceMonth;
    if (tx.date && tx.date.length >= 7) return tx.date.slice(0, 7);
    return "";
  }

  function isSettlementTransaction(tx) {
    if (!tx) return false;
    var recon = CFM.importReconciliation;
    if (recon && recon.isInvoicePaymentTransaction && recon.isInvoicePaymentTransaction(tx)) {
      return true;
    }
    var type = String(tx.type || "").toLowerCase();
    return /invoice_payment|bill_payment|credit_card_payment|card_payment|settlement|liquida/i.test(type);
  }

  function isCountableInflow(tx) {
    return !!(tx && tx.status !== "ignored" && tx.flow === "in");
  }

  function isCountableOutflow(tx) {
    return !!(tx && tx.status !== "ignored" && tx.flow === "out" && !isSettlementTransaction(tx));
  }

  function sumMonthTransactions(transactions, month) {
    var inCents = 0;
    var outCents = 0;
    var count = 0;
    (transactions || []).forEach(function (tx) {
      var cm = resolveCompetenceMonth(tx);
      if (month && cm !== month) return;
      count++;
      var amt = tx.amountCents || 0;
      if (isCountableInflow(tx)) inCents += amt;
      else if (isCountableOutflow(tx)) outCents += amt;
    });
    return {
      inCents: inCents,
      outCents: outCents,
      netCents: inCents - outCents,
      transactionCount: count
    };
  }

  function formatMonthShort(month) {
    if (!month || month.length < 7) return month || "";
    return month.slice(5, 7) + "/" + month.slice(0, 4);
  }

  function collectCompetenceMonths(transactions, invoices) {
    var set = {};
    (transactions || []).forEach(function (tx) {
      var m = resolveCompetenceMonth(tx);
      if (m) set[m] = true;
    });
    (invoices || []).forEach(function (inv) {
      if (inv && inv.competenceMonth) set[inv.competenceMonth] = true;
    });
    return Object.keys(set).sort(function (a, b) {
      return b.localeCompare(a);
    });
  }

  function buildMonthlyHistory(data) {
    var fmt = CFM.formatters || {};
    var months = collectCompetenceMonths(data.transactions, data.invoices);
    return months.map(function (month) {
      var sums = sumMonthTransactions(data.transactions, month);
      var invoiceCount = (data.invoices || []).filter(function (inv) {
        return inv.competenceMonth === month;
      }).length;
      return {
        competenceMonth: month,
        label: fmt.formatCompetenceBR ? fmt.formatCompetenceBR(month) : month,
        labelShort: formatMonthShort(month),
        inCents: sums.inCents,
        outCents: sums.outCents,
        netCents: sums.netCents,
        transactionCount: sums.transactionCount,
        invoiceCount: invoiceCount
      };
    });
  }

  function enrichCards(cards, invoices, transactions, plans) {
    return (cards || []).map(function (card) {
      var cardId = card.id;
      var linkedInvoices = (invoices || []).filter(function (inv) {
        return inv.cardId === cardId;
      });
      var linkedPurchases = (transactions || []).filter(function (tx) {
        return tx.cardId === cardId && isCountableOutflow(tx);
      });
      var linkedPlans = (plans || []).filter(function (p) {
        return p.cardId === cardId;
      });
      var limit = card.limitCents;
      var used = card.usedCents;
      var pct = null;
      if (typeof limit === "number" && limit > 0 && typeof used === "number") {
        pct = Math.min(100, Math.round((used / limit) * 100));
      }
      return {
        id: card.id,
        batchId: card.batchId,
        name: card.name || "",
        brand: card.brand || "",
        lastFour: card.lastFour || "",
        limitCents: limit,
        usedCents: used,
        availableCents: card.availableCents,
        hasSnapshot: !!card.hasSnapshot,
        invoiceCount: linkedInvoices.length,
        purchaseCount: linkedPurchases.length,
        installmentPlanCount: linkedPlans.length,
        usedPercent: pct
      };
    }).sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
  }

  function getCurrentCompetenceMonth() {
    var now = new Date();
    var m = now.getMonth() + 1;
    return now.getFullYear() + "-" + (m < 10 ? "0" + m : String(m));
  }

  function pickDashboardMonth(history, currentMonth) {
    if (!history || !history.length) return null;
    var i;
    for (i = 0; i < history.length; i++) {
      if (history[i].competenceMonth === currentMonth && history[i].transactionCount > 0) {
        return history[i];
      }
    }
    return history[0];
  }

  function emptyReadModel() {
    return {
      hasData: false,
      batchId: null,
      activeBatch: null,
      batch: null,
      batches: [],
      transactions: [],
      cards: [],
      invoices: [],
      installmentPlans: [],
      recurringRules: [],
      counts: {
        cards: 0,
        invoices: 0,
        transactions: 0,
        installmentPlans: 0,
        recurringRules: 0
      },
      enrichedCards: [],
      monthlyHistory: [],
      currentCompetenceMonth: getCurrentCompetenceMonth(),
      dashboardMonth: null,
      recurringOutCents: 0
    };
  }

  function dedupeCardsBySemanticKey(cards) {
    var diff = CFM.importDiff;
    if (!diff || !diff.buildCardSemanticKey) return cards || [];
    var seen = {};
    var out = [];
    (cards || []).forEach(function (card) {
      var key = diff.buildCardSemanticKey(card);
      if (key && seen[key]) return;
      if (key) seen[key] = true;
      out.push(card);
    });
    return out;
  }

  function normalizeExpenseGroupKey(tx) {
    var label = String(tx.categoryLabel || tx.category || tx.description || "Outros").trim();
    if (!label) label = "Outros";
    return label.length > 48 ? label.slice(0, 48) : label;
  }

  function isInvoiceOpen(inv) {
    if (!inv) return false;
    var status = String(inv.status || "").toLowerCase();
    if (/open|aberta|pending|due|unpaid|parcial|partial/.test(status)) return true;
    if (/paid|paga|closed|fechada|settled|liquidada/.test(status)) return false;
    return (inv.amountDueCents || 0) > 0;
  }

  function isInvoicePaid(inv) {
    if (!inv) return false;
    var status = String(inv.status || "").toLowerCase();
    if (/paid|paga|closed|fechada|settled|liquidada/.test(status)) return true;
    return !isInvoiceOpen(inv) && (inv.amountDueCents || 0) === 0 && (inv.totalCents || 0) > 0;
  }

  function getAvailableCompetenceMonths(data) {
    data = data || {};
    return collectCompetenceMonths(data.transactions, data.invoices);
  }

  function resolveDefaultCompetenceMonth(availableMonths, preferredMonth) {
    if (preferredMonth && availableMonths.indexOf(preferredMonth) >= 0) {
      return preferredMonth;
    }
    var current = getCurrentCompetenceMonth();
    if (availableMonths.indexOf(current) >= 0) return current;
    return availableMonths.length ? availableMonths[0] : "";
  }

  var DASHBOARD_MONTH_KEY = "cfm:dashboard:competenceMonth";

  function getStoredDashboardCompetenceMonth() {
    try {
      if (typeof sessionStorage !== "undefined") {
        return sessionStorage.getItem(DASHBOARD_MONTH_KEY) || "";
      }
    } catch (e) { /* ignore */ }
    return "";
  }

  function setStoredDashboardCompetenceMonth(month) {
    try {
      if (typeof sessionStorage !== "undefined" && month) {
        sessionStorage.setItem(DASHBOARD_MONTH_KEY, month);
      }
    } catch (e) { /* ignore */ }
  }

  function aggregateMonthSummary(data, competenceMonth) {
    var fmt = CFM.formatters || {};
    var sums = sumMonthTransactions(data.transactions, competenceMonth);
    var monthInvoices = (data.invoices || []).filter(function (inv) {
      return inv && inv.competenceMonth === competenceMonth;
    });
    var openInvoices = monthInvoices.filter(isInvoiceOpen);
    var paidInvoices = monthInvoices.filter(isInvoicePaid);
    var activeRecurring = (data.recurringRules || []).filter(function (rule) {
      return rule && rule.active !== false && !rule.candidate;
    });
    var recurringOutCents = activeRecurring.reduce(function (sum, rule) {
      if (String(rule.flow || "out") !== "out") return sum;
      return sum + (rule.amountCents || rule.expectedAmountCents || 0);
    }, 0);
    var futurePlans = (data.installmentPlans || []).filter(function (plan) {
      if (!plan) return false;
      var total = plan.totalInstallments || 0;
      var current = plan.currentInstallment || 0;
      return total > 0 && current < total;
    });
    var futureInstallmentCents = futurePlans.reduce(function (sum, plan) {
      return sum + (plan.installmentAmountCents || 0);
    }, 0);

    return {
      competenceMonth: competenceMonth,
      label: fmt.formatCompetenceBR ? fmt.formatCompetenceBR(competenceMonth) : competenceMonth,
      labelShort: formatMonthShort(competenceMonth),
      inCents: sums.inCents,
      outCents: sums.outCents,
      netCents: sums.netCents,
      transactionCount: sums.transactionCount,
      invoiceCount: monthInvoices.length,
      openInvoiceCount: openInvoices.length,
      paidInvoiceCount: paidInvoices.length,
      openInvoiceCents: openInvoices.reduce(function (s, inv) {
        return s + (inv.amountDueCents != null ? inv.amountDueCents : inv.totalCents || 0);
      }, 0),
      activeRecurringCount: activeRecurring.length,
      recurringOutCents: recurringOutCents,
      futureInstallmentCount: futurePlans.length,
      futureInstallmentCents: futureInstallmentCents
    };
  }

  function inferSortDate(competenceMonth, day) {
    if (!competenceMonth || competenceMonth.length < 7) return "9999-12-31";
    var d = day != null ? day : 15;
    var dd = d < 10 ? "0" + d : String(d);
    return competenceMonth + "-" + dd;
  }

  function getUpcomingDueItems(data, competenceMonth, limit) {
    limit = limit || 8;
    var items = [];
    var cardNameById = {};
    (data.cards || []).forEach(function (card) {
      if (card && card.id) cardNameById[card.id] = card.name || card.id;
    });

    (data.invoices || []).forEach(function (inv) {
      if (!inv || !isInvoiceOpen(inv)) return;
      if (!inv.competenceMonth) return;
      if (inv.competenceMonth < competenceMonth) return;
      items.push({
        type: "invoice",
        sortDate: inferSortDate(inv.competenceMonth, 28),
        competenceMonth: inv.competenceMonth,
        label: "Fatura " + (inv.competenceMonth || ""),
        detail: cardNameById[inv.cardId] || inv.cardName || "Cartão",
        amountCents: inv.amountDueCents != null ? inv.amountDueCents : inv.totalCents || 0,
        status: inv.status || "open"
      });
    });

    (data.recurringRules || []).forEach(function (rule) {
      if (!rule || rule.active === false || rule.candidate) return;
      items.push({
        type: "recurring",
        sortDate: inferSortDate(competenceMonth, 5),
        competenceMonth: competenceMonth,
        label: rule.description || "Recorrência",
        detail: rule.frequency || "mensal",
        amountCents: rule.amountCents || rule.expectedAmountCents || 0,
        status: "active"
      });
    });

    (data.installmentPlans || []).forEach(function (plan) {
      if (!plan) return;
      var total = plan.totalInstallments || 0;
      var current = plan.currentInstallment || 0;
      if (!total || current >= total) return;
      items.push({
        type: "installment",
        sortDate: inferSortDate(competenceMonth, 10),
        competenceMonth: competenceMonth,
        label: plan.description || "Parcelamento",
        detail: (cardNameById[plan.cardId] || plan.cardName || "Cartão") +
          " · " + (current + 1) + "/" + total,
        amountCents: plan.installmentAmountCents || 0,
        status: "pending"
      });
    });

    return items.sort(function (a, b) {
      return String(a.sortDate).localeCompare(String(b.sortDate)) ||
        String(a.label).localeCompare(String(b.label), "pt-BR");
    }).slice(0, limit);
  }

  function getAttentionCards(data, competenceMonth, enrichedCards) {
    enrichedCards = enrichedCards || enrichCards(
      data.cards, data.invoices, data.transactions, data.installmentPlans
    );
    var openByCard = {};
    (data.invoices || []).forEach(function (inv) {
      if (!inv || inv.competenceMonth !== competenceMonth || !isInvoiceOpen(inv)) return;
      openByCard[inv.cardId] = true;
    });

    var results = [];
    enrichedCards.forEach(function (card) {
      var reasons = [];
      if (openByCard[card.id]) reasons.push("fatura_aberta");
      if (card.usedPercent != null && card.usedPercent >= 70) {
        reasons.push(card.usedPercent >= 90 ? "limite_critico" : "limite_alto");
      }
      if (!reasons.length) return;
      results.push({
        id: card.id,
        name: card.name,
        lastFour: card.lastFour,
        usedPercent: card.usedPercent,
        limitCents: card.limitCents,
        usedCents: card.usedCents,
        availableCents: card.availableCents,
        reasons: reasons,
        severity: reasons.indexOf("limite_critico") >= 0 ? "high"
          : reasons.indexOf("fatura_aberta") >= 0 ? "medium" : "low"
      });
    });

    return results.sort(function (a, b) {
      var rank = { high: 0, medium: 1, low: 2 };
      return (rank[a.severity] || 9) - (rank[b.severity] || 9);
    });
  }

  function getTopExpenseGroups(data, competenceMonth, limit) {
    limit = limit || 6;
    var groups = {};
    (data.transactions || []).forEach(function (tx) {
      if (!isCountableOutflow(tx)) return;
      if (resolveCompetenceMonth(tx) !== competenceMonth) return;
      var key = normalizeExpenseGroupKey(tx);
      if (!groups[key]) {
        groups[key] = { label: key, amountCents: 0, count: 0 };
      }
      groups[key].amountCents += tx.amountCents || 0;
      groups[key].count++;
    });
    return Object.keys(groups).map(function (key) {
      return groups[key];
    }).sort(function (a, b) {
      return b.amountCents - a.amountCents;
    }).slice(0, limit);
  }

  function buildDashboardOperationalView(data, competenceMonth) {
    var availableMonths = getAvailableCompetenceMonths(data);
    var selectedMonth = resolveDefaultCompetenceMonth(
      availableMonths,
      competenceMonth || getStoredDashboardCompetenceMonth()
    );
    if (selectedMonth) setStoredDashboardCompetenceMonth(selectedMonth);

    return {
      availableMonths: availableMonths,
      selectedCompetenceMonth: selectedMonth,
      summary: selectedMonth ? aggregateMonthSummary(data, selectedMonth) : null,
      upcomingDueItems: selectedMonth ? getUpcomingDueItems(data, selectedMonth) : [],
      attentionCards: selectedMonth
        ? getAttentionCards(data, selectedMonth, data.enrichedCards)
        : [],
      topExpenseGroups: selectedMonth
        ? getTopExpenseGroups(data, selectedMonth)
        : []
    };
  }

  function getFinancialReadModel(options) {
    var store = getStore();
    if (!store || !store.getActiveFinancialData) return emptyReadModel();

    var raw = store.getActiveFinancialData();
    var batches = store.getImportBatches ? store.getImportBatches() : [];
    var counts = raw.counts || {
      cards: 0,
      invoices: 0,
      transactions: 0,
      installmentPlans: 0,
      recurringRules: 0
    };
    var hasData = !!(raw.batchId && (
      counts.transactions > 0 || counts.cards > 0 || counts.invoices > 0
    ));

    var data = {
      hasData: hasData,
      batchId: raw.batchId,
      activeBatch: raw.activeBatch || raw.batch || null,
      batch: raw.batch || null,
      batches: batches,
      transactions: raw.transactions || [],
      cards: dedupeCardsBySemanticKey(raw.cards || []),
      invoices: raw.invoices || [],
      installmentPlans: raw.installmentPlans || [],
      recurringRules: raw.recurringRules || [],
      counts: counts
    };
    if (data.cards.length !== (raw.cards || []).length) {
      data.counts = Object.assign({}, counts, { cards: data.cards.length });
    }

    data.enrichedCards = enrichCards(
      data.cards,
      data.invoices,
      data.transactions,
      data.installmentPlans
    );
    data.monthlyHistory = buildMonthlyHistory(data);
    data.currentCompetenceMonth = getCurrentCompetenceMonth();
    data.dashboardMonth = pickDashboardMonth(data.monthlyHistory, data.currentCompetenceMonth);
    data.recurringOutCents = (data.recurringRules || []).filter(function (rule) {
      return rule.active && !rule.candidate && rule.flow === "out";
    }).reduce(function (sum, rule) {
      return sum + (rule.amountCents || 0);
    }, 0);

    var competenceOverride = options && options.competenceMonth;
    data.dashboard = buildDashboardOperationalView(data, competenceOverride);
    data.dashboardMonth = data.dashboard.summary ||
      pickDashboardMonth(data.monthlyHistory, data.currentCompetenceMonth);

    return data;
  }

  CFM.financialReadModel = {
    bucketToArray: bucketToArray,
    sumMonthTransactions: sumMonthTransactions,
    buildMonthlyHistory: buildMonthlyHistory,
    enrichCards: enrichCards,
    getAvailableCompetenceMonths: getAvailableCompetenceMonths,
    aggregateMonthSummary: aggregateMonthSummary,
    getUpcomingDueItems: getUpcomingDueItems,
    getAttentionCards: getAttentionCards,
    getTopExpenseGroups: getTopExpenseGroups,
    buildDashboardOperationalView: buildDashboardOperationalView,
    setStoredDashboardCompetenceMonth: setStoredDashboardCompetenceMonth,
    getStoredDashboardCompetenceMonth: getStoredDashboardCompetenceMonth,
    resolveDefaultCompetenceMonth: resolveDefaultCompetenceMonth,
    isSettlementTransaction: isSettlementTransaction,
    isCountableOutflow: isCountableOutflow,
    isCountableInflow: isCountableInflow,
    getFinancialReadModel: getFinancialReadModel
  };
})(window.CFM);
