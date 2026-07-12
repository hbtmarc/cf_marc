import {
  createProgressiveForm,
  createValidatedField,
  type ProgressiveFormHandle,
} from "./form-validation";
import type { AppMutations } from "./forms";
import { formatCentsToBRL, formatCompetenceLabel, parseMoneyToCents } from "./finance";
import { ruleEditModalTitle } from "./recurrence-class";
import { updateRecurringRuleAmountFromMonth } from "./recurrence-versioning";
import {
  createRecurringRule,
  updateRecurringRule,
  validateRecurringRuleDraft,
  type RecurringRuleDraft,
} from "./recurring-operations";
import type { AppData, RecurringRule } from "./types";
import { announce, centsToInputValue, closeModal, el, openModal } from "./ui";

let activeFormController: ProgressiveFormHandle | null = null;

function cleanupFormController(): void {
  activeFormController?.destroy();
  activeFormController = null;
}

function buildRuleDraftFromControls(form: HTMLElement): RecurringRuleDraft {
  const kind = form.querySelector<HTMLInputElement>('input[name="rule-kind"]:checked')?.value ?? "expense";
  return {
    kind: kind === "income" ? "income" : "expense",
    description: form.querySelector<HTMLInputElement>("#rule-description")?.value ?? "",
    amountInput: form.querySelector<HTMLInputElement>("#rule-amount")?.value ?? "",
    category: form.querySelector<HTMLInputElement>("#rule-category")?.value ?? "",
    dayOfMonth: form.querySelector<HTMLInputElement>("#rule-day")?.value ?? "",
    startMonth: form.querySelector<HTMLInputElement>("#rule-start-month")?.value ?? "",
    endMonth: form.querySelector<HTMLInputElement>("#rule-end-month")?.value ?? "",
    billingMode:
      form.querySelector<HTMLInputElement>('input[name="rule-billing"]:checked')?.value === "card"
        ? "card"
        : "direct",
    cardId: form.querySelector<HTMLSelectElement>("#rule-card")?.value ?? "",
  };
}

function syncBillingVisibility(form: HTMLElement): void {
  const kind = form.querySelector<HTMLInputElement>('input[name="rule-kind"]:checked')?.value;
  const billing = form.querySelector<HTMLInputElement>('input[name="rule-billing"]:checked')?.value;
  const billingGroup = form.querySelector<HTMLElement>('[data-field-group="billing"]');
  const cardGroup = form.querySelector<HTMLElement>('[data-field-group="card"]');
  if (billingGroup) {
    billingGroup.hidden = kind === "income";
  }
  if (cardGroup) {
    cardGroup.hidden = kind === "income" || billing !== "card";
  }
}

function openRuleFormModal(options: {
  data: AppData;
  month: string;
  mutations: AppMutations;
  onSaved: () => void;
  rule?: RecurringRule;
}): void {
  cleanupFormController();

  const isEdit = options.rule !== undefined;
  const rule = options.rule;
  const form = el("form", "form planejamento-form");
  form.noValidate = true;
  form.id = "planejamento-rule-form";

  const kindIncome = el("input") as HTMLInputElement;
  kindIncome.type = "radio";
  kindIncome.name = "rule-kind";
  kindIncome.value = "income";
  kindIncome.id = "rule-kind-income";
  kindIncome.checked = rule?.kind === "income";

  const kindExpense = el("input") as HTMLInputElement;
  kindExpense.type = "radio";
  kindExpense.name = "rule-kind";
  kindExpense.value = "expense";
  kindExpense.id = "rule-kind-expense";
  kindExpense.checked = rule?.kind !== "income";

  const description = el("input") as HTMLInputElement;
  description.type = "text";
  description.id = "rule-description";
  description.value = rule?.description ?? "";
  description.autocomplete = "off";

  const amount = el("input") as HTMLInputElement;
  amount.type = "text";
  amount.id = "rule-amount";
  amount.inputMode = "decimal";
  amount.placeholder = "0,00";
  amount.value = rule ? centsToInputValue(rule.amountCents) : "";
  amount.classList.add("field__control--money");

  const category = el("input") as HTMLInputElement;
  category.type = "text";
  category.id = "rule-category";
  category.value = rule?.category ?? "";

  const day = el("input") as HTMLInputElement;
  day.type = "number";
  day.id = "rule-day";
  day.min = "1";
  day.max = "31";
  day.value = rule ? String(rule.dayOfMonth) : "1";

  const startMonth = el("input") as HTMLInputElement;
  startMonth.type = "month";
  startMonth.id = "rule-start-month";
  startMonth.value = rule?.startMonth ?? options.month;

  const endMonth = el("input") as HTMLInputElement;
  endMonth.type = "month";
  endMonth.id = "rule-end-month";
  endMonth.value = rule?.endMonth ?? "";

  const billingDirect = el("input") as HTMLInputElement;
  billingDirect.type = "radio";
  billingDirect.name = "rule-billing";
  billingDirect.value = "direct";
  billingDirect.id = "rule-billing-direct";
  billingDirect.checked = rule?.billingMode !== "card";

  const billingCard = el("input") as HTMLInputElement;
  billingCard.type = "radio";
  billingCard.name = "rule-billing";
  billingCard.value = "card";
  billingCard.id = "rule-billing-card";
  billingCard.checked = rule?.billingMode === "card";

  const card = el("select") as HTMLSelectElement;
  card.id = "rule-card";
  const emptyOption = el("option") as HTMLOptionElement;
  emptyOption.value = "";
  emptyOption.textContent = "Selecione um cartão";
  card.appendChild(emptyOption);
  for (const cardItem of options.data.cards) {
    const option = el("option") as HTMLOptionElement;
    option.value = cardItem.id;
    option.textContent = cardItem.name;
    if (rule?.cardId === cardItem.id) {
      option.selected = true;
    }
    card.appendChild(option);
  }

  const getDraft = (): RecurringRuleDraft => buildRuleDraftFromControls(form);
  const cardIds = options.data.cards.map((item) => item.id);

  const fields = [
    createValidatedField({
      name: "rule-description",
      label: "Descrição",
      control: description,
      required: true,
      getError: () => validateRecurringRuleDraft(getDraft(), cardIds, rule).description ?? null,
    }),
    createValidatedField({
      name: "rule-amount",
      label: "Valor",
      control: amount,
      required: true,
      getError: () => {
        const errors = validateRecurringRuleDraft(getDraft(), cardIds, rule);
        return errors.amount ?? errors.amountCents ?? null;
      },
    }),
    createValidatedField({
      name: "rule-category",
      label: "Categoria",
      control: category,
      required: true,
      getError: () => validateRecurringRuleDraft(getDraft(), cardIds, rule).category ?? null,
    }),
    createValidatedField({
      name: "rule-day",
      label: "Dia esperado",
      control: day,
      required: true,
      getError: () => validateRecurringRuleDraft(getDraft(), cardIds, rule).dayOfMonth ?? null,
    }),
    createValidatedField({
      name: "rule-start-month",
      label: "Competência inicial",
      control: startMonth,
      required: true,
      getError: () => validateRecurringRuleDraft(getDraft(), cardIds, rule).startMonth ?? null,
    }),
    createValidatedField({
      name: "rule-end-month",
      label: "Competência final",
      control: endMonth,
      getError: () => validateRecurringRuleDraft(getDraft(), cardIds, rule).endMonth ?? null,
    }),
    createValidatedField({
      name: "rule-card",
      label: "Cartão",
      control: card,
      getError: () => validateRecurringRuleDraft(getDraft(), cardIds, rule).cardId ?? null,
    }),
  ];

  const kindGroup = el("fieldset", "field field--inline-options");
  kindGroup.setAttribute("data-field-group", "kind");
  const kindLegend = el("legend", "field__label", "Tipo");
  const kindIncomeLabel = el("label", "choice-chip");
  kindIncomeLabel.htmlFor = "rule-kind-income";
  kindIncomeLabel.append(kindIncome, document.createTextNode(" Receita"));
  const kindExpenseLabel = el("label", "choice-chip");
  kindExpenseLabel.htmlFor = "rule-kind-expense";
  kindExpenseLabel.append(kindExpense, document.createTextNode(" Despesa"));
  kindGroup.append(kindLegend, kindIncomeLabel, kindExpenseLabel);

  const billingGroup = el("fieldset", "field field--inline-options");
  billingGroup.setAttribute("data-field-group", "billing");
  const billingLegend = el("legend", "field__label", "Forma de cobrança");
  const billingDirectLabel = el("label", "choice-chip");
  billingDirectLabel.htmlFor = "rule-billing-direct";
  billingDirectLabel.append(billingDirect, document.createTextNode(" Direta"));
  const billingCardLabel = el("label", "choice-chip");
  billingCardLabel.htmlFor = "rule-billing-card";
  billingCardLabel.append(billingCard, document.createTextNode(" Cartão"));
  billingGroup.append(billingLegend, billingDirectLabel, billingCardLabel);

  const actions = el("div", "form-actions");
  const cancelButton = el("button", "btn btn--secondary", "Cancelar");
  cancelButton.type = "button";
  const submitButton = el("button", "btn btn--primary", isEdit ? "Salvar" : "Criar regra");
  submitButton.type = "submit";
  actions.append(cancelButton, submitButton);

  form.append(
    kindGroup,
    fields[0]!.group,
    fields[1]!.group,
    fields[2]!.group,
    fields[3]!.group,
    fields[4]!.group,
    fields[5]!.group,
    billingGroup,
    fields[6]!.group,
    actions,
  );

  syncBillingVisibility(form);

  cancelButton.addEventListener("click", () => {
    closeModal();
  });

  activeFormController = createProgressiveForm({
    form,
    submitButton,
    fields,
    onSubmit: () => {
      const draft = getDraft();
      let saved = false;
      options.mutations.update((appData) => {
        const errors =
          isEdit && rule
            ? updateRecurringRule(appData, rule.id, draft)
            : createRecurringRule(appData, draft);
        if (Object.keys(errors).length > 0) {
          announce("Corrija os campos do formulário antes de salvar.");
          return;
        }
        saved = true;
        announce(isEdit ? "Previsão atualizada." : "Previsão criada.");
      });
      if (saved) {
        closeModal();
        options.onSaved();
      }
    },
  });

  for (const control of [kindIncome, kindExpense, billingDirect, billingCard]) {
    control.addEventListener("change", () => {
      syncBillingVisibility(form);
      activeFormController?.updateSubmitState();
      activeFormController?.renderErrors();
    });
  }

  const title = isEdit && rule ? ruleEditModalTitle(rule) : "Nova regra";

  openModal({
    title,
    content: form,
    panelClass: "modal-panel--form",
    initialFocus: description,
    onClose: () => {
      cleanupFormController();
    },
  });
  activeFormController.bind();
}

export function openCreateRuleModal(options: {
  data: AppData;
  month: string;
  mutations: AppMutations;
  onSaved: () => void;
}): void {
  openRuleFormModal(options);
}

export function openEditRuleModal(options: {
  data: AppData;
  month: string;
  mutations: AppMutations;
  onSaved: () => void;
  rule: RecurringRule;
}): void {
  openRuleFormModal(options);
}

export function openUpdateRuleValueModal(options: {
  data: AppData;
  month: string;
  mutations: AppMutations;
  onSaved: () => void;
  rule: RecurringRule;
}): void {
  cleanupFormController();

  const content = el("div", "update-value-modal");
  const intro = el(
    "p",
    "update-value-modal__intro",
    "O valor anterior será preservado até a competência anterior.",
  );

  const currentGroup = el("div", "field");
  const currentLabel = el("label", "field__label", "Valor atual");
  currentLabel.htmlFor = "rule-current-amount";
  const currentValue = el(
    "p",
    "update-value-modal__current",
    formatCentsToBRL(options.rule.amountCents),
  );
  currentValue.id = "rule-current-amount";
  currentGroup.append(currentLabel, currentValue);

  const amountInput = el("input", "field__control") as HTMLInputElement;
  amountInput.type = "text";
  amountInput.id = "rule-new-amount";
  amountInput.inputMode = "decimal";
  amountInput.placeholder = "0,00";
  amountInput.value = centsToInputValue(options.rule.amountCents);
  amountInput.classList.add("field__control--money");
  amountInput.autocomplete = "off";

  const monthInput = el("input", "field__control") as HTMLInputElement;
  monthInput.type = "month";
  monthInput.id = "rule-effective-month";
  monthInput.value = options.month;

  const amountError = el("p", "field__error");
  amountError.hidden = true;
  const monthError = el("p", "field__error");
  monthError.hidden = true;

  const amountGroup = el("div", "field");
  const amountLabel = el("label", "field__label", "Novo valor");
  amountLabel.htmlFor = "rule-new-amount";
  amountGroup.append(amountLabel, amountInput, amountError);

  const monthGroup = el("div", "field");
  const monthLabel = el("label", "field__label", "Competência de início da alteração");
  monthLabel.htmlFor = "rule-effective-month";
  monthGroup.append(monthLabel, monthInput, monthError);

  const actions = el("div", "form-actions");
  const cancelButton = el("button", "btn btn--secondary", "Cancelar");
  cancelButton.type = "button";
  const saveButton = el("button", "btn btn--primary", "Atualizar valor");
  saveButton.type = "button";
  actions.append(cancelButton, saveButton);

  content.append(intro, currentGroup, amountGroup, monthGroup, actions);

  const showFieldError = (group: HTMLElement, errorNode: HTMLElement, message: string): void => {
    errorNode.textContent = message;
    errorNode.hidden = false;
    group.classList.add("field--invalid");
  };

  const clearErrors = (): void => {
    for (const group of [amountGroup, monthGroup]) {
      group.classList.remove("field--invalid");
    }
    amountError.hidden = true;
    monthError.hidden = true;
  };

  cancelButton.addEventListener("click", () => {
    closeModal();
  });

  saveButton.addEventListener("click", () => {
    clearErrors();
    const cents = parseMoneyToCents(amountInput.value);
    if (cents === null || cents <= 0) {
      showFieldError(amountGroup, amountError, "Informe um valor válido maior que zero.");
      amountInput.focus();
      return;
    }
    const effectiveMonth = monthInput.value.trim();
    if (!effectiveMonth) {
      showFieldError(monthGroup, monthError, "Informe a competência de início.");
      monthInput.focus();
      return;
    }

    let saved = false;
    options.mutations.update((appData) => {
      const errors = updateRecurringRuleAmountFromMonth(
        appData,
        options.rule.id,
        effectiveMonth,
        cents,
      );
      if (Object.keys(errors).length > 0) {
        const message = errors.amountCents ?? errors.effectiveMonth ?? errors.rule ?? "Não foi possível atualizar o valor.";
        if (errors.effectiveMonth || errors.rule) {
          showFieldError(monthGroup, monthError, message);
          monthInput.focus();
        } else {
          showFieldError(amountGroup, amountError, message);
          amountInput.focus();
        }
        return;
      }
      saved = true;
      announce(`Valor atualizado a partir de ${formatCompetenceLabel(effectiveMonth)}.`);
    });

    if (saved) {
      closeModal();
      options.onSaved();
    }
  });

  openModal({
    title: "Atualizar valor",
    content,
    panelClass: "modal-panel--form",
    initialFocus: amountInput,
    onClose: () => {
      cleanupFormController();
    },
  });
}

export function resetPlanejamentoModalsForTests(): void {
  cleanupFormController();
}
