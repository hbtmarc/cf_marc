export type TransactionKind = "income" | "expense";

export type TransactionStatus = "pending" | "settled";

export type InvoiceStatus = "open" | "paid";

export interface Transaction {
  id: string;
  kind: TransactionKind;
  description: string;
  amountCents: number;
  date: string;
  competenceMonth: string;
  category: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  name: string;
  closingDay: number | null;
  dueDay: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  cardId: string;
  competenceMonth: string;
  amountCents: number;
  dueDate: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  schemaVersion: "cfm.local.v2";
  selectedCompetenceMonth: string;
  transactions: Transaction[];
  cards: Card[];
  invoices: Invoice[];
}

export type RoutePath = "/dashboard" | "/lancamentos" | "/faturas" | "/ajustes";

export interface CompetenceSummary {
  competenceMonth: string;
  incomePlannedCents: number;
  incomeSettledCents: number;
  incomePendingCents: number;
  expensePlannedCents: number;
  expensePaidCents: number;
  expensePendingCents: number;
  balancePlannedCents: number;
  balanceRealizedCents: number;
}

export interface FieldErrors {
  [field: string]: string;
}
