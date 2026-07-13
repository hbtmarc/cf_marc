import {
  filterTransactionsByCompetence,
  formatCentsToBRL,
  formatCompetenceLabel,
  formatDateLabel,
  invoiceNeedsFinancialAction,
  invoiceStatusLabel,
  shiftCompetenceMonth,
  transactionStatusLabel,
  filterInvoicesByCompetence,
} from "./finance";
import { navIconForRoute, overflowIcon } from "./icons";
import {
  formatInvoiceCount,
  formatTransactionCount,
  sentenceCase,
} from "./text";
import type { AppData, RoutePath } from "./types";
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
  const normalizedCents = cents === 0 || Object.is(cents, -0) ? 0 : cents;
  if (normalizedCents > 0) {
    return "money money--positive";
  }
  if (normalizedCents < 0) {
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
  onCancel?: () => void;
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

  const close = (): void => {
    closeModal();
    options.onCancel?.();
  };

  cancelButton.addEventListener("click", close);

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
  ledgerStatus?: "paid" | "pending" | "in_invoice";
}): string {
  const statusLabel = transactionStatusLabel(input.kind, input.status, input.ledgerStatus);
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
      ${renderStatusChip(
        invoiceStatusLabel({
          id: "",
          cardId: "",
          competenceMonth: "2026-01",
          amountCents: input.amountCents,
          dueDate: input.dueDate,
          status: input.status,
          createdAt: "",
          updatedAt: "",
        }),
        input.status === "paid" ? "success" : "warning",
      )}
    </div>
  `;
}

const MONTH_NAMES_LONG = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function formatCompetenceLongLabel(competenceMonth: string): string {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const monthIndex = Number(monthStr) - 1;
  const monthName = MONTH_NAMES_LONG[monthIndex];
  if (monthName === undefined) {
    return formatCompetenceLabel(competenceMonth);
  }
  return sentenceCase(`${monthName} de ${yearStr}`);
}

export function renderCompetenceBar(options: {
  competenceMonth: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onPick: (month: string) => void;
}): HTMLElement {
  const bar = el("div", "competence-control");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Selecionar competência");

  const longLabel = formatCompetenceLongLabel(options.competenceMonth);

  const prev = el("button", "competence-control__btn");
  prev.type = "button";
  prev.setAttribute("aria-label", "Competência anterior");
  prev.textContent = "‹";

  const picker = el("input", "competence-control__picker") as HTMLInputElement;
  picker.type = "month";
  picker.value = options.competenceMonth;
  picker.setAttribute("aria-label", "Escolher competência");
  picker.tabIndex = -1;

  const current = el("button", "competence-control__current");
  current.type = "button";
  current.setAttribute(
    "aria-label",
    `Competência ${longLabel}. Clique para escolher outro mês.`,
  );
  current.textContent = longLabel;

  const today = el("button", "competence-control__today");
  today.type = "button";
  today.textContent = "Atual";
  today.setAttribute("aria-label", "Voltar para a competência atual");

  const next = el("button", "competence-control__btn");
  next.type = "button";
  next.setAttribute("aria-label", "Próxima competência");
  next.textContent = "›";

  prev.addEventListener("click", options.onPrevious);
  next.addEventListener("click", options.onNext);
  today.addEventListener("click", options.onToday);
  current.addEventListener("click", () => {
    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }
    picker.click();
  });
  picker.addEventListener("change", () => {
    if (picker.value) {
      options.onPick(picker.value);
    }
  });

  bar.appendChild(prev);
  bar.appendChild(current);
  bar.appendChild(picker);
  bar.appendChild(today);
  bar.appendChild(next);
  return bar;
}

export interface RowMenuItem {
  label: string;
  variant?: "default" | "danger";
  onClick: () => void;
}

export function createRowMenu(items: RowMenuItem[]): HTMLElement {
  const wrapper = el("div", "row-menu");
  const trigger = el("button", "row-menu__trigger");
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Ações da linha");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = overflowIcon();

  const panel = el("div", "row-menu__panel");
  panel.setAttribute("role", "menu");
  panel.hidden = true;

  const closeMenu = (): void => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    panel.style.position = "";
    panel.style.top = "";
    panel.style.left = "";
    panel.style.zIndex = "";
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeydown);
  };

  const openMenu = (): void => {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    panel.style.position = "fixed";
    panel.style.zIndex = "40";
    const rect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 176;
    const left = Math.max(
      8,
      Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8),
    );
    const top = rect.bottom + 4;
    const fitsBelow = top + panel.offsetHeight <= window.innerHeight - 8;
    panel.style.left = `${left}px`;
    panel.style.top = fitsBelow
      ? `${top}px`
      : `${Math.max(8, rect.top - panel.offsetHeight - 4)}px`;

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeydown);
    const firstItem = panel.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (!wrapper.contains(event.target as Node)) {
      closeMenu();
    }
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      trigger.focus();
      return;
    }

    const items = Array.from(
      panel.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const activeIndex = items.findIndex((item) => item === document.activeElement);
    if (event.key === "ArrowDown" && items.length > 0) {
      event.preventDefault();
      const next = items[(activeIndex + 1) % items.length];
      next?.focus();
    }
    if (event.key === "ArrowUp" && items.length > 0) {
      event.preventDefault();
      const prev = items[(activeIndex - 1 + items.length) % items.length];
      prev?.focus();
    }
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (panel.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  for (const item of items) {
    const button = el(
      "button",
      `row-menu__item${item.variant === "danger" ? " row-menu__item--danger" : ""}`,
      item.label,
    );
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeMenu();
      item.onClick();
    });
    panel.appendChild(button);
  }

  wrapper.appendChild(trigger);
  wrapper.appendChild(panel);
  return wrapper;
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

const NAV_SHORT_LABELS: Record<RoutePath, string> = {
  "/dashboard": "Início",
  "/balanco": "Balanço",
  "/lancamentos": "Lançam.",
  "/faturas": "Faturas",
  "/planejamento": "Planej.",
  "/importar": "Import.",
  "/ajustes": "Ajustes",
};

const NAV_LABELS: Record<RoutePath, string> = {
  "/dashboard": "Visão geral",
  "/balanco": "Balanço",
  "/lancamentos": "Lançamentos",
  "/faturas": "Cartões e faturas",
  "/planejamento": "Planejamento",
  "/importar": "Importar dados",
  "/ajustes": "Ajustes",
};

const NAV_GROUPS: Array<{ label: string; routes: RoutePath[] }> = [
  { label: "Principal", routes: ["/dashboard", "/balanco"] },
  { label: "Operação", routes: ["/lancamentos", "/planejamento", "/importar"] },
  { label: "Crédito", routes: ["/faturas"] },
  { label: "Sistema", routes: ["/ajustes"] },
];

const PAGE_DESC_EXTENDED: Record<RoutePath, string> = {
  "/dashboard": "Situação atual, compromissos e fechamento projetado da competência.",
  "/balanco": "Checklist de contas, faturas e balanço no momento da quitação.",
  "/lancamentos": "Ledger operacional com busca, filtros e ações sobre receitas e despesas.",
  "/faturas": "Cartões, faturas da competência e compromissos de crédito.",
  "/planejamento": "Receitas previstas, fixas, assinaturas e conciliação com lançamentos.",
  "/importar": "Importação local de arquivos JSON no contrato cfm.import.v1.",
  "/ajustes": "Cartões, dados locais e preferências do dispositivo.",
};

function navBadgeForRoute(
  route: RoutePath,
  data: AppData,
): { count: number; label: string } | null {
  const month = data.selectedCompetenceMonth;
  const today = new Date().toISOString().slice(0, 10);

  if (route === "/lancamentos") {
    const count = filterTransactionsByCompetence(data.transactions, month).filter(
      (item) => item.status === "pending",
    ).length;
    if (count === 0) {
      return null;
    }
    return {
      count,
      label: `${formatTransactionCount(count)} pendente${count === 1 ? "" : "s"}`,
    };
  }

  if (route === "/faturas") {
    const count = filterInvoicesByCompetence(data.invoices, month).filter((item) =>
      invoiceNeedsFinancialAction(item, today),
    ).length;
    if (count === 0) {
      return null;
    }
    return {
      count,
      label: `${formatInvoiceCount(count)} exig${count === 1 ? "e" : "em"} ação`,
    };
  }

  return null;
}

export function renderNav(currentRoute: RoutePath, data: AppData): string {
  return NAV_GROUPS.map((group) => {
    const links = group.routes
      .map((route) => {
        const active = route === currentRoute ? ' aria-current="page"' : "";
        const badge = navBadgeForRoute(route, data);
        return `<a class="nav-link" href="#${route}" data-route="${route}"${active}>
          ${navIconForRoute(route)}
          <span class="nav-link__full">${NAV_LABELS[route]}</span>
          <span class="nav-link__short">${NAV_SHORT_LABELS[route]}</span>
          ${badge ? `<span class="nav-link__badge" aria-label="${escapeHtml(badge.label)}">${badge.count > 9 ? "9+" : badge.count}</span>` : ""}
        </a>`;
      })
      .join("");
    return `<div class="nav-group"><p class="nav-group__label">${group.label}</p>${links}</div>`;
  }).join("");
}

export function setPageTitle(route: RoutePath): void {
  const title = ROUTE_LABELS[route];
  const heading = document.getElementById("page-title");
  const descriptionNode = document.getElementById("page-description");

  if (heading) {
    heading.textContent = title;
  }
  if (descriptionNode) {
    descriptionNode.textContent = PAGE_DESC_EXTENDED[route];
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
