import {
  createId,
  nowIso,
  validateCardForm,
  validateInvoiceForm,
  validateTransactionForm,
} from "./finance";
import type { AppData, Card, Invoice, Transaction, TransactionKind } from "./types";
import {
  announce,
  bindFormValidation,
  centsToInputValue,
  closeModal,
  el,
  openModal,
  renderFieldError,
} from "./ui";

export interface AppMutations {
  update: (mutator: (data: AppData) => void) => void;
}

function fieldGroup(
  label: string,
  control: HTMLElement,
  fieldId: string,
  errorHtml = "",
): HTMLElement {
  const group = el("div", "field");
  const labelEl = el("label", "field__label");
  labelEl.htmlFor = fieldId;
  labelEl.textContent = label;
  control.id = fieldId;
  control.classList.add("field__control");
  group.appendChild(labelEl);
  group.appendChild(control);
  if (errorHtml) {
    const wrapper = el("div");
    wrapper.innerHTML = errorHtml;
    const errorNode = wrapper.firstElementChild;
    if (errorNode) {
      group.appendChild(errorNode);
    }
  }
  return group;
}

export function openTransactionForm(options: {
  mutations: AppMutations;
  competenceMonth: string;
  kind: TransactionKind;
  transaction?: Transaction;
  onSaved: () => void;
}): void {
  const isEdit = options.transaction !== undefined;
  const transaction = options.transaction;
  const title =
    options.kind === "income"
      ? isEdit
        ? "Editar receita"
        : "Nova receita"
      : isEdit
        ? "Editar despesa"
        : "Nova despesa";

  const form = el("form", "form");
  form.noValidate = true;

  const description = el("input") as HTMLInputElement;
  description.type = "text";
  description.required = true;
  description.value = transaction?.description ?? "";
  description.autocomplete = "off";

  const amount = el("input") as HTMLInputElement;
  amount.type = "text";
  amount.inputMode = "decimal";
  amount.placeholder = "0,00";
  amount.value = transaction ? centsToInputValue(transaction.amountCents) : "";

  const date = el("input") as HTMLInputElement;
  date.type = "date";
  date.value = transaction?.date ?? new Date().toISOString().slice(0, 10);

  const category = el("input") as HTMLInputElement;
  category.type = "text";
  category.value = transaction?.category ?? "";

  const status = el("select") as HTMLSelectElement;
  const pending = el("option") as HTMLOptionElement;
  pending.value = "pending";
  pending.textContent =
    options.kind === "income" ? "Pendente" : "Pendente";
  const settled = el("option") as HTMLOptionElement;
  settled.value = "settled";
  settled.textContent =
    options.kind === "income" ? "Recebido" : "Pago";
  status.appendChild(pending);
  status.appendChild(settled);
  status.value = transaction?.status ?? "pending";

  const errorsHost = el("div", "form-errors");

  form.appendChild(
    fieldGroup("Descrição", description, "tx-description"),
  );
  form.appendChild(fieldGroup("Valor", amount, "tx-amount"));
  form.appendChild(fieldGroup("Data", date, "tx-date"));
  form.appendChild(
    fieldGroup(
      "Categoria",
      category,
      "tx-category",
    ),
  );
  form.appendChild(fieldGroup("Status", status, "tx-status"));
  form.appendChild(errorsHost);

  const actions = el("div", "form-actions");
  const cancel = el("button", "btn btn--secondary", "Cancelar");
  cancel.type = "button";
  const submit = el(
    "button",
    "btn btn--primary",
    isEdit ? "Salvar" : "Adicionar",
  );
  submit.type = "submit";
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(actions);

  const validate = (): boolean => {
    const result = validateTransactionForm({
      description: description.value,
      amountInput: amount.value,
      date: date.value,
      competenceMonth: options.competenceMonth,
      category: category.value,
    });

    errorsHost.innerHTML = "";
    for (const [field, message] of Object.entries(result.errors)) {
      errorsHost.insertAdjacentHTML(
        "beforeend",
        renderFieldError(field, message),
      );
    }

    return Object.keys(result.errors).length === 0 && result.amountCents !== null;
  };

  bindFormValidation(form, submit, validate);

  cancel.addEventListener("click", () => {
    closeModal();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const result = validateTransactionForm({
      description: description.value,
      amountInput: amount.value,
      date: date.value,
      competenceMonth: options.competenceMonth,
      category: category.value,
    });

    if (result.amountCents === null) {
      return;
    }

    const amountCents = result.amountCents;
    const timestamp = nowIso();

    options.mutations.update((data) => {
      if (isEdit && transaction) {
        const index = data.transactions.findIndex(
          (item) => item.id === transaction.id,
        );
        if (index >= 0) {
          data.transactions[index] = {
            ...transaction,
            description: description.value.trim(),
            amountCents,
            date: date.value,
            competenceMonth: options.competenceMonth,
            category: category.value.trim(),
            status: status.value as Transaction["status"],
            updatedAt: timestamp,
          };
        }
        return;
      }

      data.transactions.push({
        id: createId(),
        kind: options.kind,
        description: description.value.trim(),
        amountCents,
        date: date.value,
        competenceMonth: options.competenceMonth,
        category: category.value.trim(),
        status: status.value as Transaction["status"],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    announce(isEdit ? "Lançamento atualizado." : "Lançamento adicionado.");
    closeModal();
    options.onSaved();
  });

  openModal({ title, content: form, panelClass: "modal-panel--form" });
}

export function openCardForm(options: {
  mutations: AppMutations;
  card?: Card;
  onSaved: () => void;
}): void {
  const isEdit = options.card !== undefined;
  const card = options.card;
  const form = el("form", "form");
  form.noValidate = true;

  const name = el("input") as HTMLInputElement;
  name.type = "text";
  name.value = card?.name ?? "";

  const closingDay = el("input") as HTMLInputElement;
  closingDay.type = "number";
  closingDay.min = "1";
  closingDay.max = "31";
  closingDay.placeholder = "Opcional";
  if (card?.closingDay !== null && card?.closingDay !== undefined) {
    closingDay.value = String(card.closingDay);
  }

  const dueDay = el("input") as HTMLInputElement;
  dueDay.type = "number";
  dueDay.min = "1";
  dueDay.max = "31";
  dueDay.placeholder = "Opcional";
  if (card?.dueDay !== null && card?.dueDay !== undefined) {
    dueDay.value = String(card.dueDay);
  }

  const errorsHost = el("div", "form-errors");

  form.appendChild(fieldGroup("Nome", name, "card-name"));
  form.appendChild(
    fieldGroup("Dia de fechamento", closingDay, "card-closing"),
  );
  form.appendChild(fieldGroup("Dia de vencimento", dueDay, "card-due"));
  form.appendChild(errorsHost);

  const actions = el("div", "form-actions");
  const cancel = el("button", "btn btn--secondary", "Cancelar");
  cancel.type = "button";
  const submit = el(
    "button",
    "btn btn--primary",
    isEdit ? "Salvar" : "Adicionar",
  );
  submit.type = "submit";
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(actions);

  const validate = (): boolean => {
    const result = validateCardForm({
      name: name.value,
      closingDay: closingDay.value,
      dueDay: dueDay.value,
    });
    errorsHost.innerHTML = "";
    for (const [field, message] of Object.entries(result.errors)) {
      errorsHost.insertAdjacentHTML(
        "beforeend",
        renderFieldError(field, message),
      );
    }
    return Object.keys(result.errors).length === 0;
  };

  bindFormValidation(form, submit, validate);

  cancel.addEventListener("click", () => {
    closeModal();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const result = validateCardForm({
      name: name.value,
      closingDay: closingDay.value,
      dueDay: dueDay.value,
    });

    const timestamp = nowIso();

    options.mutations.update((data) => {
      if (isEdit && card) {
        const index = data.cards.findIndex((item) => item.id === card.id);
        if (index >= 0) {
          data.cards[index] = {
            ...card,
            name: name.value.trim(),
            closingDay: result.closingDay,
            dueDay: result.dueDay,
            updatedAt: timestamp,
          };
        }
        return;
      }

      data.cards.push({
        id: createId(),
        name: name.value.trim(),
        closingDay: result.closingDay,
        dueDay: result.dueDay,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    announce(isEdit ? "Cartão atualizado." : "Cartão adicionado.");
    closeModal();
    options.onSaved();
  });

  openModal({
    title: isEdit ? "Editar cartão" : "Novo cartão",
    content: form,
    panelClass: "modal-panel--form",
  });
}

export function openInvoiceForm(options: {
  mutations: AppMutations;
  data: AppData;
  competenceMonth: string;
  invoice?: Invoice;
  onSaved: () => void;
}): void {
  const isEdit = options.invoice !== undefined;
  const invoice = options.invoice;
  const form = el("form", "form");
  form.noValidate = true;

  const cardId = el("select") as HTMLSelectElement;
  const placeholder = el("option") as HTMLOptionElement;
  placeholder.value = "";
  placeholder.textContent = "Selecione um cartão";
  cardId.appendChild(placeholder);

  for (const card of options.data.cards) {
    const option = el("option") as HTMLOptionElement;
    option.value = card.id;
    option.textContent = card.name;
    cardId.appendChild(option);
  }
  cardId.value = invoice?.cardId ?? "";

  const amount = el("input") as HTMLInputElement;
  amount.type = "text";
  amount.inputMode = "decimal";
  amount.placeholder = "0,00";
  amount.value = invoice ? centsToInputValue(invoice.amountCents) : "";

  const dueDate = el("input") as HTMLInputElement;
  dueDate.type = "date";
  dueDate.value = invoice?.dueDate ?? "";

  const status = el("select") as HTMLSelectElement;
  const openOption = el("option") as HTMLOptionElement;
  openOption.value = "open";
  openOption.textContent = "Aberta";
  const paidOption = el("option") as HTMLOptionElement;
  paidOption.value = "paid";
  paidOption.textContent = "Paga";
  status.appendChild(openOption);
  status.appendChild(paidOption);
  status.value = invoice?.status ?? "open";

  const errorsHost = el("div", "form-errors");

  if (options.data.cards.length === 0) {
    const notice = el(
      "p",
      "form-notice",
      "Cadastre um cartão em Ajustes antes de criar faturas.",
    );
    form.appendChild(notice);
  }

  form.appendChild(fieldGroup("Cartão", cardId, "invoice-card"));
  form.appendChild(fieldGroup("Valor", amount, "invoice-amount"));
  form.appendChild(fieldGroup("Vencimento", dueDate, "invoice-due"));
  form.appendChild(fieldGroup("Status", status, "invoice-status"));
  form.appendChild(errorsHost);

  const actions = el("div", "form-actions");
  const cancel = el("button", "btn btn--secondary", "Cancelar");
  cancel.type = "button";
  const submit = el(
    "button",
    "btn btn--primary",
    isEdit ? "Salvar" : "Adicionar",
  );
  submit.type = "submit";
  submit.disabled = options.data.cards.length === 0;
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(actions);

  const validate = (): boolean => {
    const result = validateInvoiceForm({
      cardId: cardId.value,
      competenceMonth: options.competenceMonth,
      amountInput: amount.value,
      dueDate: dueDate.value,
    });
    errorsHost.innerHTML = "";
    for (const [field, message] of Object.entries(result.errors)) {
      errorsHost.insertAdjacentHTML(
        "beforeend",
        renderFieldError(field, message),
      );
    }
    return (
      Object.keys(result.errors).length === 0 &&
      result.amountCents !== null &&
      options.data.cards.length > 0
    );
  };

  bindFormValidation(form, submit, validate);

  cancel.addEventListener("click", () => {
    closeModal();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const result = validateInvoiceForm({
      cardId: cardId.value,
      competenceMonth: options.competenceMonth,
      amountInput: amount.value,
      dueDate: dueDate.value,
    });

    if (result.amountCents === null) {
      return;
    }

    const amountCents = result.amountCents;
    const timestamp = nowIso();

    options.mutations.update((data) => {
      if (isEdit && invoice) {
        const index = data.invoices.findIndex(
          (item) => item.id === invoice.id,
        );
        if (index >= 0) {
          data.invoices[index] = {
            ...invoice,
            cardId: cardId.value,
            competenceMonth: options.competenceMonth,
            amountCents,
            dueDate: dueDate.value,
            status: status.value as Invoice["status"],
            updatedAt: timestamp,
          };
        }
        return;
      }

      data.invoices.push({
        id: createId(),
        cardId: cardId.value,
        competenceMonth: options.competenceMonth,
        amountCents,
        dueDate: dueDate.value,
        status: status.value as Invoice["status"],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    announce(isEdit ? "Fatura atualizada." : "Fatura adicionada.");
    closeModal();
    options.onSaved();
  });

  openModal({
    title: isEdit ? "Editar fatura" : "Nova fatura",
    content: form,
    panelClass: "modal-panel--form",
  });
}

export function deleteTransaction(
  mutations: AppMutations,
  transactionId: string,
  onDeleted: () => void,
): void {
  mutations.update((data) => {
    data.transactions = data.transactions.filter(
      (item) => item.id !== transactionId,
    );
  });
  announce("Lançamento excluído.");
  onDeleted();
}

export function toggleTransactionStatus(
  mutations: AppMutations,
  transaction: Transaction,
  onUpdated: () => void,
): void {
  mutations.update((data) => {
    const index = data.transactions.findIndex(
      (item) => item.id === transaction.id,
    );
    if (index >= 0) {
      const current = data.transactions[index];
      if (current) {
        data.transactions[index] = {
          ...current,
          status: current.status === "settled" ? "pending" : "settled",
          updatedAt: nowIso(),
        };
      }
    }
  });
  announce("Status atualizado.");
  onUpdated();
}

export function deleteCard(
  mutations: AppMutations,
  cardId: string,
  onDeleted: () => void,
): void {
  mutations.update((data) => {
    data.cards = data.cards.filter((item) => item.id !== cardId);
    data.invoices = data.invoices.filter((item) => item.cardId !== cardId);
  });
  announce("Cartão excluído.");
  onDeleted();
}

export function deleteInvoice(
  mutations: AppMutations,
  invoiceId: string,
  onDeleted: () => void,
): void {
  mutations.update((data) => {
    data.invoices = data.invoices.filter((item) => item.id !== invoiceId);
  });
  announce("Fatura excluída.");
  onDeleted();
}

export function toggleInvoiceStatus(
  mutations: AppMutations,
  invoice: Invoice,
  onUpdated: () => void,
): void {
  mutations.update((data) => {
    const index = data.invoices.findIndex((item) => item.id === invoice.id);
    if (index >= 0) {
      const current = data.invoices[index];
      if (current) {
        data.invoices[index] = {
          ...current,
          status: current.status === "paid" ? "open" : "paid",
          updatedAt: nowIso(),
        };
      }
    }
  });
  announce("Status da fatura atualizado.");
  onUpdated();
}

export function cardNameById(data: AppData, cardId: string): string {
  const card = data.cards.find((item) => item.id === cardId);
  return card?.name ?? "Cartão removido";
}

export function actionButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el("button", className, label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

export function iconActionButton(
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el("button", "btn btn--ghost btn--small", label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}
