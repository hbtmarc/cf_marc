import { isValidCompetenceMonth, isValidDate } from "./finance";
import {
  IMPORT_SCHEMA_VERSION,
  type ImportCard,
  type ImportExpense,
  type ImportExpenseKind,
  type ImportExpenseStatus,
  type ImportIncome,
  type ImportInvoice,
  type ImportInvoiceStatus,
  type ImportPayload,
  type ImportReviewSummary,
} from "./import-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveIntCents(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isValidDay(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31;
}

function isValidExpenseKind(value: unknown): value is ImportExpenseKind {
  return value === "expense" || value === "fee" || value === "refund";
}

function isValidExpenseStatus(value: unknown): value is ImportExpenseStatus {
  return value === "paid" || value === "pending" || value === "in_invoice";
}

function isValidInvoiceStatus(value: unknown): value is ImportInvoiceStatus {
  return value === "paid" || value === "open" || value === "closed" || value === "partial";
}

function validateRequiredArray(
  payload: Record<string, unknown>,
  field: string,
  errors: string[],
): unknown[] {
  const value = payload[field];
  if (!Array.isArray(value)) {
    errors.push(`Campo ${field} é obrigatório e deve ser um array.`);
    return [];
  }
  return value;
}

function validateIncome(items: unknown[], errors: string[], warnings: string[]): ImportIncome[] {
  const ids = new Set<string>();
  const result: ImportIncome[] = [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`incomes[${index}] inválido.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`incomes[${index}].id é obrigatório.`);
    } else if (ids.has(item.id)) {
      errors.push(`incomes[${index}].id duplicado.`);
    } else {
      ids.add(item.id);
    }
    if (!isValidCompetenceMonth(String(item.competenceMonth ?? ""))) {
      errors.push(`incomes[${index}].competenceMonth inválido.`);
    }
    if (!isValidDate(String(item.receivedDate ?? ""))) {
      errors.push(`incomes[${index}].receivedDate inválida.`);
    }
    if (typeof item.description !== "string" || item.description.trim().length === 0) {
      errors.push(`incomes[${index}].description é obrigatória.`);
    }
    if (!isPositiveIntCents(item.amountCents) || item.amountCents === 0) {
      errors.push(`incomes[${index}].amountCents deve ser inteiro positivo.`);
    }
    if (
      typeof item.canonicalFingerprint !== "string" ||
      item.canonicalFingerprint.trim().length === 0
    ) {
      errors.push(`incomes[${index}].canonicalFingerprint é obrigatório.`);
    }
    if (typeof item.sourceType !== "string" || item.sourceType.trim().length === 0) {
      errors.push(`incomes[${index}].sourceType é obrigatório.`);
    }
    if (item.sourceRecordId !== undefined && typeof item.sourceRecordId !== "string") {
      warnings.push(`incomes[${index}].sourceRecordId ignorado (formato inválido).`);
    }
    result.push(item as unknown as ImportIncome);
  }
  return result;
}

function validateCards(items: unknown[], errors: string[]): ImportCard[] {
  const ids = new Set<string>();
  const result: ImportCard[] = [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`cards[${index}] inválido.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`cards[${index}].id é obrigatório.`);
    } else if (ids.has(item.id)) {
      errors.push(`cards[${index}].id duplicado.`);
    } else {
      ids.add(item.id);
    }
    if (typeof item.name !== "string" || item.name.trim().length === 0) {
      errors.push(`cards[${index}].name é obrigatório.`);
    }
    if (item.issuer !== undefined && typeof item.issuer !== "string") {
      errors.push(`cards[${index}].issuer deve ser texto.`);
    }
    if (item.last4 !== undefined && typeof item.last4 !== "string") {
      errors.push(`cards[${index}].last4 deve ser texto.`);
    }
    if (item.aliasesLast4 !== undefined && !isStringArray(item.aliasesLast4)) {
      errors.push(`cards[${index}].aliasesLast4 deve ser um array de strings.`);
    }
    const cardName = typeof item.name === "string" ? item.name : `cards[${index}]`;
    if (item.closingDay !== undefined && !isValidDay(item.closingDay)) {
      errors.push(`${cardName}: dia de fechamento inválido.`);
    }
    if (item.dueDay !== undefined && !isValidDay(item.dueDay)) {
      errors.push(`${cardName}: dia de vencimento inválido.`);
    }
    result.push(item as unknown as ImportCard);
  }
  return result;
}

function validateInvoiceCoherence(invoice: ImportInvoice, index: number, errors: string[]): void {
  const left = invoice.invoiceTotalCents + invoice.creditBalanceCents;
  const right = invoice.amountPaidCents + invoice.amountDueCents;
  if (left !== right) {
    errors.push(
      `invoices[${index}] incoerente: invoiceTotalCents + creditBalanceCents (${left}) ≠ amountPaidCents + amountDueCents (${right}).`,
    );
  }
}

function validateInvoices(
  items: unknown[],
  cardIds: Set<string>,
  errors: string[],
  warnings: string[],
): ImportInvoice[] {
  const ids = new Set<string>();
  const result: ImportInvoice[] = [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`invoices[${index}] inválido.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`invoices[${index}].id é obrigatório.`);
    } else if (ids.has(item.id)) {
      errors.push(`invoices[${index}].id duplicado.`);
    } else {
      ids.add(item.id);
    }
    if (typeof item.cardId !== "string" || !cardIds.has(item.cardId)) {
      errors.push(`invoices[${index}].cardId inválido ou inexistente.`);
    }
    if (!isValidCompetenceMonth(String(item.competenceMonth ?? ""))) {
      errors.push(`invoices[${index}].competenceMonth inválido.`);
    }
    if (!isValidInvoiceStatus(item.status)) {
      errors.push(`invoices[${index}].status inválido.`);
    }
    for (const field of [
      "invoiceTotalCents",
      "amountPaidCents",
      "amountDueCents",
      "creditBalanceCents",
    ] as const) {
      if (!isPositiveIntCents(item[field])) {
        errors.push(`invoices[${index}].${field} deve ser inteiro ≥ 0.`);
      }
    }
    for (const field of ["closingDate", "dueDate", "paymentDate", "asOfDate"] as const) {
      if (item[field] !== undefined && !isValidDate(String(item[field]))) {
        errors.push(`invoices[${index}].${field} inválida.`);
      }
    }
    if (item.paidFrom !== undefined && typeof item.paidFrom !== "string") {
      errors.push(`invoices[${index}].paidFrom deve ser texto.`);
    }
    if (typeof item.sourceType !== "string" || item.sourceType.trim().length === 0) {
      errors.push(`invoices[${index}].sourceType é obrigatório.`);
    }
    if (item.status === "open") {
      if (typeof item.asOfDate !== "string" || !isValidDate(item.asOfDate)) {
        errors.push(`invoices[${index}] com status open exige asOfDate válida.`);
      }
    }
    const invoice = item as unknown as ImportInvoice;
    validateInvoiceCoherence(invoice, index, errors);
    if (invoice.creditBalanceCents > 0 && invoice.amountDueCents > 0) {
      warnings.push(`invoices[${index}] possui saldo credor e valor devido simultaneamente.`);
    }
    result.push(invoice);
  }
  return result;
}

function validateExpenses(
  items: unknown[],
  cardIds: Set<string>,
  invoiceById: Map<string, ImportInvoice>,
  errors: string[],
  _warnings: string[],
): ImportExpense[] {
  const ids = new Set<string>();
  const result: ImportExpense[] = [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`expenses[${index}] inválido.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`expenses[${index}].id é obrigatório.`);
    } else if (ids.has(item.id)) {
      errors.push(`expenses[${index}].id duplicado.`);
    } else {
      ids.add(item.id);
    }
    if (!isValidCompetenceMonth(String(item.competenceMonth ?? ""))) {
      errors.push(`expenses[${index}].competenceMonth inválido.`);
    }
    if (!isValidDate(String(item.date ?? ""))) {
      errors.push(`expenses[${index}].date inválida.`);
    }
    if (typeof item.description !== "string" || item.description.trim().length === 0) {
      errors.push(`expenses[${index}].description é obrigatória.`);
    }
    if (!isPositiveIntCents(item.amountCents) || item.amountCents === 0) {
      errors.push(`expenses[${index}].amountCents deve ser inteiro positivo.`);
    }
    if (typeof item.category !== "string" || item.category.trim().length === 0) {
      errors.push(`expenses[${index}].category é obrigatória.`);
    }
    if (!isValidExpenseKind(item.kind)) {
      errors.push(`expenses[${index}].kind inválido.`);
    }
    if (!isValidExpenseStatus(item.status)) {
      errors.push(`expenses[${index}].status inválido.`);
    }
    if (
      typeof item.canonicalFingerprint !== "string" ||
      item.canonicalFingerprint.trim().length === 0
    ) {
      errors.push(`expenses[${index}].canonicalFingerprint é obrigatório.`);
    }
    if (typeof item.sourceType !== "string" || item.sourceType.trim().length === 0) {
      errors.push(`expenses[${index}].sourceType é obrigatório.`);
    }
    if (typeof item.paymentMethod !== "string" || item.paymentMethod.trim().length === 0) {
      errors.push(`expenses[${index}].paymentMethod é obrigatório.`);
    }
    if (typeof item.paymentLabel !== "string" || item.paymentLabel.trim().length === 0) {
      errors.push(`expenses[${index}].paymentLabel é obrigatório.`);
    }
    const hasCard = typeof item.cardId === "string" && item.cardId.length > 0;
    const hasInvoice = typeof item.invoiceId === "string" && item.invoiceId.length > 0;
    if (item.status === "in_invoice") {
      if (!hasCard || !hasInvoice) {
        errors.push(`expenses[${index}] in_invoice exige cardId e invoiceId.`);
      } else if (!cardIds.has(item.cardId as string)) {
        errors.push(`expenses[${index}].cardId inexistente.`);
      } else {
        const invoice = invoiceById.get(item.invoiceId as string);
        if (!invoice) {
          errors.push(`expenses[${index}].invoiceId inexistente.`);
        } else if (invoice.cardId !== item.cardId) {
          errors.push(`expenses[${index}] cardId não corresponde à fatura.`);
        }
      }
    } else if (hasInvoice) {
      errors.push(`expenses[${index}] com invoiceId deve ter status in_invoice.`);
    }
    if (item.installment !== undefined) {
      if (!isRecord(item.installment)) {
        errors.push(`expenses[${index}].installment inválido.`);
      } else {
        const current = item.installment.current;
        const total = item.installment.total;
        if (
          typeof current !== "number" ||
          typeof total !== "number" ||
          !Number.isInteger(current) ||
          !Number.isInteger(total) ||
          current < 1 ||
          total < 1 ||
          current > total
        ) {
          errors.push(`expenses[${index}].installment inválido.`);
        }
      }
    }
    if (item.paymentDate !== undefined && !isValidDate(String(item.paymentDate))) {
      errors.push(`expenses[${index}].paymentDate inválida.`);
    }
    result.push(item as unknown as ImportExpense);
  }
  return result;
}

function collectCompetenceMonths(payload: ImportPayload): string[] {
  const months = new Set<string>();
  for (const item of [...payload.incomes, ...payload.invoices, ...payload.expenses]) {
    months.add(item.competenceMonth);
  }
  return [...months].sort();
}

function countExpenseKinds(expenses: ImportExpense[]): ImportReviewSummary["counts"]["expenseByKind"] {
  const counts = { expense: 0, fee: 0, refund: 0 };
  for (const item of expenses) {
    counts[item.kind] += 1;
  }
  return counts;
}

function countUniqueFingerprints(payload: ImportPayload): number {
  const fingerprints = new Set<string>();
  for (const item of payload.incomes) {
    fingerprints.add(item.canonicalFingerprint);
  }
  for (const item of payload.expenses) {
    fingerprints.add(item.canonicalFingerprint);
  }
  return fingerprints.size;
}

function detectDuplicateFingerprints(payload: ImportPayload, errors: string[]): void {
  const seen = new Map<string, string>();
  for (const item of payload.incomes) {
    const key = item.canonicalFingerprint;
    if (seen.has(key)) {
      errors.push(`Fingerprint duplicado: ${key}`);
    } else {
      seen.set(key, item.id);
    }
  }
  for (const item of payload.expenses) {
    const key = item.canonicalFingerprint;
    if (seen.has(key)) {
      errors.push(`Fingerprint duplicado: ${key}`);
    } else {
      seen.set(key, item.id);
    }
  }
}

export function parseImportJson(
  raw: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, message: "O arquivo não é um JSON válido." };
  }
}

export function validateImportDocument(
  value: unknown,
  fileName = "arquivo.json",
):
  | { ok: true; payload: ImportPayload; summary: ImportReviewSummary }
  | { ok: false; summary: ImportReviewSummary } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const emptySummary = (partial?: Partial<ImportReviewSummary>): ImportReviewSummary => ({
    fileName,
    generatedAt: "—",
    currency: "—",
    competenceMonths: [],
    counts: {
      incomes: 0,
      cards: 0,
      invoices: 0,
      expenses: 0,
      expenseByKind: { expense: 0, fee: 0, refund: 0 },
      installments: 0,
      uniqueFingerprints: 0,
    },
    planCounts: { new: 0, updated: 0, existing: 0, conflicts: 0 },
    warnings,
    errors,
    ...partial,
  });

  if (!isRecord(value)) {
    errors.push("Documento deve ser um objeto JSON.");
    return { ok: false, summary: emptySummary() };
  }

  const extraKeys = Object.keys(value).filter(
    (key) =>
      !["schemaVersion", "generatedAt", "currency", "incomes", "cards", "invoices", "expenses"].includes(
        key,
      ),
  );
  if (extraKeys.length > 0) {
    errors.push(`Campos não permitidos no contrato: ${extraKeys.join(", ")}.`);
  }

  if (value.schemaVersion !== IMPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion deve ser ${IMPORT_SCHEMA_VERSION}.`);
  }

  if (typeof value.generatedAt !== "string" || value.generatedAt.trim().length === 0) {
    errors.push("generatedAt é obrigatório.");
  }

  if (typeof value.currency !== "string" || value.currency.trim().length === 0) {
    errors.push("currency é obrigatório.");
  } else if (value.currency !== "BRL") {
    warnings.push(`Moeda ${value.currency} diferente de BRL.`);
  }

  const incomes = validateIncome(validateRequiredArray(value, "incomes", errors), errors, warnings);
  const cards = validateCards(validateRequiredArray(value, "cards", errors), errors);
  const cardIds = new Set(cards.map((item) => item.id));
  const invoices = validateInvoices(
    validateRequiredArray(value, "invoices", errors),
    cardIds,
    errors,
    warnings,
  );
  const invoiceById = new Map(invoices.map((item) => [item.id, item]));
  const expenses = validateExpenses(
    validateRequiredArray(value, "expenses", errors),
    cardIds,
    invoiceById,
    errors,
    warnings,
  );

  const payload: ImportPayload = {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    generatedAt: String(value.generatedAt ?? ""),
    currency: String(value.currency ?? ""),
    incomes,
    cards,
    invoices,
    expenses,
  };

  detectDuplicateFingerprints(payload, errors);

  const installments = expenses.filter((item) => item.installment).length;
  const summary = emptySummary({
    generatedAt: payload.generatedAt,
    currency: payload.currency,
    competenceMonths: collectCompetenceMonths(payload),
    counts: {
      incomes: incomes.length,
      cards: cards.length,
      invoices: invoices.length,
      expenses: expenses.length,
      expenseByKind: countExpenseKinds(expenses),
      installments,
      uniqueFingerprints: countUniqueFingerprints(payload),
    },
  });

  if (errors.length > 0) {
    return { ok: false, summary };
  }

  return { ok: true, payload, summary };
}

export function formatGeneratedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
