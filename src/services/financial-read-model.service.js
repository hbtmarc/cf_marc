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

  function getFinancialReadModel() {
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

    return data;
  }

  CFM.financialReadModel = {
    bucketToArray: bucketToArray,
    sumMonthTransactions: sumMonthTransactions,
    buildMonthlyHistory: buildMonthlyHistory,
    enrichCards: enrichCards,
    getFinancialReadModel: getFinancialReadModel
  };
})(window.CFM);
