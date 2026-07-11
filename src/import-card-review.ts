import type { ImportCard, ImportPayload } from "./import-types";
import type { AppData, Card } from "./types";

export interface CardCompletionField {
  importId: string;
  name: string;
  needsClosingDay: boolean;
  needsDueDay: boolean;
}

export interface CardCompletionDraft {
  closingDay: string;
  dueDay: string;
}

function isValidDay(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

export function findLocalCardByImportId(data: AppData, importId: string): Card | undefined {
  return data.cards.find((item) => item.sourceImportId === importId);
}

export function hasConfiguredClosingDay(importCard: ImportCard, localCard?: Card): boolean {
  if (importCard.closingDay !== undefined && isValidDay(importCard.closingDay)) {
    return true;
  }
  return localCard?.closingDay !== null && localCard?.closingDay !== undefined;
}

export function hasConfiguredDueDay(importCard: ImportCard, localCard?: Card): boolean {
  if (importCard.dueDay !== undefined && isValidDay(importCard.dueDay)) {
    return true;
  }
  return localCard?.dueDay !== null && localCard?.dueDay !== undefined;
}

export function buildCardCompletionFields(
  payload: ImportPayload,
  localData: AppData,
): CardCompletionField[] {
  return payload.cards.flatMap((card) => {
    const localCard = findLocalCardByImportId(localData, card.id);
    const needsClosingDay = !hasConfiguredClosingDay(card, localCard);
    const needsDueDay = !hasConfiguredDueDay(card, localCard);
    if (!needsClosingDay && !needsDueDay) {
      return [];
    }
    return [
      {
        importId: card.id,
        name: card.name,
        needsClosingDay,
        needsDueDay,
      },
    ];
  });
}

export function validateCardDayInput(value: string, required: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return required ? "Informe um dia entre 1 e 31." : null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return "Informe um dia entre 1 e 31.";
  }
  return null;
}

export function validateCardCompletionDrafts(
  fields: CardCompletionField[],
  drafts: Record<string, CardCompletionDraft>,
): Record<string, { closingDay?: string; dueDay?: string }> {
  const errors: Record<string, { closingDay?: string; dueDay?: string }> = {};
  for (const field of fields) {
    const draft = drafts[field.importId] ?? { closingDay: "", dueDay: "" };
    const fieldErrors: { closingDay?: string; dueDay?: string } = {};
    if (field.needsClosingDay) {
      const closingError = validateCardDayInput(draft.closingDay, true);
      if (closingError) {
        fieldErrors.closingDay = closingError;
      }
    }
    if (field.needsDueDay) {
      const dueError = validateCardDayInput(draft.dueDay, true);
      if (dueError) {
        fieldErrors.dueDay = dueError;
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      errors[field.importId] = fieldErrors;
    }
  }
  return errors;
}

export function canConfirmImportWithCompletions(
  fields: CardCompletionField[],
  drafts: Record<string, CardCompletionDraft>,
): boolean {
  return Object.keys(validateCardCompletionDrafts(fields, drafts)).length === 0;
}

export function applyCardCompletionsToPayload(
  payload: ImportPayload,
  fields: CardCompletionField[],
  drafts: Record<string, CardCompletionDraft>,
): ImportPayload {
  const fieldById = new Map(fields.map((field) => [field.importId, field]));
  return {
    ...payload,
    cards: payload.cards.map((card) => {
      const field = fieldById.get(card.id);
      if (!field) {
        return card;
      }
      const draft = drafts[card.id] ?? { closingDay: "", dueDay: "" };
      return {
        ...card,
        ...(field.needsClosingDay
          ? { closingDay: Number.parseInt(draft.closingDay, 10) }
          : {}),
        ...(field.needsDueDay ? { dueDay: Number.parseInt(draft.dueDay, 10) } : {}),
      };
    }),
  };
}

export function mergeImportCardDays(
  importCard: ImportCard,
  existing?: Card,
): Pick<ImportCard, "closingDay" | "dueDay"> {
  const merged: Pick<ImportCard, "closingDay" | "dueDay"> = {};
  const closingDay =
    importCard.closingDay ?? (existing?.closingDay !== null ? existing?.closingDay : undefined);
  const dueDay = importCard.dueDay ?? (existing?.dueDay !== null ? existing?.dueDay : undefined);
  if (closingDay !== undefined && closingDay !== null) {
    merged.closingDay = closingDay;
  }
  if (dueDay !== undefined && dueDay !== null) {
    merged.dueDay = dueDay;
  }
  return merged;
}

export function renderCardCompletionSection(
  fields: CardCompletionField[],
  drafts: Record<string, CardCompletionDraft>,
  errors: Record<string, { closingDay?: string; dueDay?: string }>,
): string {
  if (fields.length === 0) {
    return "";
  }

  const rows = fields
    .map((field) => {
      const draft = drafts[field.importId] ?? { closingDay: "", dueDay: "" };
      const fieldErrors = errors[field.importId] ?? {};
      const closingField = field.needsClosingDay
        ? `
        <label class="field import-card-field">
          <span class="field__label">Dia de fechamento</span>
          <input
            class="field__control${fieldErrors.closingDay ? " field__control--invalid" : ""}"
            type="number"
            min="1"
            max="31"
            step="1"
            inputmode="numeric"
            data-card-completion="${field.importId}"
            data-card-completion-field="closingDay"
            value="${escapeAttr(draft.closingDay)}"
          />
          ${fieldErrors.closingDay ? `<span class="field__error">${escapeAttr(fieldErrors.closingDay)}</span>` : ""}
        </label>`
        : "";
      const dueField = field.needsDueDay
        ? `
        <label class="field import-card-field">
          <span class="field__label">Dia de vencimento</span>
          <input
            class="field__control${fieldErrors.dueDay ? " field__control--invalid" : ""}"
            type="number"
            min="1"
            max="31"
            step="1"
            inputmode="numeric"
            data-card-completion="${field.importId}"
            data-card-completion-field="dueDay"
            value="${escapeAttr(draft.dueDay)}"
          />
          ${fieldErrors.dueDay ? `<span class="field__error">${escapeAttr(fieldErrors.dueDay)}</span>` : ""}
        </label>`
        : "";

      return `
        <article class="import-card-completion__item">
          <h3 class="import-card-completion__name">${escapeAttr(field.name)}</h3>
          <div class="import-card-completion__fields">${closingField}${dueField}</div>
        </article>`;
    })
    .join("");

  return `
    <section class="import-card-completion" aria-labelledby="import-card-completion-title">
      <h2 class="import-card-completion__title" id="import-card-completion-title">Complete os dados dos cartões</h2>
      <div class="import-card-completion__list">${rows}</div>
    </section>`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fieldErrorElement(label: ParentNode): HTMLElement | null {
  return label.querySelector(".field__error");
}

function setFieldError(label: ParentNode, message: string | null): void {
  const input = label.querySelector<HTMLInputElement>("[data-card-completion-field]");
  if (!input) {
    return;
  }
  input.setAttribute("aria-invalid", message ? "true" : "false");
  input.classList.toggle("field__control--invalid", Boolean(message));
  const existing = fieldErrorElement(label);
  if (message) {
    if (existing) {
      existing.textContent = message;
    } else {
      const error = document.createElement("span");
      error.className = "field__error";
      error.textContent = message;
      label.appendChild(error);
    }
  } else if (existing) {
    existing.remove();
  }
}

/** Atualiza validação visual sem recriar inputs (preserva foco e cursor). */
export function syncCardCompletionValidation(
  root: ParentNode,
  fields: CardCompletionField[],
  drafts: Record<string, CardCompletionDraft>,
  planCanImport: boolean,
): boolean {
  const errors = validateCardCompletionDrafts(fields, drafts);
  const canImport = planCanImport && canConfirmImportWithCompletions(fields, drafts);

  for (const field of fields) {
    const fieldErrors = errors[field.importId] ?? {};
    if (field.needsClosingDay) {
      const label = root.querySelector(
        `[data-card-completion="${field.importId}"][data-card-completion-field="closingDay"]`,
      )?.closest("label");
      if (label) {
        setFieldError(label, fieldErrors.closingDay ?? null);
      }
    }
    if (field.needsDueDay) {
      const label = root.querySelector(
        `[data-card-completion="${field.importId}"][data-card-completion-field="dueDay"]`,
      )?.closest("label");
      if (label) {
        setFieldError(label, fieldErrors.dueDay ?? null);
      }
    }
  }

  const confirmButton = root.querySelector<HTMLButtonElement>("#import-confirm");
  if (confirmButton) {
    confirmButton.disabled = !canImport;
  }

  return canImport;
}
