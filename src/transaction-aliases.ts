import { nowIso } from "./finance";
import { normalizeInstallmentDescription, type ProjectedInstallment } from "./installments";
import type { AppData, RecurringRule, Transaction, TransactionDescriptionAlias } from "./types";

export function normalizeTransactionDescription(description: string): string {
  return normalizeInstallmentDescription(description);
}

export function transactionDescriptionAliasId(
  sourceDescriptionNormalized: string,
): string {
  return `txn-desc-alias:${sourceDescriptionNormalized}`;
}

export function findTransactionDescriptionAlias(
  data: AppData,
  sourceDescription: string,
): TransactionDescriptionAlias | undefined {
  const normalized = normalizeTransactionDescription(sourceDescription);
  return (data.transactionDescriptionAliases ?? []).find(
    (item) => item.sourceDescriptionNormalized === normalized,
  );
}

export function transactionDisplayDescriptionForSource(
  data: AppData,
  sourceDescription: string,
): string {
  const alias = findTransactionDescriptionAlias(data, sourceDescription);
  return alias?.displayName ?? sourceDescription;
}

export function transactionDisplayDescription(
  data: AppData,
  transaction: Transaction,
): string {
  return transactionDisplayDescriptionForSource(data, transaction.description);
}

export function recurringRuleDisplayDescription(
  data: AppData,
  rule: RecurringRule,
  transaction?: Transaction,
): string {
  if (transaction) {
    return transactionDisplayDescription(data, transaction);
  }
  return transactionDisplayDescriptionForSource(data, rule.description);
}

export function transactionDescriptionTextAccessor(
  data: AppData,
): { kind: "text"; getValue: (item: Transaction) => string } {
  return {
    kind: "text",
    getValue: (item) => transactionDisplayDescription(data, item),
  };
}

export function projectedInstallmentDisplayDescription(
  data: AppData,
  item: ProjectedInstallment,
): string {
  const source = data.transactions.find(
    (transaction) => transaction.id === item.sourceTransactionId,
  );
  if (source) {
    return transactionDisplayDescription(data, source);
  }
  return transactionDisplayDescriptionForSource(data, item.description);
}

export function projectedInstallmentSearchHaystack(
  data: AppData,
  item: ProjectedInstallment,
): string {
  const source = data.transactions.find(
    (transaction) => transaction.id === item.sourceTransactionId,
  );
  const display = projectedInstallmentDisplayDescription(data, item);
  return [item.description, display, item.category, source?.description ?? ""]
    .join(" ")
    .toLowerCase();
}

export function validateTransactionDescriptionAliasDisplayName(
  displayName: string,
): string | null {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return "Informe um nome exibido.";
  }
  return null;
}

export function upsertTransactionDescriptionAlias(
  data: AppData,
  sourceDescription: string,
  displayName: string,
): { errors: Record<string, string> } {
  const error = validateTransactionDescriptionAliasDisplayName(displayName);
  if (error) {
    return { errors: { displayName: error } };
  }

  const trimmed = displayName.trim();
  const normalized = normalizeTransactionDescription(sourceDescription);
  const sample = sourceDescription.trim();
  const timestamp = nowIso();
  const aliases = data.transactionDescriptionAliases ?? [];
  const existing = aliases.find(
    (item) => item.sourceDescriptionNormalized === normalized,
  );

  if (existing) {
    existing.displayName = trimmed;
    existing.updatedAt = timestamp;
    if (!existing.sourceDescriptionSample) {
      existing.sourceDescriptionSample = sample;
    }
    data.transactionDescriptionAliases = aliases;
    return { errors: {} };
  }

  data.transactionDescriptionAliases = [
    ...aliases,
    {
      id: transactionDescriptionAliasId(normalized),
      sourceDescriptionNormalized: normalized,
      sourceDescriptionSample: sample,
      displayName: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  return { errors: {} };
}

export function removeTransactionDescriptionAlias(
  data: AppData,
  sourceDescription: string,
): void {
  const normalized = normalizeTransactionDescription(sourceDescription);
  data.transactionDescriptionAliases = (data.transactionDescriptionAliases ?? []).filter(
    (item) => item.sourceDescriptionNormalized !== normalized,
  );
}
