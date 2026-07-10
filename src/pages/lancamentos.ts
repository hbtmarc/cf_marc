import { filterTransactionsByCompetence } from "../finance";
import type { AppData, Transaction } from "../types";
import type { AppMutations } from "../forms";
import {
  deleteTransaction,
  iconActionButton,
  openTransactionForm,
  toggleTransactionStatus,
} from "../forms";
import {
  el,
  openConfirmModal,
  renderEmptyState,
  transactionRowHtml,
} from "../ui";

export function renderLancamentos(
  host: HTMLElement,
  data: AppData,
  mutations: AppMutations,
  rerender: () => void,
): void {
  const month = data.selectedCompetenceMonth;
  const transactions = filterTransactionsByCompetence(data.transactions, month);
  const incomes = transactions.filter((item) => item.kind === "income");
  const expenses = transactions.filter((item) => item.kind === "expense");

  host.innerHTML = "";

  const header = el("div", "page-header");
  const title = el("div");
  title.innerHTML = `
    <h2 class="page-header__title">Lançamentos</h2>
    <p class="page-header__subtitle">Receitas e despesas da competência selecionada.</p>
  `;
  const actions = el("div", "page-header__actions");
  const newIncome = el("button", "btn btn--primary", "Nova receita");
  newIncome.type = "button";
  const newExpense = el("button", "btn btn--secondary", "Nova despesa");
  newExpense.type = "button";
  actions.appendChild(newIncome);
  actions.appendChild(newExpense);
  header.appendChild(title);
  header.appendChild(actions);
  host.appendChild(header);

  newIncome.addEventListener("click", () => {
    openTransactionForm({
      mutations,
      competenceMonth: month,
      kind: "income",
      onSaved: rerender,
    });
  });

  newExpense.addEventListener("click", () => {
    openTransactionForm({
      mutations,
      competenceMonth: month,
      kind: "expense",
      onSaved: rerender,
    });
  });

  host.appendChild(
    renderSection({
      title: "Receitas",
      emptyTitle: "Nenhuma receita",
      emptyDescription: "Adicione a primeira receita desta competência.",
      items: incomes,
      data,
      mutations,
      rerender,
    }),
  );

  host.appendChild(
    renderSection({
      title: "Despesas",
      emptyTitle: "Nenhuma despesa",
      emptyDescription: "Adicione a primeira despesa desta competência.",
      items: expenses,
      data,
      mutations,
      rerender,
    }),
  );
}

function renderSection(options: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  items: Transaction[];
  data: AppData;
  mutations: AppMutations;
  rerender: () => void;
}): HTMLElement {
  const section = el("section", "entity-section");
  const heading = el("h3", "entity-section__title", options.title);
  section.appendChild(heading);

  if (options.items.length === 0) {
    const empty = el("div");
    empty.innerHTML = renderEmptyState(
      options.emptyTitle,
      options.emptyDescription,
    );
    section.appendChild(empty);
    return section;
  }

  const list = el("ul", "list");
  for (const item of options.items) {
    const row = el("li", "list-row list-row--actions");
    const content = el("div", "list-row__content");
    content.innerHTML = transactionRowHtml({
      description: item.description,
      category: item.category,
      date: item.date,
      amountCents: item.amountCents,
      kind: item.kind,
      status: item.status,
    });

    const rowActions = el("div", "list-row__actions");
    rowActions.appendChild(
      iconActionButton(
        item.kind === "income"
          ? item.status === "settled"
            ? "Marcar pendente"
            : "Marcar recebida"
          : item.status === "settled"
            ? "Marcar pendente"
            : "Marcar paga",
        () => {
          toggleTransactionStatus(options.mutations, item, options.rerender);
        },
      ),
    );
    rowActions.appendChild(
      iconActionButton("Editar", () => {
        openTransactionForm({
          mutations: options.mutations,
          competenceMonth: options.data.selectedCompetenceMonth,
          kind: item.kind,
          transaction: item,
          onSaved: options.rerender,
        });
      }),
    );
    rowActions.appendChild(
      iconActionButton("Excluir", () => {
        openConfirmModal({
          title: "Excluir lançamento",
          message: `Excluir "${item.description}"? Esta ação não pode ser desfeita.`,
          confirmLabel: "Excluir",
          danger: true,
          onConfirm: () => {
            deleteTransaction(options.mutations, item.id, options.rerender);
          },
        });
      }),
    );

    row.appendChild(content);
    row.appendChild(rowActions);
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}
