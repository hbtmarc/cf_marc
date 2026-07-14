import {
  hasRealInvoiceForCardMonth,
  isProjectedInvoice,
  nowIso,
  sumCents,
} from "./finance";
import { buildInstallmentProjections, type ProjectedInstallment } from "./installments";
import { recurringResolutionsForMonth } from "./recurrence-reconciliation";
import type { AppData, Invoice } from "./types";

function* iterateCompetenceMonths(
  startMonth: string,
  endMonth: string,
): Generator<string> {
  let current = startMonth;
  while (current <= endMonth) {
    yield current;
    const [yearStr, monthStr] = current.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const next = new Date(year, month - 1 + 1, 1);
    current = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }
}

export function projectedInvoiceStableId(
  cardId: string,
  competenceMonth: string,
): string {
  return `projected-invoice:${cardId}:${competenceMonth}`;
}

function projectedDueDateIso(
  cardDueDay: number | null,
  competenceMonth: string,
): string {
  if (cardDueDay === null) {
    return `${competenceMonth}-01`;
  }
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  const day = String(Math.min(cardDueDay, lastDay)).padStart(2, "0");
  return `${competenceMonth}-${day}`;
}

function computeProjectionHorizon(data: AppData): { startMonth: string; endMonth: string } {
  const months = buildInstallmentProjections(data).map((item) => item.competenceMonth);
  const transactionMonths = data.transactions.map((item) => item.competenceMonth);
  const selected = data.selectedCompetenceMonth;

  let startMonth = selected;
  let endMonth = selected;

  for (const month of [...months, ...transactionMonths, selected]) {
    if (month < startMonth) {
      startMonth = month;
    }
    if (month > endMonth) {
      endMonth = month;
    }
  }

  if (months.length === 0) {
    const [yearStr, monthStr] = endMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const extended = new Date(year, month - 1 + 12, 1);
    endMonth = `${extended.getFullYear()}-${String(extended.getMonth() + 1).padStart(2, "0")}`;
  }

  return { startMonth, endMonth };
}

export interface ProjectedInvoiceSlot {
  cardId: string;
  competenceMonth: string;
}

export function collectProjectedInvoiceSlots(data: AppData): ProjectedInvoiceSlot[] {
  const slots = new Map<string, ProjectedInvoiceSlot>();

  for (const projection of buildInstallmentProjections(data)) {
    if (hasRealInvoiceForCardMonth(data, projection.cardId, projection.competenceMonth)) {
      continue;
    }
    const key = `${projection.cardId}:${projection.competenceMonth}`;
    slots.set(key, {
      cardId: projection.cardId,
      competenceMonth: projection.competenceMonth,
    });
  }

  const { startMonth, endMonth } = computeProjectionHorizon(data);
  for (const competenceMonth of iterateCompetenceMonths(startMonth, endMonth)) {
    for (const resolution of recurringResolutionsForMonth(data, competenceMonth)) {
      if (resolution.state !== "projected") {
        continue;
      }
      if (resolution.occurrence.billingMode !== "card" || !resolution.occurrence.cardId) {
        continue;
      }
      if (
        hasRealInvoiceForCardMonth(
          data,
          resolution.occurrence.cardId,
          competenceMonth,
        )
      ) {
        continue;
      }
      const key = `${resolution.occurrence.cardId}:${competenceMonth}`;
      slots.set(key, {
        cardId: resolution.occurrence.cardId,
        competenceMonth,
      });
    }
  }

  return [...slots.values()];
}

export function projectedInstallmentsForProjectedInvoice(
  data: AppData,
  invoice: Invoice,
): ProjectedInstallment[] {
  if (!isProjectedInvoice(invoice)) {
    return [];
  }
  return buildInstallmentProjections(data).filter(
    (item) =>
      item.cardId === invoice.cardId &&
      item.competenceMonth === invoice.competenceMonth,
  );
}

export function projectedInvoiceTotalForCardMonth(
  data: AppData,
  cardId: string,
  competenceMonth: string,
): number {
  const installmentTotal = sumCents(
    buildInstallmentProjections(data)
      .filter(
        (item) =>
          item.cardId === cardId && item.competenceMonth === competenceMonth,
      )
      .map((item) => item.amountCents),
  );
  const recurringTotal = sumCents(
    recurringResolutionsForMonth(data, competenceMonth)
      .filter(
        (item) =>
          item.state === "projected" &&
          item.occurrence.billingMode === "card" &&
          item.occurrence.cardId === cardId,
      )
      .map((item) => item.occurrence.amountCents),
  );
  return installmentTotal + recurringTotal;
}

export function syncProjectedInvoices(data: AppData): void {
  const slots = collectProjectedInvoiceSlots(data);
  const timestamp = nowIso();
  const activeIds = new Set<string>();

  for (const slot of slots) {
    const card = data.cards.find((item) => item.id === slot.cardId);
    if (!card) {
      continue;
    }

    const total = projectedInvoiceTotalForCardMonth(
      data,
      slot.cardId,
      slot.competenceMonth,
    );
    if (total <= 0) {
      continue;
    }

    const id = projectedInvoiceStableId(slot.cardId, slot.competenceMonth);
    activeIds.add(id);
    const dueDate = projectedDueDateIso(card.dueDay, slot.competenceMonth);
    const existing = data.invoices.find((item) => item.id === id);

    if (existing) {
      existing.amountCents = total;
      existing.invoiceTotalCents = total;
      existing.amountPaidCents = 0;
      existing.amountDueCents = total;
      existing.creditBalanceCents = 0;
      existing.dueDate = dueDate;
      existing.status = "open";
      existing.isProjected = true;
      existing.updatedAt = timestamp;
      continue;
    }

    data.invoices.push({
      id,
      cardId: slot.cardId,
      competenceMonth: slot.competenceMonth,
      amountCents: total,
      invoiceTotalCents: total,
      amountPaidCents: 0,
      amountDueCents: total,
      creditBalanceCents: 0,
      dueDate,
      status: "open",
      isProjected: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  data.invoices = data.invoices.filter((invoice) => {
    if (!isProjectedInvoice(invoice)) {
      return true;
    }
    return activeIds.has(invoice.id);
  });

  data.invoices.sort((left, right) => {
    const monthDelta = left.competenceMonth.localeCompare(right.competenceMonth);
    if (monthDelta !== 0) {
      return monthDelta;
    }
    if (isProjectedInvoice(left) !== isProjectedInvoice(right)) {
      return isProjectedInvoice(left) ? 1 : -1;
    }
    return left.id.localeCompare(right.id);
  });
}
