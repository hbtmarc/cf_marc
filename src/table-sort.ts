export type SortDirection = "asc" | "desc";

export interface TableSortState<C extends string = string> {
  column: C;
  direction: SortDirection;
}

export type SortKind = "text" | "date" | "number" | "installment" | "status";

export type SortValue = string | number | null;

export interface InstallmentSortValue {
  current: number | null;
  total: number | null;
}

export interface SortColumnAccessor<T> {
  kind: SortKind;
  getValue: (item: T) => SortValue | InstallmentSortValue;
  statusOrder?: readonly string[];
}

/**
 * Ordem explícita de status de lançamentos (menor = aparece primeiro em asc):
 * Na fatura → Pendente → quitado (Pago / Recebido).
 */
export const TRANSACTION_STATUS_SORT_ORDER = [
  "Na fatura",
  "Pendente",
  "Pago",
  "Recebido",
] as const;

/**
 * Ordem explícita de status de faturas (menor = aparece primeiro em asc):
 * Aberta → Parcial → Paga → Credora.
 */
export const INVOICE_STATUS_SORT_ORDER = [
  "Aberta",
  "Parcial",
  "Paga",
  "Credora",
] as const;

export function toggleTableSort<C extends string>(
  current: TableSortState<C>,
  column: C,
  firstDirection: SortDirection = "asc",
): TableSortState<C> {
  if (current.column === column) {
    return {
      column,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { column, direction: firstDirection };
}

function isMissingSortValue(value: SortValue | InstallmentSortValue): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (typeof value === "object") {
    return value.current === null && value.total === null;
  }
  return false;
}

function compareInstallmentValues(
  a: InstallmentSortValue,
  b: InstallmentSortValue,
): number {
  const missingA = a.current === null && a.total === null;
  const missingB = b.current === null && b.total === null;
  if (missingA && missingB) {
    return 0;
  }
  if (missingA) {
    return 1;
  }
  if (missingB) {
    return -1;
  }
  const currentDiff = (a.current ?? 0) - (b.current ?? 0);
  if (currentDiff !== 0) {
    return currentDiff;
  }
  return (a.total ?? 0) - (b.total ?? 0);
}

export function compareSortValues(
  a: SortValue | InstallmentSortValue,
  b: SortValue | InstallmentSortValue,
  kind: SortKind,
  direction: SortDirection,
  statusOrder?: readonly string[],
): number {
  if (kind === "installment") {
    const installmentA = a as InstallmentSortValue;
    const installmentB = b as InstallmentSortValue;
    const result = compareInstallmentValues(installmentA, installmentB);
    return direction === "asc" ? result : -result;
  }

  const missingA = isMissingSortValue(a);
  const missingB = isMissingSortValue(b);
  if (missingA && missingB) {
    return 0;
  }
  if (missingA) {
    return 1;
  }
  if (missingB) {
    return -1;
  }

  let result = 0;
  switch (kind) {
    case "date":
      result = String(a).localeCompare(String(b));
      break;
    case "number":
      result = Number(a) - Number(b);
      break;
    case "status": {
      const order = statusOrder ?? [];
      const indexA = order.indexOf(String(a));
      const indexB = order.indexOf(String(b));
      result =
        (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
      break;
    }
    case "text":
    default:
      result = String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
      break;
  }

  return direction === "asc" ? result : -result;
}

export function sortTableItems<T, C extends string>(
  items: readonly T[],
  state: TableSortState<C>,
  columns: Record<C, SortColumnAccessor<T>>,
): T[] {
  const accessor = columns[state.column];
  return [...items].sort((left, right) =>
    compareSortValues(
      accessor.getValue(left),
      accessor.getValue(right),
      accessor.kind,
      state.direction,
      accessor.statusOrder,
    ),
  );
}

export function ariaSortValue(direction: SortDirection): "ascending" | "descending" {
  return direction === "asc" ? "ascending" : "descending";
}
