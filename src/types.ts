export type TransactionKind = "income" | "expense";

export type TransactionStatus = "pending" | "settled";

export type ExpenseKind = "expense" | "fee" | "refund";

export type LedgerStatus = "paid" | "pending" | "in_invoice";

export type InvoiceStatus = "open" | "paid" | "partial";

export type ImportInvoiceStatus = "paid" | "open" | "closed" | "partial";

export interface TransactionInstallment {
  current: number;
  total: number;
}

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
  sourceImportId?: string;
  canonicalFingerprint?: string;
  expenseKind?: ExpenseKind;
  ledgerStatus?: LedgerStatus;
  installment?: TransactionInstallment;
  cardId?: string;
  invoiceId?: string;
  paymentDate?: string;
  sourceRecordId?: string;
}

export interface Card {
  id: string;
  name: string;
  closingDay: number | null;
  dueDay: number | null;
  createdAt: string;
  updatedAt: string;
  sourceImportId?: string;
  issuer?: string;
  last4?: string;
  aliasesLast4?: string[];
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
  sourceImportId?: string;
  invoiceTotalCents?: number;
  amountPaidCents?: number;
  amountDueCents?: number;
  creditBalanceCents?: number;
  closingDate?: string;
  paymentDate?: string;
  paidFrom?: string;
  asOfDate?: string;
  importStatus?: ImportInvoiceStatus;
}

export interface ImportMeta {
  fingerprints: string[];
}

export interface AppData {
  schemaVersion: "cfm.local.v2";
  selectedCompetenceMonth: string;
  transactions: Transaction[];
  cards: Card[];
  invoices: Invoice[];
  importMeta?: ImportMeta;
}

export type RoutePath =
  | "/dashboard"
  | "/lancamentos"
  | "/faturas"
  | "/importar"
  | "/ajustes";

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
