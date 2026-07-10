import { isValidCompetenceMonth, isValidDate } from "./finance";
import {
  IMPORT_SCHEMA_VERSION,
  type ImportPayload,
  type ImportReviewSummary,
} from "./import-types";
import { isValidSha256Hash, normalizeImportPayload } from "./import-fingerprint";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveIntCents(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validateSource(source: unknown, errors: string[]): boolean {
  if (!isRecord(source)) {
    errors.push("Campo source é obrigatório.");
    return false;
  }
  let valid = true;
  if (typeof source.institution !== "string" || source.institution.trim().length === 0) {
    errors.push("source.institution é obrigatório.");
    valid = false;
  }
  if (typeof source.documentType !== "string" || source.documentType.trim().length === 0) {
    errors.push("source.documentType é obrigatório.");
    valid = false;
  }
  if (
    source.rawHash !== undefined &&
    typeof source.rawHash === "string" &&
    source.rawHash.length > 0 &&
    !isValidSha256Hash(source.rawHash)
  ) {
    errors.push("source.rawHash deve seguir o formato sha256:<64 hex>.");
    valid = false;
  }
  return valid;
}

function validateArrayField(
  payload: Record<string, unknown>,
  field: string,
  errors: string[],
): unknown[] {
  const value = payload[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${field} deve ser um array.`);
    return [];
  }
  return value;
}

function validateAccounts(items: unknown[], errors: string[], warnings: string[]): void {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`accounts[${index}] inválido.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`accounts[${index}].id é obrigatório.`);
    } else if (ids.has(item.id)) {
      errors.push(`accounts[${index}].id duplicado.`);
    } else {
      ids.add(item.id);
    }
    if (typeof item.name !== "string" || item.name.trim().length === 0) {
      errors.push(`accounts[${index}].name é obrigatório.`);
    }
    if (
      item.type !== "checking" &&
      item.type !== "savings" &&
      item.type !== "investment"
    ) {
      errors.push(`accounts[${index}].type inválido.`);
    }
    if (item.lastFour !== undefined && typeof item.lastFour === "string" && item.lastFour.length > 4) {
      warnings.push(`accounts[${index}].lastFour excede 4 caracteres.`);
    }
  }
}

function validateCards(items: unknown[], errors: string[], warnings: string[]): void {
  const ids = new Set<string>();
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
    if (item.aliases !== undefined && !isStringArray(item.aliases)) {
      errors.push(`cards[${index}].aliases deve ser um array de strings.`);
    }
    if (item.aliases && Array.isArray(item.aliases) && item.aliases.length > 0) {
      warnings.push(`cards[${index}] possui aliases — não criam cartões adicionais.`);
    }
    if (item.limitCents !== undefined && !isPositiveIntCents(item.limitCents)) {
      errors.push(`cards[${index}].limitCents deve ser inteiro >= 0.`);
    }
  }
}

function validateSnapshots(items: unknown[], cardIds: Set<string>, errors: string[]): void {
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`cardSnapshots[${index}] inválido.`);
      continue;
    }
    if (typeof item.cardId !== "string" || !cardIds.has(item.cardId)) {
      errors.push(`cardSnapshots[${index}].cardId referencia cartão inexistente.`);
    }
    if (typeof item.snapshotMonth !== "string" || !isValidCompetenceMonth(item.snapshotMonth)) {
      errors.push(`cardSnapshots[${index}].snapshotMonth inválido.`);
    }
  }
}

function validateInvoices(items: unknown[], cardIds: Set<string>, errors: string[]): void {
  const ids = new Set<string>();
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
      errors.push(`invoices[${index}].cardId referencia cartão inexistente.`);
    }
    if (typeof item.competenceMonth !== "string" || !isValidCompetenceMonth(item.competenceMonth)) {
      errors.push(`invoices[${index}].competenceMonth inválido.`);
    }
    if (item.dueDate !== undefined && typeof item.dueDate === "string" && !isValidDate(item.dueDate)) {
      errors.push(`invoices[${index}].dueDate inválido.`);
    }
    for (const field of ["totalCents", "amountDueCents", "creditBalanceCents"] as const) {
      if (item[field] !== undefined && !isPositiveIntCents(item[field])) {
        errors.push(`invoices[${index}].${field} deve ser inteiro >= 0.`);
      }
    }
  }
}

function validateTransactions(
  items: unknown[],
  cardIds: Set<string>,
  accountIds: Set<string>,
  invoiceIds: Set<string>,
  errors: string[],
): void {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`transactions[${index}] inválido.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`transactions[${index}].id é obrigatório.`);
    } else if (ids.has(item.id)) {
      errors.push(`transactions[${index}].id duplicado.`);
    } else {
      ids.add(item.id);
    }
    if (typeof item.description !== "string" || item.description.trim().length === 0) {
      errors.push(`transactions[${index}].description é obrigatória.`);
    }
    if (!isPositiveIntCents(item.amountCents) || item.amountCents === 0) {
      errors.push(`transactions[${index}].amountCents deve ser inteiro positivo.`);
    }
    if (typeof item.date !== "string" || !isValidDate(item.date)) {
      errors.push(`transactions[${index}].date inválida.`);
    }
    if (typeof item.competenceMonth !== "string" || !isValidCompetenceMonth(item.competenceMonth)) {
      errors.push(`transactions[${index}].competenceMonth inválida.`);
    }
    if (item.flow !== "in" && item.flow !== "out" && item.flow !== "neutral") {
      errors.push(`transactions[${index}].flow inválido.`);
    }
    if (typeof item.type !== "string" || item.type.trim().length === 0) {
      errors.push(`transactions[${index}].type é obrigatório.`);
    }
    if (item.cardId !== undefined && typeof item.cardId === "string" && !cardIds.has(item.cardId)) {
      errors.push(`transactions[${index}].cardId referencia cartão inexistente.`);
    }
    if (item.accountId !== undefined && typeof item.accountId === "string" && !accountIds.has(item.accountId)) {
      errors.push(`transactions[${index}].accountId referencia conta inexistente.`);
    }
    if (item.invoiceId !== undefined && typeof item.invoiceId === "string" && !invoiceIds.has(item.invoiceId)) {
      errors.push(`transactions[${index}].invoiceId referencia fatura inexistente.`);
    }
    if (item.source !== undefined && isRecord(item.source) && item.source.rawHash !== undefined) {
      const rawHash = item.source.rawHash;
      if (typeof rawHash === "string" && rawHash.length > 0 && !isValidSha256Hash(rawHash)) {
        // readable hash is normalized later; not a blocker
      }
    }
  }
}

function validateInstallmentPlans(items: unknown[], cardIds: Set<string>, errors: string[]): void {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`installmentPlans[${index}] inválido.`);
      continue;
    }
    const id = typeof item.id === "string" ? item.id : typeof item.externalRef === "string" ? item.externalRef : "";
    if (!id) {
      errors.push(`installmentPlans[${index}].id é obrigatório.`);
    } else if (ids.has(id)) {
      errors.push(`installmentPlans[${index}].id duplicado.`);
    } else {
      ids.add(id);
    }
    if (item.cardId !== undefined && typeof item.cardId === "string" && !cardIds.has(item.cardId)) {
      errors.push(`installmentPlans[${index}].cardId referencia cartão inexistente.`);
    }
  }
}

function validateRecurringRules(items: unknown[], accountIds: Set<string>, errors: string[]): void {
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      errors.push(`recurringRules[${index}] inválido.`);
      continue;
    }
    const ref =
      typeof item.externalRef === "string"
        ? item.externalRef
        : typeof item.id === "string"
          ? item.id
          : "";
    if (!ref) {
      errors.push(`recurringRules[${index}].externalRef é obrigatório.`);
    }
    if (item.accountId !== undefined && typeof item.accountId === "string" && !accountIds.has(item.accountId)) {
      errors.push(`recurringRules[${index}].accountId referencia conta inexistente.`);
    }
    if (item.expectedAmountCents !== undefined && !isPositiveIntCents(item.expectedAmountCents)) {
      errors.push(`recurringRules[${index}].expectedAmountCents inválido.`);
    }
  }
}

export function parseImportJson(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, message: "Conteúdo JSON vazio." };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, message: "JSON malformado." };
  }
}

export function validateImportDocument(
  value: unknown,
  fileName = "arquivo.json",
): { ok: true; payload: ImportPayload; summary: ImportReviewSummary } | { ok: false; summary: ImportReviewSummary } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!isRecord(value)) {
    errors.push("Documento deve ser um objeto JSON.");
    return {
      ok: false,
      summary: buildSummary(fileName, null, warnings, errors),
    };
  }

  if (value.schemaVersion !== IMPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion deve ser "${IMPORT_SCHEMA_VERSION}".`);
  }

  const sourceOk = validateSource(value.source, errors);
  const accounts = validateArrayField(value, "accounts", errors);
  const cards = validateArrayField(value, "cards", errors);
  const cardSnapshots = validateArrayField(value, "cardSnapshots", errors);
  const invoices = validateArrayField(value, "invoices", errors);
  const transactions = validateArrayField(value, "transactions", errors);
  const installmentPlans = validateArrayField(value, "installmentPlans", errors);
  const recurringRules = validateArrayField(value, "recurringRules", errors);

  validateAccounts(accounts, errors, warnings);
  validateCards(cards, errors, warnings);

  const cardIds = new Set(
    cards
      .filter(isRecord)
      .map((item) => (typeof item.id === "string" ? item.id : ""))
      .filter(Boolean),
  );
  const accountIds = new Set(
    accounts
      .filter(isRecord)
      .map((item) => (typeof item.id === "string" ? item.id : ""))
      .filter(Boolean),
  );
  const invoiceIds = new Set(
    invoices
      .filter(isRecord)
      .map((item) => (typeof item.id === "string" ? item.id : ""))
      .filter(Boolean),
  );

  validateSnapshots(cardSnapshots, cardIds, errors);
  validateInvoices(invoices, cardIds, errors);
  validateTransactions(transactions, cardIds, accountIds, invoiceIds, errors);
  validateInstallmentPlans(installmentPlans, cardIds, errors);
  validateRecurringRules(recurringRules, accountIds, errors);

  if (!sourceOk) {
    return { ok: false, summary: buildSummary(fileName, null, warnings, errors) };
  }

  if (errors.length > 0) {
    return { ok: false, summary: buildSummary(fileName, null, warnings, errors) };
  }

  const payload = normalizeImportPayload({
    schemaVersion: IMPORT_SCHEMA_VERSION,
    source: value.source as ImportPayload["source"],
    accounts,
    cards,
    cardSnapshots,
    invoices,
    transactions,
    installmentPlans,
    recurringRules,
    ...(isRecord(value.review) ? { review: value.review } : {}),
  } as ImportPayload);

  if ((payload.cardSnapshots?.length ?? 0) > 0) {
    warnings.push("Snapshots de cartão reconhecidos — não substituem o cadastro do cartão.");
  }

  const stubInvoices = (payload.invoices ?? []).filter((item) => item.isStub || item.referenceOnly).length;
  if (stubInvoices > 0) {
    warnings.push(`${stubInvoices} fatura(s) de referência serão ignoradas na importação.`);
  }

  const summary = buildSummary(fileName, payload, warnings, errors);
  return { ok: true, payload, summary };
}

function buildSummary(
  fileName: string,
  payload: ImportPayload | null,
  warnings: string[],
  errors: string[],
): ImportReviewSummary {
  const source = payload?.source;
  const periodLabel =
    source?.periodStart && source?.periodEnd
      ? `${source.periodStart} — ${source.periodEnd}`
      : source?.periodStart || source?.periodEnd || "—";

  return {
    fileName,
    institution: source?.institution ?? "—",
    documentType: source?.documentType ?? "—",
    periodLabel,
    counts: {
      accounts: payload?.accounts?.length ?? 0,
      cards: payload?.cards?.length ?? 0,
      cardSnapshots: payload?.cardSnapshots?.length ?? 0,
      invoices: payload?.invoices?.length ?? 0,
      transactions: payload?.transactions?.length ?? 0,
      installmentPlans: payload?.installmentPlans?.length ?? 0,
      recurringRules: payload?.recurringRules?.length ?? 0,
    },
    warnings,
    errors,
  };
}
