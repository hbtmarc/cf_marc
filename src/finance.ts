import type {
  AppData,
  CompetenceSummary,
  FieldErrors,
  Invoice,
  Transaction,
} from "./types";

const MONTH_NAMES = [
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
] as const;

const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function currentCompetenceMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function isValidCompetenceMonth(value: string): boolean {
  return COMPETENCE_PATTERN.test(value);
}

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function shiftCompetenceMonth(
  competenceMonth: string,
  delta: number,
): string {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1 + delta, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export function formatCompetenceLabel(competenceMonth: string): string {
  const [yearStr, monthStr] = competenceMonth.split("-");
  const monthIndex = Number(monthStr) - 1;
  const monthName = MONTH_NAMES[monthIndex];
  if (monthName === undefined) {
    return competenceMonth;
  }
  return `${monthName}/${yearStr}`;
}

export function formatCentsToBRL(cents: number): string {
  const normalizedCents = cents === 0 || Object.is(cents, -0) ? 0 : cents;
  const value = normalizedCents / 100;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100);
}

export function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function filterTransactionsByCompetence(
  transactions: Transaction[],
  competenceMonth: string,
): Transaction[] {
  return transactions.filter(
    (transaction) => transaction.competenceMonth === competenceMonth,
  );
}

export function filterInvoicesByCompetence(
  invoices: Invoice[],
  competenceMonth: string,
): Invoice[] {
  return invoices.filter(
    (invoice) => invoice.competenceMonth === competenceMonth,
  );
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function invoiceDebtCents(invoice: Invoice): number {
  const due = invoice.amountDueCents ?? invoice.amountCents;
  const credit = invoice.creditBalanceCents ?? 0;
  if (credit > 0 && due === 0) {
    return 0;
  }
  return due;
}

export function invoiceHasCredit(invoice: Invoice): boolean {
  return (invoice.creditBalanceCents ?? 0) > 0 && invoiceDebtCents(invoice) === 0;
}

export function isInvoiceLinkedExpense(transaction: Transaction): boolean {
  return transaction.kind === "expense" && transaction.ledgerStatus === "in_invoice";
}

export function ledgerExpenseCents(transaction: Transaction): number {
  if (transaction.expenseKind === "refund") {
    return -transaction.amountCents;
  }
  return transaction.amountCents;
}

export function invoiceTotalCentsValue(invoice: Invoice): number {
  return invoice.invoiceTotalCents ?? invoice.amountCents;
}

export function invoicePaidCents(invoice: Invoice): number {
  return invoice.amountPaidCents ?? 0;
}

export function invoiceOpenCents(invoice: Invoice): number {
  return invoice.amountDueCents ?? invoiceDebtCents(invoice);
}

export function invoiceNeedsFinancialAction(
  invoice: Invoice,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (invoiceHasCredit(invoice)) {
    return false;
  }
  if (invoice.status === "partial" || invoice.importStatus === "partial") {
    return true;
  }
  if (invoice.status === "open" || invoice.importStatus === "open") {
    return true;
  }
  if (invoice.dueDate < today && invoiceOpenCents(invoice) > 0) {
    return true;
  }
  return false;
}

export function transactionsForInvoice(
  transactions: Transaction[],
  invoiceId: string,
): Transaction[] {
  return transactions
    .filter((item) => item.invoiceId === invoiceId && isInvoiceLinkedExpense(item))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function invoiceRealizedCents(invoice: Invoice): number {
  return invoice.amountPaidCents ?? 0;
}

export function invoiceCommittedCents(invoice: Invoice): number {
  return invoiceDebtCents(invoice);
}

export function calculateCompetenceSummary(
  data: AppData,
  competenceMonth: string,
): CompetenceSummary {
  const transactions = filterTransactionsByCompetence(
    data.transactions,
    competenceMonth,
  );
  const invoices = filterInvoicesByCompetence(data.invoices, competenceMonth);

  const incomes = transactions.filter(
    (transaction) => transaction.kind === "income",
  );
  const expenses = transactions.filter(
    (transaction) => transaction.kind === "expense",
  );
  const ledgerExpenses = expenses.filter((transaction) => !isInvoiceLinkedExpense(transaction));

  const incomePlannedCents = sumCents(
    incomes.map((transaction) => transaction.amountCents),
  );
  const incomeSettledCents = sumCents(
    incomes
      .filter((transaction) => transaction.status === "settled")
      .map((transaction) => transaction.amountCents),
  );
  const incomePendingCents = sumCents(
    incomes
      .filter((transaction) => transaction.status === "pending")
      .map((transaction) => transaction.amountCents),
  );

  const expenseTransactionsPaid = sumCents(
    ledgerExpenses
      .filter((transaction) => transaction.status === "settled")
      .map((transaction) => ledgerExpenseCents(transaction)),
  );
  const expenseTransactionsPending = sumCents(
    ledgerExpenses
      .filter((transaction) => transaction.status === "pending")
      .map((transaction) => ledgerExpenseCents(transaction)),
  );

  const invoicePaidCents = sumCents(
    invoices.map((invoice) => invoiceRealizedCents(invoice)),
  );
  const invoiceDueCents = sumCents(
    invoices.map((invoice) => invoiceCommittedCents(invoice)),
  );

  const expensePaidCents = expenseTransactionsPaid + invoicePaidCents;
  const expensePendingCents = expenseTransactionsPending + invoiceDueCents;
  const expensePlannedCents = expensePaidCents + expensePendingCents;

  return {
    competenceMonth,
    incomePlannedCents,
    incomeSettledCents,
    incomePendingCents,
    expensePlannedCents,
    expensePaidCents,
    expensePendingCents,
    balancePlannedCents: incomePlannedCents - expensePlannedCents,
    balanceRealizedCents: incomeSettledCents - expensePaidCents,
  };
}

export function validateOptionalDay(
  value: string,
  field: string,
  errors: FieldErrors,
): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    errors[field] = "Informe um dia entre 1 e 31.";
    return null;
  }
  return day;
}

export function validateTransactionForm(input: {
  description: string;
  amountInput: string;
  date: string;
  competenceMonth: string;
  category: string;
}): { errors: FieldErrors; amountCents: number | null } {
  const errors: FieldErrors = {};

  if (input.description.trim().length === 0) {
    errors.description = "Descrição é obrigatória.";
  }

  const amountCents = parseMoneyToCents(input.amountInput);
  if (amountCents === null) {
    errors.amount = "Informe um valor maior que zero.";
  }

  if (!isValidDate(input.date)) {
    errors.date = "Informe uma data válida.";
  }

  if (!isValidCompetenceMonth(input.competenceMonth)) {
    errors.competenceMonth = "Competência inválida.";
  }

  if (input.category.trim().length === 0) {
    errors.category = "Categoria é obrigatória.";
  }

  return { errors, amountCents };
}

export function validateCardForm(input: {
  name: string;
  closingDay: string;
  dueDay: string;
}): { errors: FieldErrors; closingDay: number | null; dueDay: number | null } {
  const errors: FieldErrors = {};

  if (input.name.trim().length === 0) {
    errors.name = "Nome do cartão é obrigatório.";
  }

  const closingDay = validateOptionalDay(input.closingDay, "closingDay", errors);
  const dueDay = validateOptionalDay(input.dueDay, "dueDay", errors);

  return { errors, closingDay, dueDay };
}

export function validateInvoiceForm(input: {
  cardId: string;
  competenceMonth: string;
  amountInput: string;
  dueDate: string;
}): { errors: FieldErrors; amountCents: number | null } {
  const errors: FieldErrors = {};

  if (input.cardId.trim().length === 0) {
    errors.cardId = "Selecione um cartão.";
  }

  if (!isValidCompetenceMonth(input.competenceMonth)) {
    errors.competenceMonth = "Competência inválida.";
  }

  const amountCents = parseMoneyToCents(input.amountInput);
  if (amountCents === null) {
    errors.amount = "Informe um valor maior que zero.";
  }

  if (!isValidDate(input.dueDate)) {
    errors.dueDate = "Informe um vencimento válido.";
  }

  return { errors, amountCents };
}

export function transactionStatusLabel(
  kind: Transaction["kind"],
  status: Transaction["status"],
  ledgerStatus?: Transaction["ledgerStatus"],
): string {
  if (kind === "income") {
    return status === "settled" ? "Recebido" : "Pendente";
  }
  if (ledgerStatus === "in_invoice") {
    return "Na fatura";
  }
  return status === "settled" ? "Pago" : "Pendente";
}

export function invoiceStatusLabel(invoice: Invoice): string {
  if (invoiceHasCredit(invoice)) {
    return "Credora";
  }
  if (
    invoice.status === "partial" ||
    invoice.importStatus === "partial" ||
    ((invoice.amountPaidCents ?? 0) > 0 && invoiceDebtCents(invoice) > 0)
  ) {
    return "Parcial";
  }
  return invoice.status === "paid" ? "Paga" : "Aberta";
}
