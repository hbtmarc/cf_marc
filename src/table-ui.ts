import { escapeHtml } from "./ui";
import {
  ariaSortValue,
  type SortDirection,
  type TableSortState,
} from "./table-sort";

export interface SortableColumnOption<C extends string = string> {
  id: C;
  label: string;
  sortable?: boolean;
}

export function renderSortableTh<C extends string>(
  column: SortableColumnOption<C>,
  state: TableSortState<C>,
  className = "",
): string {
  if (column.sortable === false) {
    return `<th scope="col" class="${className}">${escapeHtml(column.label)}</th>`;
  }

  const isActive = state.column === column.id;
  const ariaSort = isActive ? ` aria-sort="${ariaSortValue(state.direction)}"` : "";
  const indicator = isActive
    ? `<span class="table-sort-indicator" aria-hidden="true">${state.direction === "asc" ? "↑" : "↓"}</span>`
    : `<span class="table-sort-indicator table-sort-indicator--idle" aria-hidden="true">↕</span>`;

  return `<th scope="col" class="${className} table-sort-th">
    <button type="button" class="table-sort-btn" data-sort-column="${escapeHtml(column.id)}"${ariaSort}>
      <span class="table-sort-btn__label">${escapeHtml(column.label)}</span>
      ${indicator}
    </button>
  </th>`;
}

export function renderMobileSortControl<C extends string>(
  columns: SortableColumnOption<C>[],
  state: TableSortState<C>,
  controlId: string,
): string {
  const sortable = columns.filter((column) => column.sortable !== false);
  const options = sortable.flatMap((column) => [
    `<option value="${escapeHtml(column.id)}:asc" ${state.column === column.id && state.direction === "asc" ? "selected" : ""}>${escapeHtml(column.label)} (crescente)</option>`,
    `<option value="${escapeHtml(column.id)}:desc" ${state.column === column.id && state.direction === "desc" ? "selected" : ""}>${escapeHtml(column.label)} (decrescente)</option>`,
  ]);

  return `
    <label class="field field--inline table-sort-mobile" for="${escapeHtml(controlId)}">
      <span class="field__label">Ordenar por</span>
      <select class="field__control" id="${escapeHtml(controlId)}" data-table-mobile-sort>
        ${options.join("")}
      </select>
    </label>`;
}

export function bindTableSortControls<C extends string>(
  host: HTMLElement,
  options: {
    mobileControlId?: string;
    onColumnActivate: (column: C) => void;
    onMobileSort: (column: C, direction: SortDirection) => void;
  },
): void {
  host.querySelectorAll<HTMLButtonElement>(".table-sort-btn[data-sort-column]").forEach((button) => {
    const handle = (): void => {
      const column = button.dataset.sortColumn as C | undefined;
      if (column) {
        options.onColumnActivate(column);
      }
    };
    button.addEventListener("click", handle);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handle();
      }
    });
  });

  if (options.mobileControlId) {
    const select = host.querySelector<HTMLSelectElement>(`#${options.mobileControlId}`);
    select?.addEventListener("change", () => {
      const [column, direction] = select.value.split(":") as [C, SortDirection];
      options.onMobileSort(column, direction);
    });
  }
}
