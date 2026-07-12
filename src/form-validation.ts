import { el } from "./ui";

export interface FieldTouchState {
  touched: Record<string, boolean>;
  submitted: boolean;
}

export function createFieldTouchState(): FieldTouchState {
  return { touched: {}, submitted: false };
}

export function shouldShowFieldError(
  error: string | null,
  fieldName: string,
  state: FieldTouchState,
): boolean {
  if (error === null) {
    return false;
  }
  return state.touched[fieldName] === true || state.submitted;
}

export function isFormValid(errors: Record<string, string | null>): boolean {
  return Object.values(errors).every((error) => error === null);
}

export interface ValidatedFieldOptions {
  name: string;
  label: string;
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  required?: boolean;
  getError: () => string | null;
}

export interface ValidatedField {
  name: string;
  group: HTMLElement;
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  errorElement: HTMLElement;
  getError: () => string | null;
  required: boolean;
}

export function createValidatedField(
  options: ValidatedFieldOptions,
): ValidatedField {
  const fieldId = options.name;
  const errorId = `${fieldId}-error`;
  const group = el("div", "field");
  const label = el("label", "field__label");
  label.htmlFor = fieldId;
  label.textContent = options.label;
  if (options.required) {
    label.insertAdjacentHTML(
      "beforeend",
      ' <span class="field__required" aria-hidden="true">*</span>',
    );
  }

  options.control.id = fieldId;
  options.control.classList.add("field__control");
  if (options.required) {
    options.control.setAttribute("aria-required", "true");
    options.control.required = true;
  }

  const errorElement = el("p", "field-error");
  errorElement.id = errorId;
  errorElement.hidden = true;

  group.appendChild(label);
  group.appendChild(options.control);
  group.appendChild(errorElement);

  return {
    name: options.name,
    group,
    control: options.control,
    errorElement,
    getError: options.getError,
    required: options.required === true,
  };
}

export function renderFieldErrorState(
  field: ValidatedField,
  state: FieldTouchState,
): void {
  const error = field.getError();
  const visible = shouldShowFieldError(error, field.name, state);

  if (visible && error) {
    field.errorElement.textContent = error;
    field.errorElement.hidden = false;
    field.control.setAttribute("aria-invalid", "true");
    field.control.setAttribute("aria-describedby", field.errorElement.id);
    return;
  }

  field.errorElement.textContent = "";
  field.errorElement.hidden = true;
  field.control.removeAttribute("aria-invalid");
  field.control.removeAttribute("aria-describedby");
}

export function collectFieldErrors(
  fields: ValidatedField[],
): Record<string, string | null> {
  const errors: Record<string, string | null> = {};
  for (const field of fields) {
    errors[field.name] = field.getError();
  }
  return errors;
}

export interface ProgressiveFormOptions {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
  fields: ValidatedField[];
  onSubmit: () => void;
}

export interface ProgressiveFormHandle {
  state: FieldTouchState;
  updateSubmitState: () => void;
  markSubmitted: () => void;
  renderErrors: () => void;
  bind: () => void;
  destroy: () => void;
}

export function createProgressiveForm(
  options: ProgressiveFormOptions,
): ProgressiveFormHandle {
  const state = createFieldTouchState();
  const controllers = new AbortController();
  const { signal } = controllers;

  const updateSubmitState = (): void => {
    const errors = collectFieldErrors(options.fields);
    options.submitButton.disabled = !isFormValid(errors);
  };

  const renderErrors = (): void => {
    for (const field of options.fields) {
      renderFieldErrorState(field, state);
    }
  };

  const markSubmitted = (): void => {
    state.submitted = true;
    for (const field of options.fields) {
      state.touched[field.name] = true;
    }
    renderErrors();
    updateSubmitState();
  };

  const bind = (): void => {
    for (const field of options.fields) {
      field.control.addEventListener(
        "blur",
        () => {
          state.touched[field.name] = true;
          renderFieldErrorState(field, state);
          updateSubmitState();
        },
        { signal },
      );

      const handleValueChange = (): void => {
        if (state.touched[field.name] || state.submitted) {
          renderFieldErrorState(field, state);
        }
        updateSubmitState();
      };

      field.control.addEventListener("input", handleValueChange, { signal });
      field.control.addEventListener("change", handleValueChange, { signal });
    }

    options.form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        markSubmitted();
        const errors = collectFieldErrors(options.fields);
        if (!isFormValid(errors)) {
          const firstInvalid = options.fields.find(
            (field) => field.getError() !== null,
          );
          firstInvalid?.control.focus();
          return;
        }
        options.onSubmit();
      },
      { signal },
    );

    updateSubmitState();
  };

  const destroy = (): void => {
    controllers.abort();
  };

  return {
    state,
    updateSubmitState,
    markSubmitted,
    renderErrors,
    bind,
    destroy,
  };
}

export const PAGE_DESCRIPTIONS = {
  "/dashboard": "Visão consolidada da competência selecionada.",
  "/lancamentos": "Receitas e despesas da competência selecionada.",
  "/faturas": "Controle mensal por cartão de crédito.",
  "/planejamento": "Regras recorrentes mensais e conciliação com lançamentos.",
  "/importar": "Importação local de extratos e faturas em JSON.",
  "/ajustes": "Cartões e preferências locais.",
} as const;

export function pageUsesCanonicalHeading(pageTitle: string): boolean {
  return pageTitle.trim().length > 0;
}

export function pageHasDuplicateHeading(
  pageTitle: string,
  innerHeading: string,
): boolean {
  return pageTitle.trim().toLowerCase() === innerHeading.trim().toLowerCase();
}
