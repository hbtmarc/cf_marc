/**
 * Persistência local via localStorage — Fase 0.5.0
 * Namespace cfm:v1:* — compatível com GitHub Pages (sem backend).
 */
window.CFM = window.CFM || {};

(function (CFM) {
  var STORAGE_KEY = "cfm:v1:appData";
  var DATA_VERSION = "cfm.local.v1";

  function getStorageBackend() {
    if (CFM._localStorageBackend) return CFM._localStorageBackend;
    if (typeof localStorage !== "undefined") return localStorage;
    return null;
  }

  function emptyAppData() {
    return {
      version: DATA_VERSION,
      updatedAt: null,
      activeBatchId: null,
      importBatches: {},
      cards: {},
      invoices: {},
      transactions: {},
      installmentPlans: {},
      recurringRules: {}
    };
  }

  function getStorageVersion() {
    return DATA_VERSION;
  }

  function loadAppData() {
    var storage = getStorageBackend();
    if (!storage) return emptyAppData();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return emptyAppData();
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== DATA_VERSION) return emptyAppData();
      return parsed;
    } catch (e) {
      return emptyAppData();
    }
  }

  function saveAppData(data) {
    var storage = getStorageBackend();
    if (!storage) return false;
    data.version = DATA_VERSION;
    data.updatedAt = new Date().toISOString();
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function findBatchIdBySignature(appData, signature) {
    if (!signature || !appData.importBatches) return null;
    var ids = Object.keys(appData.importBatches);
    for (var i = 0; i < ids.length; i++) {
      var batch = appData.importBatches[ids[i]];
      if (batch && batch.signature === signature) return ids[i];
    }
    return null;
  }

  function hasImportBatch(batchSignature) {
    return !!findBatchIdBySignature(loadAppData(), batchSignature);
  }

  function removeBatchEntities(appData, batchId) {
    ["cards", "invoices", "transactions", "installmentPlans", "recurringRules"].forEach(function (key) {
      var bucket = appData[key] || {};
      Object.keys(bucket).forEach(function (entityId) {
        if (bucket[entityId] && bucket[entityId].batchId === batchId) {
          delete bucket[entityId];
        }
      });
    });
    if (appData.importBatches && appData.importBatches[batchId]) {
      delete appData.importBatches[batchId];
    }
    if (appData.activeBatchId === batchId) {
      appData.activeBatchId = null;
    }
  }

  function mergeEntitySafe(existing, incoming) {
    if (!incoming) return existing;
    if (!existing) return incoming;
    var merged = Object.assign({}, existing, incoming);
    if (existing.batchId && !incoming.batchId) merged.batchId = existing.batchId;
    if (incoming.hasSnapshot && incoming.limitCents != null) {
      merged.limitCents = incoming.limitCents;
      merged.usedCents = incoming.usedCents;
      merged.availableCents = incoming.availableCents;
      merged.hasSnapshot = true;
    }
    return merged;
  }

  function mergeBucketSafe(appData, targetKey, source, keyField) {
    appData[targetKey] = appData[targetKey] || {};
    Object.keys(source || {}).forEach(function (id) {
      var incoming = source[id];
      var existing = appData[targetKey][id];
      if (existing) {
        appData[targetKey][id] = mergeEntitySafe(existing, incoming);
      } else {
        appData[targetKey][id] = incoming;
      }
    });
  }

  function computeConsolidatedCounts(appData) {
    function len(bucket) {
      return Object.keys(bucket || {}).length;
    }
    return {
      cards: len(appData.cards),
      invoices: len(appData.invoices),
      transactions: len(appData.transactions),
      installmentPlans: len(appData.installmentPlans),
      recurringRules: len(appData.recurringRules)
    };
  }

  function updateActiveBatchCounts(appData) {
    if (!appData.activeBatchId || !appData.importBatches[appData.activeBatchId]) return;
    appData.importBatches[appData.activeBatchId].counts = computeConsolidatedCounts(appData);
  }

  function mergeIncrementalPayload(appData, payload) {
    if (!payload) return appData;
    var targetBatchId = appData.activeBatchId || payload.batchId;
    if (!appData.activeBatchId) {
      appData.importBatches[payload.batchId] = payload.batch;
      appData.activeBatchId = payload.batchId;
      targetBatchId = payload.batchId;
    } else if (appData.importBatches[targetBatchId]) {
      appData.importBatches[targetBatchId].importedAt = new Date().toISOString();
    }

    function assignBatchId(bucket) {
      Object.keys(bucket || {}).forEach(function (id) {
        if (bucket[id]) bucket[id].batchId = targetBatchId;
      });
    }

    assignBatchId(payload.cards);
    assignBatchId(payload.invoices);
    assignBatchId(payload.transactions);
    assignBatchId(payload.installmentPlans);
    assignBatchId(payload.recurringRules);

    mergeBucketSafe(appData, "cards", payload.cards);
    mergeBucketSafe(appData, "invoices", payload.invoices);
    mergeBucketSafe(appData, "transactions", payload.transactions);
    mergeBucketSafe(appData, "installmentPlans", payload.installmentPlans);
    mergeBucketSafe(appData, "recurringRules", payload.recurringRules);
    updateActiveBatchCounts(appData);
    return appData;
  }


  function mergeBatchPayload(appData, payload) {
    if (!payload || !payload.batchId) return appData;
    appData.importBatches[payload.batchId] = payload.batch;
    appData.activeBatchId = payload.batchId;

    function mergeBucket(targetKey, source) {
      appData[targetKey] = appData[targetKey] || {};
      Object.keys(source || {}).forEach(function (id) {
        appData[targetKey][id] = source[id];
      });
    }

    mergeBucket("cards", payload.cards);
    mergeBucket("invoices", payload.invoices);
    mergeBucket("transactions", payload.transactions);
    mergeBucket("installmentPlans", payload.installmentPlans);
    mergeBucket("recurringRules", payload.recurringRules);
    return appData;
  }

  function analyzeDiff(report, decisions) {
    var diff = CFM.importDiff;
    if (!diff || !diff.analyzeImportDiff) {
      return { status: "fresh", newTransactions: [], changedExisting: [] };
    }
    return diff.analyzeImportDiff(report, decisions);
  }

  /**
   * @param {Object} report
   * @param {Object} decisions
   * @returns {{ ok: boolean, batchId?: string, counts?: Object, error?: string }}
   */
  function saveImportBatch(report, decisions) {
    var persist = CFM.importPersistence;
    if (!persist || !persist.buildImportBatchPayload) {
      return { ok: false, error: "Serviço de persistência indisponível." };
    }
    decisions = decisions || {};
    var diffResult = analyzeDiff(report, decisions);
    if (diffResult.blockedSave ||
        diffResult.status === "no_new_occurrences" ||
        diffResult.status === "legacy_overlap" ||
        diffResult.status === "legacy_overlap_blocked" ||
        diffResult.status === "requires_review" ||
        diffResult.status === "unsafe_legacy_import") {
      return {
        ok: false,
        noNewOccurrences: diffResult.status === "no_new_occurrences",
        legacyOverlap: diffResult.status !== "no_new_occurrences",
        blockedSave: !!diffResult.blockedSave,
        requiresReview: diffResult.status === "requires_review",
        duplicate: !!diffResult.sameBatchExists,
        signature: diffResult.batchSignature
      };
    }
    if (diffResult.status === "incremental" && diffResult.safeIncremental !== false) {
      return saveIncrementalImport(report, decisions, diffResult);
    }
    if (diffResult.status === "incremental") {
      return {
        ok: false,
        blockedSave: true,
        requiresReview: true,
        legacyOverlap: true,
        signature: diffResult.batchSignature
      };
    }

    var payload = persist.buildImportBatchPayload(report, decisions);
    var appData = loadAppData();
    var existingId = findBatchIdBySignature(appData, payload.signature);
    if (existingId) {
      return {
        ok: false,
        duplicate: true,
        noNewOccurrences: true,
        existingBatchId: existingId,
        signature: payload.signature
      };
    }
    mergeBatchPayload(appData, payload);
    if (!saveAppData(appData)) {
      return { ok: false, error: "Não foi possível salvar no armazenamento local." };
    }
    return { ok: true, batchId: payload.batchId, counts: payload.batch.counts, signature: payload.signature };
  }

  function saveIncrementalImport(report, decisions, diffResult) {
    var persist = CFM.importPersistence;
    if (!persist || !persist.buildIncrementalImportPayload) {
      return { ok: false, error: "Serviço de persistência indisponível." };
    }
    diffResult = diffResult || analyzeDiff(report, decisions);
    if (diffResult.blockedSave || diffResult.safeIncremental === false) {
      return {
        ok: false,
        blockedSave: true,
        requiresReview: diffResult.status === "requires_review",
        legacyOverlap: true,
        signature: diffResult.batchSignature
      };
    }
    var safeNew = diffResult.safeNewTransactions || diffResult.newTransactions || [];
    if (!safeNew.length) {
      return { ok: false, noNewOccurrences: true, signature: diffResult.batchSignature };
    }
    var payload = persist.buildIncrementalImportPayload(report, decisions, diffResult);
    var appData = loadAppData();
    mergeIncrementalPayload(appData, payload);
    if (!saveAppData(appData)) {
      return { ok: false, error: "Não foi possível salvar a importação incremental." };
    }
    return {
      ok: true,
      incremental: true,
      batchId: appData.activeBatchId,
      counts: {
        transactions: Object.keys(payload.transactions || {}).length,
        cards: Object.keys(payload.cards || {}).length,
        invoices: Object.keys(payload.invoices || {}).length,
        installmentPlans: Object.keys(payload.installmentPlans || {}).length,
        recurringRules: Object.keys(payload.recurringRules || {}).length
      },
      addedCounts: {
        transactions: safeNew.length
      },
      signature: diffResult.batchSignature
    };
  }

  /**
   * @param {string} batchSignature
   * @param {Object} report
   * @param {Object} decisions
   */
  function replaceImportBatch(batchSignature, report, decisions) {
    var persist = CFM.importPersistence;
    if (!persist || !persist.buildImportBatchPayload) {
      return { ok: false, error: "Serviço de persistência indisponível." };
    }
    var payload = persist.buildImportBatchPayload(report, decisions);
    if (payload.signature !== batchSignature) {
      payload.batch.signature = batchSignature;
      payload.signature = batchSignature;
      payload.batch.signature = batchSignature;
    }
    var appData = loadAppData();
    var existingId = findBatchIdBySignature(appData, batchSignature);
    if (existingId) removeBatchEntities(appData, existingId);
    mergeBatchPayload(appData, payload);
    if (!saveAppData(appData)) {
      return { ok: false, error: "Não foi possível substituir a importação." };
    }
    return { ok: true, batchId: payload.batchId, counts: payload.batch.counts, replaced: true };
  }

  function buildImportBatchPayload(report, decisions) {
    var persist = CFM.importPersistence;
    if (!persist || !persist.buildImportBatchPayload) return null;
    return persist.buildImportBatchPayload(report, decisions);
  }

  function getImportBatches() {
    var app = loadAppData();
    return Object.keys(app.importBatches || {}).map(function (id) {
      return app.importBatches[id];
    }).sort(function (a, b) {
      return String(b.importedAt || "").localeCompare(String(a.importedAt || ""));
    });
  }

  function getActiveFinancialData() {
    var app = loadAppData();
    var batches = getImportBatches();
    var emptyCounts = {
      cards: 0,
      invoices: 0,
      transactions: 0,
      installmentPlans: 0,
      recurringRules: 0
    };

    function bucketToArray(bucket) {
      if (!bucket) return [];
      return Object.keys(bucket).map(function (id) {
        return bucket[id];
      });
    }

    var cards = bucketToArray(app.cards);
    var invoices = bucketToArray(app.invoices);
    var transactions = bucketToArray(app.transactions);
    var installmentPlans = bucketToArray(app.installmentPlans);
    var recurringRules = bucketToArray(app.recurringRules);
    var counts = computeConsolidatedCounts(app);
    var batchId = app.activeBatchId || null;
    var activeBatch = batchId ? app.importBatches[batchId] : null;

    if (!activeBatch && batches.length) {
      activeBatch = batches[0];
      batchId = activeBatch.id;
    }
    var hasData = counts.transactions > 0 || counts.cards > 0 || counts.invoices > 0;

    if (!hasData) {
      return {
        hasData: false,
        batchId: null,
        batch: null,
        activeBatch: null,
        batches: batches,
        cards: [],
        invoices: [],
        transactions: [],
        installmentPlans: [],
        recurringRules: [],
        counts: emptyCounts
      };
    }

    if (activeBatch) {
      activeBatch = Object.assign({}, activeBatch, { counts: counts });
    }

    return {
      hasData: hasData,
      batchId: batchId,
      batch: activeBatch,
      activeBatch: activeBatch,
      batches: batches,
      cards: cards,
      invoices: invoices,
      transactions: transactions,
      installmentPlans: installmentPlans,
      recurringRules: recurringRules,
      counts: counts
    };
  }

  CFM.localStoreService = {
    getStorageVersion: getStorageVersion,
    loadAppData: loadAppData,
    saveAppData: saveAppData,
    saveImportBatch: saveImportBatch,
    saveIncrementalImport: saveIncrementalImport,
    analyzeImportDiff: analyzeDiff,
    hasImportBatch: hasImportBatch,
    replaceImportBatch: replaceImportBatch,
    buildImportBatchPayload: buildImportBatchPayload,
    getImportBatches: getImportBatches,
    getActiveFinancialData: getActiveFinancialData
  };

  CFM.localStore = CFM.localStoreService;
})(window.CFM);
