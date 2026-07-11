import type { AppData, Transaction } from "./types";

function shiftCompetenceMonth(competenceMonth: string, delta: number): string {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1 + delta, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export interface ProjectedInstallment {
  id: string;
  sourceTransactionId: string;
  competenceMonth: string;
  description: string;
  amountCents: number;
  category: string;
  cardId: string;
  installment: { current: number; total: number };
  projected: true;
}

export type LancamentoRow =
  | { rowKind: "transaction"; data: Transaction }
  | { rowKind: "projected"; data: ProjectedInstallment };

export const PROJECTED_STATUS_LABEL = "Projetada";

export const LANCAMENTOS_STATUS_SORT_ORDER = [
  PROJECTED_STATUS_LABEL,
  "Na fatura",
  "Pendente",
  "Pago",
  "Recebido",
] as const;

export function normalizeInstallmentDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isInstallmentProjectionCandidate(transaction: Transaction): boolean {
  if (transaction.kind !== "expense") {
    return false;
  }
  if (transaction.ledgerStatus !== "in_invoice") {
    return false;
  }
  if (transaction.expenseKind === "fee" || transaction.expenseKind === "refund") {
    return false;
  }
  if (!transaction.cardId) {
    return false;
  }
  const installment = transaction.installment;
  if (!installment) {
    return false;
  }
  if (!Number.isInteger(installment.current) || !Number.isInteger(installment.total)) {
    return false;
  }
  if (installment.current < 1 || installment.total <= installment.current) {
    return false;
  }
  return true;
}

export function installmentSignature(transaction: Transaction): string {
  const installment = transaction.installment;
  return [
    transaction.cardId,
    normalizeInstallmentDescription(transaction.description),
    transaction.amountCents,
    installment?.total,
  ].join("|");
}

export function installmentFingerprintKey(transaction: Transaction): string {
  return transaction.canonicalFingerprint ?? transaction.id;
}

export function projectedInstallmentId(
  sourceTransactionId: string,
  installmentNumber: number,
): string {
  return `projected:${sourceTransactionId}:${installmentNumber}`;
}

export function selectInstallmentProjectionSources(
  transactions: readonly Transaction[],
): Transaction[] {
  const candidates = transactions.filter(isInstallmentProjectionCandidate);
  const bySignature = new Map<string, Transaction[]>();

  for (const transaction of candidates) {
    const signature = installmentSignature(transaction);
    const group = bySignature.get(signature) ?? [];
    group.push(transaction);
    bySignature.set(signature, group);
  }

  const sources: Transaction[] = [];

  for (const group of bySignature.values()) {
    const latestCompetence = group.reduce(
      (latest, transaction) =>
        transaction.competenceMonth > latest ? transaction.competenceMonth : latest,
      "",
    );
    const inLatestCompetence = group.filter(
      (transaction) => transaction.competenceMonth === latestCompetence,
    );
    const byFingerprint = new Map<string, Transaction>();

    for (const transaction of inLatestCompetence) {
      const fingerprint = installmentFingerprintKey(transaction);
      const existing = byFingerprint.get(fingerprint);
      const current = transaction.installment?.current ?? 0;
      const existingCurrent = existing?.installment?.current ?? 0;
      if (!existing || current > existingCurrent) {
        byFingerprint.set(fingerprint, transaction);
      }
    }

    sources.push(...byFingerprint.values());
  }

  return sources;
}

export function projectInstallmentsFromSource(
  source: Transaction,
): ProjectedInstallment[] {
  const installment = source.installment;
  if (!installment || !source.cardId || !isInstallmentProjectionCandidate(source)) {
    return [];
  }

  const projections: ProjectedInstallment[] = [];
  for (let number = installment.current + 1; number <= installment.total; number += 1) {
    const monthOffset = number - installment.current;
    projections.push({
      id: projectedInstallmentId(source.id, number),
      sourceTransactionId: source.id,
      competenceMonth: shiftCompetenceMonth(source.competenceMonth, monthOffset),
      description: source.description,
      amountCents: source.amountCents,
      category: source.category,
      cardId: source.cardId,
      installment: { current: number, total: installment.total },
      projected: true,
    });
  }

  return projections;
}

export function buildInstallmentProjections(data: AppData): ProjectedInstallment[] {
  return selectInstallmentProjectionSources(data.transactions).flatMap(
    projectInstallmentsFromSource,
  );
}

export function hasInvoiceForCardMonth(
  data: AppData,
  cardId: string,
  competenceMonth: string,
): boolean {
  return data.invoices.some(
    (invoice) => invoice.cardId === cardId && invoice.competenceMonth === competenceMonth,
  );
}

export function projectedInstallmentsForMonth(
  data: AppData,
  competenceMonth: string,
): ProjectedInstallment[] {
  return buildInstallmentProjections(data).filter(
    (item) =>
      item.competenceMonth === competenceMonth &&
      !hasInvoiceForCardMonth(data, item.cardId, competenceMonth),
  );
}

export function projectedInstallmentCentsForMonth(
  data: AppData,
  competenceMonth: string,
): number {
  return projectedInstallmentsForMonth(data, competenceMonth).reduce(
    (total, item) => total + item.amountCents,
    0,
  );
}

export function isProjectedInstallmentRow(row: LancamentoRow): row is {
  rowKind: "projected";
  data: ProjectedInstallment;
} {
  return row.rowKind === "projected";
}

export function lancamentoRowId(row: LancamentoRow): string {
  return row.rowKind === "projected" ? row.data.id : row.data.id;
}

export function lancamentoRowStatusLabel(row: LancamentoRow): string {
  if (row.rowKind === "projected") {
    return PROJECTED_STATUS_LABEL;
  }
  return row.data.kind === "income"
    ? row.data.status === "settled"
      ? "Recebido"
      : "Pendente"
    : row.data.ledgerStatus === "in_invoice"
      ? "Na fatura"
      : row.data.status === "settled"
        ? "Pago"
        : "Pendente";
}
