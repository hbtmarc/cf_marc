import {
  buildDashboardFixedBills,
  buildDashboardInvoicesSubtotalCents,
} from "./dashboard-executive";
import { calculateCompetenceSummary, nowIso } from "./finance";
import type { PaymentChecklistSummary } from "./payment-checklist";
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
    ...(existing?.note ? { note: existing.note } : {}),
    checkedItemIds: [...new Set(existing?.checkedItemIds ?? [])],
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function upsertBalance(data: AppData, balance: MonthlyBalance): MonthlyBalance {
  const balances = data.monthlyBalances ?? [];
  const exists = balances.some((item) => item.competenceMonth === balance.competenceMonth);
  data.monthlyBalances = exists
    ? balances.map((item) =>
        item.competenceMonth === balance.competenceMonth ? balance : item,
      )
    : [...balances, balance];
  return balance;
}

function draftBalance(data: AppData, competenceMonth: string): MonthlyBalance {
  const existing = getMonthlyBalanceByCompetence(data, competenceMonth) ?? undefined;
  return snapshotToBalance(buildMonthlyBalanceSnapshot(data, competenceMonth), existing);
}

export function setMonthlyBalanceChecklistItem(
  data: AppData,
  competenceMonth: string,
  itemId: string,
  checked: boolean,
): MonthlyBalance {
  const balance = draftBalance(data, competenceMonth);
  const ids = new Set(balance.checkedItemIds ?? []);
  if (checked) {
    ids.add(itemId);
  } else {
    ids.delete(itemId);
  }
  balance.checkedItemIds = [...ids];
  delete balance.settledAt;
  delete balance.checklistTotalCount;
  delete balance.checklistCheckedCount;
  delete balance.checklistTargetCents;
  delete balance.checklistCheckedCents;
  delete balance.checklistRemainingCents;
  delete balance.sourceOutstandingCents;
  delete balance.estimatedBalanceAfterCommitmentsCents;
  return upsertBalance(data, balance);
}

export function clearMonthlyBalanceChecklist(
  data: AppData,
  competenceMonth: string,
): MonthlyBalance {
  const balance = draftBalance(data, competenceMonth);
  balance.checkedItemIds = [];
  delete balance.settledAt;
  delete balance.checklistTotalCount;
  delete balance.checklistCheckedCount;
  delete balance.checklistTargetCents;
  delete balance.checklistCheckedCents;
  delete balance.checklistRemainingCents;
  delete balance.sourceOutstandingCents;
  delete balance.estimatedBalanceAfterCommitmentsCents;
  return upsertBalance(data, balance);
}

export function completeMonthlyBalanceChecklist(
  data: AppData,
  competenceMonth: string,
  checklist: PaymentChecklistSummary,
): MonthlyBalance {
  if (checklist.totalCount === 0 || !checklist.allChecked) {
    throw new Error("Conclua todos os itens do checklist antes de registrar a quitação.");
  }

  const existing = getMonthlyBalanceByCompetence(data, competenceMonth) ?? undefined;
  const balance = snapshotToBalance(
    buildMonthlyBalanceSnapshot(data, competenceMonth),
    existing,
  );
  const timestamp = nowIso();
  balance.settledAt = timestamp;
  balance.updatedAt = timestamp;
  balance.checklistTotalCount = checklist.totalCount;
  balance.checklistCheckedCount = checklist.checkedCount;
  balance.checklistTargetCents = checklist.checklistTargetCents;
  balance.checklistCheckedCents = checklist.checklistCheckedCents;
  balance.checklistRemainingCents = checklist.checklistRemainingCents;
  balance.sourceOutstandingCents = checklist.sourceOutstandingCents;
  balance.estimatedBalanceAfterCommitmentsCents =
    checklist.estimatedBalanceAfterCommitmentsCents;
  return upsertBalance(data, balance);
}

export function reopenMonthlyBalanceChecklist(
  data: AppData,
  competenceMonth: string,
): MonthlyBalance | null {
  const existing = getMonthlyBalanceByCompetence(data, competenceMonth);
  if (!existing) {
    return null;
  }
  const balance = draftBalance(data, competenceMonth);
  delete balance.settledAt;
  delete balance.checklistTotalCount;
  delete balance.checklistCheckedCount;
  delete balance.checklistTargetCents;
  delete balance.checklistCheckedCents;
  delete balance.checklistRemainingCents;
  delete balance.sourceOutstandingCents;
  delete balance.estimatedBalanceAfterCommitmentsCents;
  return upsertBalance(data, balance);
}
