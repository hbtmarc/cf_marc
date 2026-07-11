import type { InstallmentSortValue } from "./table-sort";
import type { Transaction } from "./types";

export const CASH_INSTALLMENT_LABEL = "À vista";

export function installmentDisplayLabel(item: Transaction): string {
  if (item.installment) {
    return `${item.installment.current}/${item.installment.total}`;
  }
  return CASH_INSTALLMENT_LABEL;
}

export function installmentSortValue(item: Transaction): InstallmentSortValue {
  if (item.installment) {
    return { current: item.installment.current, total: item.installment.total };
  }
  return { current: 0, total: 0 };
}
