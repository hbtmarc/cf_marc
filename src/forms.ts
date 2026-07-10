import {
  createId,
  nowIso,
  validateCardForm,
  validateInvoiceForm,
  validateTransactionForm,
} from "./finance";
import {
  createProgressiveForm,
  createValidatedField,
  type ProgressiveFormHandle,
} from "./form-validation";
import type { AppData, Card, Invoice, Transaction, TransactionKind } from "./types";
import {
  announce,
  centsToInputValue,
  closeModal,
  el,
  openModal,
} from "./ui";

export interface AppMutations {
  update: (mutator: (data: AppData) => void) => void;
}

function openFormModal(options: {
  title: string;
  form: HTMLFormElement;
  formController: ProgressiveFormHandle;
  panelClass?: string;
}): void {
  options.formController.bind();
  openModal({
    title: options.title,
    content: options.form,
    onClose: () => {
      options.formController.destroy();
    },
    ...(options.panelClass ? { panelClass: options.panelClass } : {}),
  });
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
  pending.textContent = "Pendente";
  const settled = el("option") as HTMLOptionElement;
  settled.value = "settled";
  settled.textContent =
    options.kind === "income" ? "Recebido" : "Pago";
  status.appendChild(pending);
  status.appendChild(settled);
  status.value = transaction?.status ?? "pending";

  const fields = [
    createValidatedField({
      name: "tx-description",
      label: "Descrição",
      control: description,
      required: true,
      getError: () =>
        description.value.trim().length === 0 ? "Descrição é obrigatória." : null,
    }),
    createValidatedField({
      name: "tx-amount",
      label: "Valor",
      control: amount,
      required: true,
      getError: () => {
        const result = validateTransactionForm({
          description: description.value,
          amountInput: amount.value,
          date: date.value,
          competenceMonth: options.competenceMonth,
          category: category.value,
        });
        return result.errors.amount ?? null;
      },
    }),
    createValidatedField({
      name: "tx-date",
      label: "Data",
      control: date,
      required: true,
      getError: () => {
        const result = validateTransactionForm({
          description: description.value,
          amountInput: amount.value,
          date: date.value,
          competenceMonth: options.competenceMonth,
          category: category.value,
        });
        return result.errors.date ?? null;
      },
    }),
    createValidatedField({
      name: "tx-category",
      label: "Categoria",
      control: category,
      required: true,
      getError: () =>
        category.value.trim().length === 0 ? "Categoria é obrigatória." : null,
    }),
    createValidatedField({
      name: "tx-status",
      label: "Status",
      control: status,
      getError: () => null,
    }),
  ];

  for (const field of fields) {
    form.appendChild(field.group);
  }

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

  cancel.addEventListener("click", () => {
    closeModal();
  });

  const formController = createProgressiveForm({
    form,
    submitButton: submit,
    fields,
    onSubmit: () => {
      const result = validateTransactionForm({
        description: description.value,
        amountInput: amount.value,
        date: date.value,
        competenceMonth: options.competenceMonth,
        category: category.value,
      });

      if (result.amountCents === null) {
        formController.markSubmitted();
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
    },
  });

  openFormModal({
    title,
    form,
    formController,
    panelClass: "modal-panel--form",
  });
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

  const getCardValidation = () =>
    validateCardForm({
      name: name.value,
      closingDay: closingDay.value,
      dueDay: dueDay.value,
    });

  const fields = [
    createValidatedField({
      name: "card-name",
      label: "Nome",
      control: name,
      required: true,
      getError: () =>
        name.value.trim().length === 0 ? "Nome do cartão é obrigatório." : null,
    }),
    createValidatedField({
      name: "card-closing",
      label: "Dia de fechamento",
      control: closingDay,
      getError: () => getCardValidation().errors.closingDay ?? null,
    }),
    createValidatedField({
      name: "card-due",
      label: "Dia de vencimento",
      control: dueDay,
      getError: () => getCardValidation().errors.dueDay ?? null,
    }),
  ];

  for (const field of fields) {
    form.appendChild(field.group);
  }

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

  cancel.addEventListener("click", () => {
    closeModal();
  });

  const formController = createProgressiveForm({
    form,
    submitButton: submit,
    fields,
    onSubmit: () => {
      const result = getCardValidation();
      if (Object.keys(result.errors).length > 0) {
        formController.markSubmitted();
        return;
      }

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
    },
  });

  openFormModal({
    title: isEdit ? "Editar cartão" : "Novo cartão",
    form,
    formController,
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

  if (options.data.cards.length === 0) {
    const notice = el(
      "p",
      "form-notice",
      "Cadastre um cartão em Ajustes antes de criar faturas.",
    );
    form.appendChild(notice);
  }

  const getInvoiceValidation = () =>
    validateInvoiceForm({
      cardId: cardId.value,
      competenceMonth: options.competenceMonth,
      amountInput: amount.value,
      dueDate: dueDate.value,
    });

  const fields = [
    createValidatedField({
      name: "invoice-card",
      label: "Cartão",
      control: cardId,
      required: true,
      getError: () =>
        cardId.value.trim().length === 0 ? "Selecione um cartão." : null,
    }),
    createValidatedField({
      name: "invoice-amount",
      label: "Valor",
      control: amount,
      required: true,
      getError: () => getInvoiceValidation().errors.amount ?? null,
    }),
    createValidatedField({
      name: "invoice-due",
      label: "Vencimento",
      control: dueDate,
      required: true,
      getError: () => getInvoiceValidation().errors.dueDate ?? null,
    }),
    createValidatedField({
      name: "invoice-status",
      label: "Status",
      control: status,
      getError: () => null,
    }),
  ];

  for (const field of fields) {
    form.appendChild(field.group);
  }

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

  cancel.addEventListener("click", () => {
    closeModal();
  });

  const formController = createProgressiveForm({
    form,
    submitButton: submit,
    fields,
    onSubmit: () => {
      if (options.data.cards.length === 0) {
        formController.markSubmitted();
        return;
      }

      const result = getInvoiceValidation();
      if (result.amountCents === null || Object.keys(result.errors).length > 0) {
        formController.markSubmitted();
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
    },
  });

  openFormModal({
    title: isEdit ? "Editar fatura" : "Nova fatura",
    form,
    formController,
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

export function iconActionButton(
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el("button", "btn btn--ghost btn--small", label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}
