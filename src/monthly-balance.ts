import {
  buildDashboardFixedBills,
  buildDashboardInvoicesSubtotalCents,
} from "./dashboard-executive";
import { calculateCompetenceSummary, nowIso } from "./finance";
import type { AppData, MonthlyBalance } from "./types";

export interface MonthlyBalanceSnapshot {
  competenceMonth: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  projectedBalanceCents: number;
  fixedBillsCents: number;
  invoicesCents: number;
}

export function monthlyBalanceId(competenceMonth: string): string {
  return `monthly-balance:${competenceMonth}`;
}

export function buildMonthlyBalanceSnapshot(
  data: AppData,
  competenceMonth: string,
): MonthlyBalanceSnapshot {
  const summary = calculateCompetenceSummary(data, competenceMonth);
  const fixedBills = buildDashboardFixedBills(data, competenceMonth);
  return {
    competenceMonth,
    incomeCents: summary.incomeSettledCents,
    expenseCents: summary.expensePaidCents,
    balanceCents: summary.balanceRealizedCents,
    projectedBalanceCents: summary.balancePlannedCents,
    fixedBillsCents: fixedBills.subtotalCents,
    invoicesCents: buildDashboardInvoicesSubtotalCents(data, competenceMonth),
  };
}

export function getMonthlyBalanceByCompetence(
  data: AppData,
  competenceMonth: string,
): MonthlyBalance | null {
  return (
    (data.monthlyBalances ?? []).find((item) => item.competenceMonth === competenceMonth) ??
    null
  );
}

export function listMonthlyBalances(data: AppData): MonthlyBalance[] {
  return [...(data.monthlyBalances ?? [])].sort((left, right) =>
    right.competenceMonth.localeCompare(left.competenceMonth),
  );
}

function snapshotToBalance(
  snapshot: MonthlyBalanceSnapshot,
  note: string | undefined,
  existing?: MonthlyBalance,
): MonthlyBalance {
  const timestamp = nowIso();
  return {
    id: monthlyBalanceId(snapshot.competenceMonth),
    competenceMonth: snapshot.competenceMonth,
    incomeCents: snapshot.incomeCents,
    expenseCents: snapshot.expenseCents,
    balanceCents: snapshot.balanceCents,
    projectedBalanceCents: snapshot.projectedBalanceCents,
    fixedBillsCents: snapshot.fixedBillsCents,
    invoicesCents: snapshot.invoicesCents,
    ...(note?.trim() ? { note: note.trim() } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function registerMonthlyBalance(
  data: AppData,
  competenceMonth: string,
  note?: string,
): MonthlyBalance {
  const balances = data.monthlyBalances ?? [];
  const existing = getMonthlyBalanceByCompetence(data, competenceMonth);
  if (existing) {
    throw new Error("Balanço já registrado para esta competência.");
  }
  const snapshot = buildMonthlyBalanceSnapshot(data, competenceMonth);
  const balance = snapshotToBalance(snapshot, note);
  data.monthlyBalances = [...balances, balance];
  return balance;
}

export function updateMonthlyBalance(
  data: AppData,
  competenceMonth: string,
  note?: string,
): MonthlyBalance | null {
  const existing = getMonthlyBalanceByCompetence(data, competenceMonth);
  if (!existing) {
    return null;
  }
  const snapshot = buildMonthlyBalanceSnapshot(data, competenceMonth);
  const balance = snapshotToBalance(snapshot, note, existing);
  data.monthlyBalances = (data.monthlyBalances ?? []).map((item) =>
    item.competenceMonth === competenceMonth ? balance : item,
  );
  return balance;
}
