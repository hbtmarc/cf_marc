import type { PaymentChecklistItem } from "./payment-checklist";

export type PaymentItemDisplayStatus = "PAGO" | "Vencida" | "A Vencer" | "Em aberto";

export const PAYMENT_DUE_SOON_DAYS = 7;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function paymentItemDisplayStatus(
  item: PaymentChecklistItem,
  todayIso: string,
  dueSoonDays = PAYMENT_DUE_SOON_DAYS,
): { label: PaymentItemDisplayStatus; className: string } {
  if (item.manuallyChecked) {
    return { label: "PAGO", className: "status-chip--paid" };
  }

  if (item.dueDateIso) {
    if (item.dueDateIso < todayIso) {
      return { label: "Vencida", className: "status-chip--overdue" };
    }

    const dueSoonLimit = addDays(todayIso, dueSoonDays);
    if (item.dueDateIso <= dueSoonLimit) {
      return { label: "A Vencer", className: "status-chip--due-soon" };
    }
  }

  return { label: "Em aberto", className: "status-chip--open" };
}
