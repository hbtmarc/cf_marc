import {
  formatCentsToBRL,
  formatCompetenceLabel,
  formatDateLabel,
  invoiceStatusLabel,
  shiftCompetenceMonth,
  transactionStatusLabel,
} from "./finance";
import { PAGE_DESCRIPTIONS } from "./form-validation";
import type { RoutePath } from "./types";
import { ROUTE_LABELS } from "./router";

let liveRegion: HTMLElement | null = null;
let modalRoot: HTMLElement | null = null;
let lastFocusedElement: HTMLElement | null = null;
let activeModalKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function initUiRoots(): void {
  liveRegion = document.getElementById("live-region");
  modalRoot = document.getElementById("modal-root");
}

export function announce(message: string): void {
  if (liveRegion) {
    liveRegion.textContent = message;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function clearChildren(node: HTMLElement): void {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function moneyClass(cents: number): string {
  if (cents > 0) {
    return "money money--positive";
  }
  if (cents < 0) {
    return "money money--negative";
  }
  return "money";
}

export function renderMoney(cents: number): string {
  return `<span class="${moneyClass(cents)}">${escapeHtml(formatCentsToBRL(cents))}</span>`;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function cleanupModalListeners(): void {
  if (activeModalKeydownHandler) {
    document.removeEventListener("keydown", activeModalKeydownHandler);
    activeModalKeydownHandler = null;
  }
}

export function closeModal(): void {
  cleanupModalListeners();

  if (modalRoot) {
    clearChildren(modalRoot);
    modalRoot.classList.remove("modal-root--open");
    modalRoot.removeAttribute("aria-hidden");
  }

  const appShell = document.querySelector<HTMLElement>(".app-shell");
  appShell?.removeAttribute("inert");

  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  document.body.classList.remove("modal-open");
}

function createModalKeydownHandler(
  panel: HTMLElement,
  close: () => void,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };
}

export function openModal(options: {
  title: string;
  content: HTMLElement;
  onClose?: () => void;
  panelClass?: string;
  initialFocus?: HTMLElement | null;
}): void {
  if (!modalRoot) {
    return;
  }

  cleanupModalListeners();
  lastFocusedElement = document.activeElement as HTMLElement | null;
  clearChildren(modalRoot);

  const backdrop = el("div", "modal-backdrop");
  backdrop.setAttribute("aria-hidden", "true");

  const panel = el("div", `modal-panel ${options.panelClass ?? ""}`.trim());
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const header = el("header", "modal-panel__header");
  const title = el("h2", "modal-panel__title", options.title);
  const titleId = `modal-title-${Date.now()}`;
  title.id = titleId;
  panel.setAttribute("aria-labelledby", titleId);

  const closeButton = el("button", "modal-panel__close");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Fechar");
  closeButton.textContent = "×";

  const body = el("div", "modal-panel__body");
  body.appendChild(options.content);

  const close = (): void => {
    cleanupModalListeners();
    closeModal();
    options.onClose?.();
  };

  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);
  panel.appendChild(body);
  modalRoot.appendChild(backdrop);
  modalRoot.appendChild(panel);
  modalRoot.classList.add("modal-root--open");
  modalRoot.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");

  const appShell = document.querySelector<HTMLElement>(".app-shell");
  appShell?.setAttribute("inert", "");

  activeModalKeydownHandler = createModalKeydownHandler(panel, close);
  document.addEventListener("keydown", activeModalKeydownHandler);

  const initialFocus =
    options.initialFocus ??
    panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  initialFocus?.focus();
}

export function openConfirmModal(options: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}): void {
  const content = el("div", "confirm-modal");
  const message = el("p", "confirm-modal__message", options.message);
  const actions = el("div", "confirm-modal__actions");

  const cancelButton = el(
    "button",
    "btn btn--secondary",
    options.cancelLabel ?? "Cancelar",
  );
  cancelButton.type = "button";

  const confirmButton = el(
    "button",
    `btn ${options.danger ? "btn--danger" : "btn--primary"}`,
    options.confirmLabel,
  );
  confirmButton.type = "button";

  cancelButton.addEventListener("click", () => {
    closeModal();
  });

  confirmButton.addEventListener("click", () => {
    closeModal();
    options.onConfirm();
  });

  actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);
  content.appendChild(message);
  content.appendChild(actions);

  openModal({
    title: options.title,
    content,
    initialFocus: cancelButton,
  });
}

export function renderEmptyState(title: string, description: string): string {
  return `
    <div class="empty-state">
      <h3 class="empty-state__title">${escapeHtml(title)}</h3>
      <p class="empty-state__text">${escapeHtml(description)}</p>
    </div>
  `;
}

export function renderStatusChip(
  label: string,
  variant: "income" | "expense" | "neutral" | "warning" | "success",
): string {
  return `<span class="status-chip status-chip--${variant}">${escapeHtml(label)}</span>`;
}

export function transactionRowHtml(input: {
  description: string;
  category: string;
  date: string;
  amountCents: number;
  kind: "income" | "expense";
  status: "pending" | "settled";
}): string {
  const statusLabel = transactionStatusLabel(input.kind, input.status);
  const variant = input.kind === "income" ? "income" : "expense";
  const statusVariant =
    input.status === "settled" ? "success" : "warning";

  return `
    <div class="list-row__main">
      <strong class="list-row__title">${escapeHtml(input.description)}</strong>
      <span class="list-row__meta">${escapeHtml(input.category)} · ${escapeHtml(formatDateLabel(input.date))}</span>
    </div>
    <div class="list-row__aside">
      ${renderMoney(input.kind === "expense" ? -input.amountCents : input.amountCents)}
      ${renderStatusChip(statusLabel, statusVariant === "success" ? "success" : variant)}
    </div>
  `;
}

export function invoiceRowHtml(input: {
  cardName: string;
  dueDate: string;
  amountCents: number;
  status: "open" | "paid";
}): string {
  return `
    <div class="list-row__main">
      <strong class="list-row__title">${escapeHtml(input.cardName)}</strong>
      <span class="list-row__meta">Vencimento ${escapeHtml(formatDateLabel(input.dueDate))}</span>
    </div>
    <div class="list-row__aside">
      ${renderMoney(-input.amountCents)}
      ${renderStatusChip(invoiceStatusLabel(input.status), input.status === "paid" ? "success" : "warning")}
    </div>
  `;
}

export function renderCompetenceBar(options: {
  competenceMonth: string;
  onPrevious: () => void;
  onNext: () => void;
}): HTMLElement {
  const bar = el("div", "competence-bar");
  const prev = el("button", "competence-bar__btn");
  prev.type = "button";
  prev.setAttribute("aria-label", "Competência anterior");
  prev.textContent = "‹";

  const label = el("p", "competence-bar__label");
  label.textContent = formatCompetenceLabel(options.competenceMonth);

  const next = el("button", "competence-bar__btn");
  next.type = "button";
  next.setAttribute("aria-label", "Próxima competência");
  next.textContent = "›";

  prev.addEventListener("click", options.onPrevious);
  next.addEventListener("click", options.onNext);

  bar.appendChild(prev);
  bar.appendChild(label);
  bar.appendChild(next);
  return bar;
}

export function bindCompetenceShortcuts(
  competenceMonth: string,
  onChange: (month: string) => void,
): { previous: () => void; next: () => void } {
  const previous = (): void => {
    onChange(shiftCompetenceMonth(competenceMonth, -1));
  };
  const next = (): void => {
    onChange(shiftCompetenceMonth(competenceMonth, 1));
  };
  return { previous, next };
}

export function renderNav(currentRoute: RoutePath): string {
  const items: RoutePath[] = [
    "/dashboard",
    "/lancamentos",
    "/faturas",
    "/ajustes",
  ];

  return items
    .map((route) => {
      const active = route === currentRoute ? ' aria-current="page"' : "";
      return `<a class="nav-link" href="#${route}" data-route="${route}"${active}>${ROUTE_LABELS[route]}</a>`;
    })
    .join("");
}

export function setPageTitle(route: RoutePath): void {
  const title = ROUTE_LABELS[route];
  const description = PAGE_DESCRIPTIONS[route];
  const heading = document.getElementById("page-title");
  const descriptionNode = document.getElementById("page-description");

  if (heading) {
    heading.textContent = title;
  }
  if (descriptionNode) {
    descriptionNode.textContent = description;
  }

  document.title = `${title} — Controle Financeiro Mensal`;
}

export function renderStorageError(message: string): HTMLElement {
  const banner = el("section", "storage-error");
  banner.setAttribute("role", "alert");
  const title = el("h2", "storage-error__title", "Erro ao carregar dados locais");
  const text = el("p", "storage-error__text", message);
  const hint = el(
    "p",
    "storage-error__hint",
    "Seus dados brutos foram preservados. Corrija o conteúdo em localStorage ou apague a chave cfm:v2:appData para recomeçar.",
  );
  banner.appendChild(title);
  banner.appendChild(text);
  banner.appendChild(hint);
  return banner;
}

export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function renderPageToolbar(actions: HTMLElement): HTMLElement {
  const toolbar = el("div", "page-toolbar");
  toolbar.appendChild(actions);
  return toolbar;
}
