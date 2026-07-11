import { mergeImportCardDays } from "./import-card-review";
import { createId, isValidDate, nowIso } from "./finance";
import { ensureImportMeta, hasFingerprint, rememberFingerprint } from "./import-meta";
import type {
  ImportCard,
  ImportExpense,
  ImportIncome,
  ImportInvoice,
  ImportPayload,
  ImportPlan,
  ImportPlanItem,
  ImportResult,
  ImportReviewSummary,
} from "./import-types";
import type { AppData, Card, Invoice, InvoiceStatus, Transaction } from "./types";

function isManualRecord<T extends { sourceImportId?: string }>(item: T): boolean {
  return !item.sourceImportId;
}

function findCardByImportId(data: AppData, sourceImportId: string): Card | undefined {
  return data.cards.find((item) => item.sourceImportId === sourceImportId);
}

function findInvoiceByImportId(data: AppData, sourceImportId: string): Invoice | undefined {
  return data.invoices.find((item) => item.sourceImportId === sourceImportId);
}

function findTransactionByFingerprint(data: AppData, fingerprint: string): Transaction | undefined {
  return data.transactions.find((item) => item.canonicalFingerprint === fingerprint);
}

function mapImportCard(card: ImportCard, existing?: Card): Omit<Card, "id"> {
  const timestamp = nowIso();
  const mergedDays = mergeImportCardDays(card, existing);
  return {
    name: card.name.trim(),
    ...(card.issuer?.trim() ? { issuer: card.issuer.trim() } : {}),
    ...(card.last4?.trim() ? { last4: card.last4.trim() } : {}),
    ...(card.aliasesLast4?.length ? { aliasesLast4: [...card.aliasesLast4] } : {}),
    closingDay: mergedDays.closingDay ?? null,
    dueDay: mergedDays.dueDay ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: card.id,
  };
}

function cardsEqual(existing: Card, mapped: Omit<Card, "id">): boolean {
  const aliasesEqual =
    JSON.stringify(existing.aliasesLast4 ?? []) === JSON.stringify(mapped.aliasesLast4 ?? []);
  return (
    existing.name === mapped.name &&
    (existing.issuer ?? "") === (mapped.issuer ?? "") &&
    (existing.last4 ?? "") === (mapped.last4 ?? "") &&
    aliasesEqual &&
    existing.closingDay === mapped.closingDay &&
    existing.dueDay === mapped.dueDay
  );
}

function mapInvoiceStatus(status: ImportInvoice["status"]): InvoiceStatus {
  if (status === "paid") {
    return "paid";
  }
  if (status === "partial") {
    return "partial";
  }
  return "open";
}

function resolveInvoiceDueDate(invoice: ImportInvoice): string {
  if (invoice.dueDate && isValidDate(invoice.dueDate)) {
    return invoice.dueDate;
  }
  if (invoice.closingDate && isValidDate(invoice.closingDate)) {
    return invoice.closingDate;
  }
  return `${invoice.competenceMonth}-01`;
}

function mapImportInvoice(invoice: ImportInvoice, localCardId: string): Omit<Invoice, "id"> {
  const timestamp = nowIso();
  return {
    cardId: localCardId,
    competenceMonth: invoice.competenceMonth,
    amountCents: invoice.invoiceTotalCents,
    invoiceTotalCents: invoice.invoiceTotalCents,
    amountPaidCents: invoice.amountPaidCents,
    amountDueCents: invoice.amountDueCents,
    creditBalanceCents: invoice.creditBalanceCents,
    ...(invoice.closingDate ? { closingDate: invoice.closingDate } : {}),
    dueDate: resolveInvoiceDueDate(invoice),
    ...(invoice.paymentDate ? { paymentDate: invoice.paymentDate } : {}),
    ...(invoice.paidFrom ? { paidFrom: invoice.paidFrom } : {}),
    ...(invoice.asOfDate ? { asOfDate: invoice.asOfDate } : {}),
    importStatus: invoice.status,
    status: mapInvoiceStatus(invoice.status),
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: invoice.id,
  };
}

function invoicesEqual(existing: Invoice, mapped: Omit<Invoice, "id">): boolean {
  return (
    existing.cardId === mapped.cardId &&
    existing.competenceMonth === mapped.competenceMonth &&
    existing.amountCents === mapped.amountCents &&
    (existing.invoiceTotalCents ?? existing.amountCents) ===
      (mapped.invoiceTotalCents ?? mapped.amountCents) &&
    (existing.amountPaidCents ?? 0) === (mapped.amountPaidCents ?? 0) &&
    (existing.amountDueCents ?? existing.amountCents) ===
      (mapped.amountDueCents ?? mapped.amountCents) &&
    (existing.creditBalanceCents ?? 0) === (mapped.creditBalanceCents ?? 0) &&
    existing.dueDate === mapped.dueDate &&
    existing.status === mapped.status &&
    (existing.importStatus ?? "") === (mapped.importStatus ?? "") &&
    (existing.closingDate ?? "") === (mapped.closingDate ?? "") &&
    (existing.paymentDate ?? "") === (mapped.paymentDate ?? "") &&
    (existing.paidFrom ?? "") === (mapped.paidFrom ?? "") &&
    (existing.asOfDate ?? "") === (mapped.asOfDate ?? "")
  );
}

function mapImportIncome(income: ImportIncome): Omit<Transaction, "id"> {
  const timestamp = nowIso();
  return {
    kind: "income",
    description: income.description.trim(),
    amountCents: income.amountCents,
    date: income.receivedDate,
    competenceMonth: income.competenceMonth,
    category: "Renda",
    status: "settled",
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: income.id,
    canonicalFingerprint: income.canonicalFingerprint,
    ...(income.sourceRecordId ? { sourceRecordId: income.sourceRecordId } : {}),
  };
}

function mapImportExpense(
  expense: ImportExpense,
  localCardId?: string,
  localInvoiceId?: string,
): Omit<Transaction, "id"> {
  const timestamp = nowIso();
  return {
    kind: "expense",
    description: expense.description.trim(),
    amountCents: expense.amountCents,
    date: expense.date,
    competenceMonth: expense.competenceMonth,
    category: expense.category.trim(),
    status: expense.status === "pending" ? "pending" : "settled",
    expenseKind: expense.kind,
    ledgerStatus: expense.status,
    ...(expense.installment ? { installment: { ...expense.installment } } : {}),
    ...(localCardId ? { cardId: localCardId } : {}),
    ...(localInvoiceId ? { invoiceId: localInvoiceId } : {}),
    ...(expense.paymentDate ? { paymentDate: expense.paymentDate } : {}),
    ...(expense.sourceRecordId ? { sourceRecordId: expense.sourceRecordId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceImportId: expense.id,
    canonicalFingerprint: expense.canonicalFingerprint,
  };
}

function ledgerRecordsEqual(
  existing: Transaction,
  mapped: Omit<Transaction, "id">,
): boolean {
  return (
    existing.kind === mapped.kind &&
    existing.description === mapped.description &&
    existing.amountCents === mapped.amountCents &&
    existing.date === mapped.date &&
    existing.competenceMonth === mapped.competenceMonth &&
    existing.category === mapped.category &&
    existing.status === mapped.status &&
    (existing.expenseKind ?? "expense") === (mapped.expenseKind ?? "expense") &&
    (existing.ledgerStatus ?? "") === (mapped.ledgerStatus ?? "") &&
    JSON.stringify(existing.installment ?? null) === JSON.stringify(mapped.installment ?? null) &&
    (existing.cardId ?? "") === (mapped.cardId ?? "") &&
    (existing.invoiceId ?? "") === (mapped.invoiceId ?? "") &&
    (existing.sourceRecordId ?? "") === (mapped.sourceRecordId ?? "")
  );
}

function summarizePlan(items: ImportPlanItem[]): ImportReviewSummary["planCounts"] {
  return {
    new: items.filter((item) => item.action === "create").length,
    updated: items.filter((item) => item.action === "updated").length,
    existing: items.filter((item) => item.action === "existing").length,
    conflicts: items.filter((item) => item.action === "conflict").length,
  };
}

export function buildImportPlan(
  data: AppData,
  payload: ImportPayload,
  summary: ImportReviewSummary,
): ImportPlan {
  const items: ImportPlanItem[] = [];
  const cardIdMap = new Map<string, string>();
  const cardActions = new Map<string, ImportPlanItem["action"]>();

  for (const card of payload.cards) {
    const existing = findCardByImportId(data, card.id);
    const mapped = mapImportCard(card, existing);
    if (existing) {
      cardIdMap.set(card.id, existing.id);
      if (isManualRecord(existing)) {
        const action = "conflict";
        cardActions.set(card.id, action);
        items.push({
          entity: "card",
          importId: card.id,
          label: card.name,
          action,
          reason: "Cartão manual com identificador conflitante.",
        });
      } else if (cardsEqual(existing, mapped)) {
        const action = "existing";
        cardActions.set(card.id, action);
        items.push({
          entity: "card",
          importId: card.id,
          label: card.name,
          action,
        });
      } else {
        const action = "updated";
        cardActions.set(card.id, action);
        items.push({
          entity: "card",
          importId: card.id,
          label: card.name,
          action,
        });
      }
      continue;
    }
    cardActions.set(card.id, "create");
    items.push({
      entity: "card",
      importId: card.id,
      label: card.name,
      action: "create",
    });
  }

  function resolveImportCardId(importCardId: string): string | undefined {
    const mapped = cardIdMap.get(importCardId);
    if (mapped) {
      return mapped;
    }
    if (cardActions.get(importCardId) === "create") {
      return `__pending__:${importCardId}`;
    }
    return undefined;
  }

  for (const invoice of payload.invoices) {
    const cardRef = resolveImportCardId(invoice.cardId);
    const cardAction = cardActions.get(invoice.cardId);
    if (!cardRef || cardAction === "conflict") {
      items.push({
        entity: "invoice",
        importId: invoice.id,
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
    const existing = findInvoiceByImportId(data, invoice.id);
    if (existing) {
      if (isManualRecord(existing)) {
        items.push({
          entity: "invoice",
          importId: invoice.id,
          label: `Fatura ${invoice.competenceMonth}`,
          action: "conflict",
          reason: "Fatura manual não será sobrescrita.",
        });
      } else if (invoicesEqual(existing, { ...mapped, cardId: existing.cardId })) {
        items.push({
          entity: "invoice",
          importId: invoice.id,
          label: `Fatura ${invoice.competenceMonth}`,
          action: "existing",
        });
      } else {
        items.push({
          entity: "invoice",
          importId: invoice.id,
          label: `Fatura ${invoice.competenceMonth}`,
          action: "updated",
        });
      }
      continue;
    }
    items.push({
      entity: "invoice",
      importId: invoice.id,
      label: `Fatura ${invoice.competenceMonth}`,
      action: "create",
    });
  }

  for (const income of payload.incomes) {
    const mapped = mapImportIncome(income);
    const byFingerprint = findTransactionByFingerprint(data, income.canonicalFingerprint);
    if (byFingerprint) {
      if (ledgerRecordsEqual(byFingerprint, mapped)) {
        items.push({
          entity: "income",
          importId: income.id,
          label: income.description,
          action: "existing",
        });
      } else if (isManualRecord(byFingerprint)) {
        items.push({
          entity: "income",
          importId: income.id,
          label: income.description,
          action: "conflict",
          reason: "Renda manual não será sobrescrita.",
        });
      } else {
        items.push({
          entity: "income",
          importId: income.id,
          label: income.description,
          action: "conflict",
          reason: "Renda importada com dados divergentes.",
        });
      }
      continue;
    }
    if (hasFingerprint(data, income.canonicalFingerprint)) {
      items.push({
        entity: "income",
        importId: income.id,
        label: income.description,
        action: "existing",
        reason: "Fingerprint já importado.",
      });
      continue;
    }
    items.push({
      entity: "income",
      importId: income.id,
      label: income.description,
      action: "create",
    });
  }

  for (const expense of payload.expenses) {
    const localCardId = expense.cardId ? resolveImportCardId(expense.cardId) : undefined;
    const existingInvoice = expense.invoiceId
      ? findInvoiceByImportId(data, expense.invoiceId)
      : undefined;
    const localInvoiceId = existingInvoice?.id;
    const mapped = mapImportExpense(
      expense,
      localCardId && !localCardId.startsWith("__pending__") ? localCardId : undefined,
      localInvoiceId,
    );
    const byFingerprint = findTransactionByFingerprint(data, expense.canonicalFingerprint);
    if (byFingerprint) {
      if (ledgerRecordsEqual(byFingerprint, mapped)) {
        items.push({
          entity: "expense",
          importId: expense.id,
          label: expense.description,
          action: "existing",
        });
      } else if (isManualRecord(byFingerprint)) {
        items.push({
          entity: "expense",
          importId: expense.id,
          label: expense.description,
          action: "conflict",
          reason: "Despesa manual não será sobrescrita.",
        });
      } else {
        items.push({
          entity: "expense",
          importId: expense.id,
          label: expense.description,
          action: "conflict",
          reason: "Despesa importada com dados divergentes.",
        });
      }
      continue;
    }
    if (hasFingerprint(data, expense.canonicalFingerprint)) {
      items.push({
        entity: "expense",
        importId: expense.id,
        label: expense.description,
        action: "existing",
        reason: "Fingerprint já importado.",
      });
      continue;
    }
    if (expense.invoiceId && cardActions.get(expense.cardId ?? "") === "conflict") {
      items.push({
        entity: "expense",
        importId: expense.id,
        label: expense.description,
        action: "conflict",
        reason: "Cartão em conflito.",
      });
      continue;
    }
    items.push({
      entity: "expense",
      importId: expense.id,
      label: expense.description,
      action: "create",
    });
  }

  const planCounts = summarizePlan(items);

  return {
    payload,
    summary: {
      ...summary,
      planCounts,
    },
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
  const invoiceIdMap = new Map<string, string>();
  const resultItems: ImportPlanItem[] = [];
  let created = 0;
  let existing = 0;
  let updated = 0;
  let conflicts = 0;

  const nextData: AppData = {
    ...data,
    cards: [...data.cards],
    invoices: [...data.invoices],
    transactions: [...data.transactions],
    importMeta: {
      fingerprints: [...(data.importMeta?.fingerprints ?? [])],
    },
  };

  for (const card of payload.cards) {
    const planItem = plan.items.find(
      (item) => item.entity === "card" && item.importId === card.id,
    );
    if (!planItem) {
      continue;
    }
    const current = findCardByImportId(nextData, card.id);
    const mapped = mapImportCard(card, current);
    if (planItem.action === "create") {
      const localId = createId();
      nextData.cards.push({ id: localId, ...mapped });
      cardIdMap.set(card.id, localId);
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "updated" && current && !isManualRecord(current)) {
      Object.assign(current, { ...mapped, id: current.id, createdAt: current.createdAt });
      cardIdMap.set(card.id, current.id);
      updated += 1;
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

  for (const invoice of payload.invoices) {
    const planItem = plan.items.find(
      (item) => item.entity === "invoice" && item.importId === invoice.id,
    );
    if (!planItem) {
      continue;
    }
    const localCardId =
      cardIdMap.get(invoice.cardId) ?? findCardByImportId(nextData, invoice.cardId)?.id;
    if (!localCardId) {
      conflicts += 1;
      continue;
    }
    const mapped = mapImportInvoice(invoice, localCardId);
    const current = findInvoiceByImportId(nextData, invoice.id);
    if (planItem.action === "create") {
      const localId = createId();
      nextData.invoices.push({ id: localId, ...mapped });
      invoiceIdMap.set(invoice.id, localId);
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "updated" && current && !isManualRecord(current)) {
      Object.assign(current, { ...mapped, id: current.id, createdAt: current.createdAt });
      invoiceIdMap.set(invoice.id, current.id);
      updated += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "existing" && current) {
      invoiceIdMap.set(invoice.id, current.id);
      existing += 1;
      resultItems.push(planItem);
    } else {
      conflicts += 1;
      resultItems.push(planItem);
      if (current) {
        invoiceIdMap.set(invoice.id, current.id);
      }
    }
  }

  for (const income of payload.incomes) {
    const planItem = plan.items.find(
      (item) => item.entity === "income" && item.importId === income.id,
    );
    if (!planItem) {
      continue;
    }
    const mapped = mapImportIncome(income);
    const current = findTransactionByFingerprint(nextData, income.canonicalFingerprint);
    if (planItem.action === "create") {
      nextData.transactions.push({ id: createId(), ...mapped });
      rememberFingerprint(nextData, income.canonicalFingerprint);
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "existing" || current || hasFingerprint(nextData, income.canonicalFingerprint)) {
      existing += 1;
      resultItems.push(planItem);
    } else {
      conflicts += 1;
      resultItems.push(planItem);
    }
  }

  for (const expense of payload.expenses) {
    const planItem = plan.items.find(
      (item) => item.entity === "expense" && item.importId === expense.id,
    );
    if (!planItem) {
      continue;
    }
    const localCardId = expense.cardId
      ? (cardIdMap.get(expense.cardId) ?? findCardByImportId(nextData, expense.cardId)?.id)
      : undefined;
    const localInvoiceId = expense.invoiceId
      ? (invoiceIdMap.get(expense.invoiceId) ??
        findInvoiceByImportId(nextData, expense.invoiceId)?.id)
      : undefined;
    const mapped = mapImportExpense(expense, localCardId, localInvoiceId);
    const current = findTransactionByFingerprint(nextData, expense.canonicalFingerprint);
    if (planItem.action === "create") {
      nextData.transactions.push({ id: createId(), ...mapped });
      rememberFingerprint(nextData, expense.canonicalFingerprint);
      created += 1;
      resultItems.push(planItem);
    } else if (planItem.action === "existing" || current || hasFingerprint(nextData, expense.canonicalFingerprint)) {
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
