import { createId, isValidDate, nowIso } from "./finance";
import {
  buildCanonicalFingerprint,
  ensureImportMeta,
  hasFingerprint,
  rememberFingerprint,
} from "./import-fingerprint";
import type {
  ImportCard,
  ImportInvoice,
  ImportPayload,
  ImportPlan,
  ImportPlanItem,
  ImportResult,
  ImportTransaction,
} from "./import-types";
import type { ImportReviewSummary } from "./import-types";
import type { AppData, Card, Invoice, InvoiceStatus, Transaction } from "./types";

function importId(value: { id: string; externalRef?: string }): string {
  return value.externalRef?.trim() || value.id.trim();
}

function isSkippedInvoice(invoice: ImportInvoice): boolean {
  return Boolean(invoice.isStub || invoice.referenceOnly);
}

function isCreditInvoice(invoice: ImportInvoice): boolean {
  const due = invoice.amountDueCents ?? 0;
  const credit = invoice.creditBalanceCents ?? 0;
  return due === 0 && credit > 0;
}

function mapInvoiceStatus(invoice: ImportInvoice): InvoiceStatus {
  const status = (invoice.status || "").toLowerCase();
  if (status === "paid" || status === "closed") {
    return "paid";
  }
  return "open";
}

function mapInvoiceAmountCents(invoice: ImportInvoice): number {
  if (isCreditInvoice(invoice)) {
    return 0;
  }
  if (invoice.amountDueCents !== undefined) {
    return invoice.amountDueCents;
  }
  return invoice.totalCents ?? 0;
}

function mapImportCard(card: ImportCard): Omit<Card, "id"> {
  const timestamp = nowIso();
  return {
    name: card.name.trim(),
    closingDay: card.closingDay ?? null,
    dueDay: card.dueDay ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: importId(card),
  };
}

function cardsEqual(existing: Card, mapped: Omit<Card, "id">): boolean {
  return (
    existing.name === mapped.name &&
    existing.closingDay === mapped.closingDay &&
    existing.dueDay === mapped.dueDay
  );
}

function mapImportInvoice(
  invoice: ImportInvoice,
  localCardId: string,
): Omit<Invoice, "id"> {
  const timestamp = nowIso();
  const amountDueCents = invoice.amountDueCents ?? (isCreditInvoice(invoice) ? 0 : mapInvoiceAmountCents(invoice));
  return {
    cardId: localCardId,
    competenceMonth: invoice.competenceMonth,
    amountCents: mapInvoiceAmountCents(invoice),
    amountDueCents,
    creditBalanceCents: invoice.creditBalanceCents ?? 0,
    dueDate: invoice.dueDate && isValidDate(invoice.dueDate) ? invoice.dueDate : `${invoice.competenceMonth}-01`,
    status: mapInvoiceStatus(invoice),
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: importId(invoice),
  };
}

function invoicesEqual(existing: Invoice, mapped: Omit<Invoice, "id">): boolean {
  return (
    existing.cardId === mapped.cardId &&
    existing.competenceMonth === mapped.competenceMonth &&
    existing.amountCents === mapped.amountCents &&
    (existing.amountDueCents ?? existing.amountCents) === (mapped.amountDueCents ?? mapped.amountCents) &&
    (existing.creditBalanceCents ?? 0) === (mapped.creditBalanceCents ?? 0) &&
    existing.dueDate === mapped.dueDate &&
    existing.status === mapped.status
  );
}

function shouldImportTransaction(tx: ImportTransaction, payload: ImportPayload): boolean {
  if (tx.flow === "neutral") {
    return false;
  }
  if (tx.type === "transfer") {
    return false;
  }
  if (tx.type === "credit_card_payment") {
    return false;
  }
  if (tx.invoiceId) {
    const invoice = (payload.invoices ?? []).find((item) => item.id === tx.invoiceId);
    if (invoice && isSkippedInvoice(invoice)) {
      return false;
    }
    if (tx.type === "credit_card_purchase") {
      return false;
    }
  }
  if (tx.flow === "in") {
    return tx.type === "income" || tx.type === "refund";
  }
  if (tx.flow === "out") {
    return (
      tx.type === "expense" ||
      tx.type === "credit_card_purchase" ||
      tx.type === "fee" ||
      tx.type === "adjustment"
    );
  }
  return false;
}

function mapImportTransaction(
  tx: ImportTransaction,
  fingerprint: string,
): Omit<Transaction, "id"> {
  const timestamp = nowIso();
  const kind = tx.flow === "in" ? "income" : "expense";
  const status: Transaction["status"] =
    tx.type === "income" || tx.type === "refund" ? "settled" : "settled";
  return {
    kind,
    description: tx.description.trim(),
    amountCents: tx.amountCents,
    date: tx.date,
    competenceMonth: tx.competenceMonth,
    category: (tx.categoryLabel || "importado").trim(),
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: importId(tx),
    canonicalFingerprint: fingerprint,
  };
}

function transactionsEqual(existing: Transaction, mapped: Omit<Transaction, "id">): boolean {
  return (
    existing.kind === mapped.kind &&
    existing.description === mapped.description &&
    existing.amountCents === mapped.amountCents &&
    existing.date === mapped.date &&
    existing.competenceMonth === mapped.competenceMonth &&
    existing.category === mapped.category &&
    existing.status === mapped.status
  );
}

function isManualRecord<T extends { sourceImportId?: string }>(item: T): boolean {
  return !item.sourceImportId;
}

function findCardByImportId(data: AppData, sourceImportId: string): Card | undefined {
  return data.cards.find((item) => item.sourceImportId === sourceImportId);
}

function findInvoiceByImportId(data: AppData, sourceImportId: string): Invoice | undefined {
  return data.invoices.find((item) => item.sourceImportId === sourceImportId);
}

function findTransactionByImportId(data: AppData, sourceImportId: string): Transaction | undefined {
  return data.transactions.find((item) => item.sourceImportId === sourceImportId);
}

function findTransactionByFingerprint(data: AppData, fingerprint: string): Transaction | undefined {
  return data.transactions.find((item) => item.canonicalFingerprint === fingerprint);
}

export function buildImportPlan(
  data: AppData,
  payload: ImportPayload,
  summary: ImportReviewSummary,
): ImportPlan {
  const items: ImportPlanItem[] = [];
  const cardIdMap = new Map<string, string>();
  const cardActions = new Map<string, ImportPlanItem["action"]>();
  const context = {
    institution: payload.source.institution,
    documentType: payload.source.documentType,
  };

  for (const card of payload.cards ?? []) {
    const sid = importId(card);
    const mapped = mapImportCard(card);
    const existing = findCardByImportId(data, sid);
    if (existing) {
      cardIdMap.set(card.id, existing.id);
      if (cardsEqual(existing, mapped)) {
        const action = "existing";
        cardActions.set(card.id, action);
        items.push({
          entity: "card",
          importId: sid,
          label: card.name,
          action,
        });
      } else if (isManualRecord(existing)) {
        const action = "conflict";
        cardActions.set(card.id, action);
        items.push({
          entity: "card",
          importId: sid,
          label: card.name,
          action,
          reason: "Cartão manual com identificador conflitante.",
        });
      } else {
        const action = "conflict";
        cardActions.set(card.id, action);
        items.push({
          entity: "card",
          importId: sid,
          label: card.name,
          action,
          reason: "Cartão importado com dados divergentes.",
        });
      }
      continue;
    }
    const action = "create";
    cardActions.set(card.id, action);
    items.push({
      entity: "card",
      importId: sid,
      label: card.name,
      action,
    });
  }

  function resolveImportCardId(importCardId: string): string | undefined {
    const mapped = cardIdMap.get(importCardId);
    if (mapped) {
      return mapped;
    }
    const importCard = (payload.cards ?? []).find((item) => item.id === importCardId);
    if (!importCard) {
      return undefined;
    }
    if (cardActions.get(importCardId) === "create") {
      return `__pending__:${importCardId}`;
    }
    return undefined;
  }

  for (const invoice of payload.invoices ?? []) {
    if (isSkippedInvoice(invoice)) {
      continue;
    }
    const sid = importId(invoice);
    const cardRef = resolveImportCardId(invoice.cardId);
    const cardAction = cardActions.get(invoice.cardId);
    if (!cardRef || cardAction === "conflict") {
      items.push({
        entity: "invoice",
        importId: sid,
        label: `Fatura ${invoice.competenceMonth}`,
        action: "conflict",
        reason: !cardRef ? "Cartão da fatura não encontrado." : "Cartão em conflito.",
      });
      continue;
    }

    const placeholderCardId = cardRef.startsWith("__pending__:")
      ? cardRef.replace("__pending__:", "")
      : cardRef;
    const mapped = mapImportInvoice(invoice, placeholderCardId);
    const existing = findInvoiceByImportId(data, sid);
    if (existing) {
      if (invoicesEqual(existing, { ...mapped, cardId: existing.cardId })) {
        items.push({
          entity: "invoice",
          importId: sid,
          label: `Fatura ${invoice.competenceMonth}`,
          action: "existing",
        });
      } else if (isManualRecord(existing)) {
        items.push({
          entity: "invoice",
          importId: sid,
          label: `Fatura ${invoice.competenceMonth}`,
          action: "conflict",
          reason: "Fatura manual não será sobrescrita.",
        });
      } else {
        items.push({
          entity: "invoice",
          importId: sid,
          label: `Fatura ${invoice.competenceMonth}`,
          action: "conflict",
          reason: "Fatura importada com dados divergentes.",
        });
      }
      continue;
    }
    items.push({
      entity: "invoice",
      importId: sid,
      label: `Fatura ${invoice.competenceMonth}`,
      action: "create",
    });
  }

  for (const tx of payload.transactions ?? []) {
    if (!shouldImportTransaction(tx, payload)) {
      continue;
    }
    const sid = importId(tx);
    const fingerprint = buildCanonicalFingerprint(tx, context);
    const mapped = mapImportTransaction(tx, fingerprint);
    const byImportId = findTransactionByImportId(data, sid);
    const byFingerprint =
      fingerprint.length > 0 ? findTransactionByFingerprint(data, fingerprint) : undefined;

    if (byImportId) {
      if (transactionsEqual(byImportId, mapped)) {
        items.push({
          entity: "transaction",
          importId: sid,
          label: tx.description,
          action: "existing",
        });
      } else if (isManualRecord(byImportId)) {
        items.push({
          entity: "transaction",
          importId: sid,
          label: tx.description,
          action: "conflict",
          reason: "Lançamento manual não será sobrescrito.",
        });
      } else {
        items.push({
          entity: "transaction",
          importId: sid,
          label: tx.description,
          action: "conflict",
          reason: "Lançamento importado com dados divergentes.",
        });
      }
      continue;
    }

    if (byFingerprint || hasFingerprint(data, fingerprint)) {
      items.push({
        entity: "transaction",
        importId: sid,
        label: tx.description,
        action: "existing",
        reason: "Fingerprint já importado.",
      });
      continue;
    }

    const probableManual = data.transactions.find((existing) => {
      if (!isManualRecord(existing)) {
        return false;
      }
      return (
        existing.amountCents === mapped.amountCents &&
        existing.description.trim().toLowerCase() === mapped.description.trim().toLowerCase() &&
        existing.date !== mapped.date
      );
    });
    if (probableManual) {
      items.push({
        entity: "transaction",
        importId: sid,
        label: tx.description,
        action: "conflict",
        reason: "Possível correspondência incerta com lançamento manual.",
      });
      continue;
    }

    items.push({
      entity: "transaction",
      importId: sid,
      label: tx.description,
      action: "create",
    });
  }

  return {
    payload,
    summary,
    items,
    canImport: summary.errors.length === 0,
  };
}

export function applyImportPlan(data: AppData, plan: ImportPlan): ImportResult {
  if (!plan.canImport) {
    return {
      created: 0,
      existing: 0,
      updated: 0,
      conflicts: 0,
      errors: ["Documento inválido para importação."],
      items: plan.items,
    };
  }

  ensureImportMeta(data);
  const payload = plan.payload;
  const cardIdMap = new Map<string, string>();
  const resultItems: ImportPlanItem[] = [];
  let created = 0;
  let existing = 0;
  let updated = 0;
  let conflicts = 0;
  const context = {
    institution: payload.source.institution,
    documentType: payload.source.documentType,
  };

  const nextData: AppData = {
    ...data,
    cards: [...data.cards],
    invoices: [...data.invoices],
    transactions: [...data.transactions],
    importMeta: {
      fingerprints: [...(data.importMeta?.fingerprints ?? [])],
    },
  };

  for (const card of payload.cards ?? []) {
    const sid = importId(card);
    const planItem = plan.items.find((item) => item.entity === "card" && item.importId === sid);
    if (!planItem) {
      continue;
    }
    const mapped = mapImportCard(card);
    const current = findCardByImportId(nextData, sid);
    if (planItem.action === "create") {
      const localId = createId();
      nextData.cards.push({ id: localId, ...mapped });
      cardIdMap.set(card.id, localId);
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "existing" && current) {
      cardIdMap.set(card.id, current.id);
      existing += 1;
      resultItems.push(planItem);
    } else {
      conflicts += 1;
      resultItems.push(planItem);
      if (current) {
        cardIdMap.set(card.id, current.id);
      }
    }
  }

  for (const invoice of payload.invoices ?? []) {
    if (isSkippedInvoice(invoice)) {
      continue;
    }
    const sid = importId(invoice);
    const planItem = plan.items.find((item) => item.entity === "invoice" && item.importId === sid);
    if (!planItem) {
      continue;
    }
    const importCard = (payload.cards ?? []).find((item) => item.id === invoice.cardId);
    const localCardId =
      cardIdMap.get(invoice.cardId) ??
      (importCard ? findCardByImportId(nextData, importId(importCard))?.id : undefined);
    if (!localCardId) {
      conflicts += 1;
      continue;
    }
    const mapped = mapImportInvoice(invoice, localCardId);
    const current = findInvoiceByImportId(nextData, sid);
    if (planItem.action === "create") {
      nextData.invoices.push({ id: createId(), ...mapped });
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "existing" && current) {
      existing += 1;
      resultItems.push(planItem);
    } else {
      conflicts += 1;
      resultItems.push(planItem);
    }
  }

  for (const tx of payload.transactions ?? []) {
    if (!shouldImportTransaction(tx, payload)) {
      continue;
    }
    const sid = importId(tx);
    const planItem = plan.items.find(
      (item) => item.entity === "transaction" && item.importId === sid,
    );
    if (!planItem) {
      continue;
    }
    const fingerprint = buildCanonicalFingerprint(tx, context);
    const mapped = mapImportTransaction(tx, fingerprint);
    const currentById = findTransactionByImportId(nextData, sid);
    const currentByFingerprint = fingerprint
      ? findTransactionByFingerprint(nextData, fingerprint)
      : undefined;

    if (planItem.action === "create") {
      nextData.transactions.push({ id: createId(), ...mapped });
      rememberFingerprint(nextData, fingerprint);
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "existing" || currentById || currentByFingerprint || hasFingerprint(nextData, fingerprint)) {
      existing += 1;
      resultItems.push(planItem);
    } else {
      conflicts += 1;
      resultItems.push(planItem);
    }
  }

  Object.assign(data, nextData);

  return {
    created,
    existing,
    updated,
    conflicts,
    errors: [],
    items: resultItems,
  };
}

export function cloneAppData(data: AppData): AppData {
  return JSON.parse(JSON.stringify(data)) as AppData;
}
