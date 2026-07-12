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

export type RecurringRuleKind = "income" | "expense";

export type RecurringRuleStatus = "active" | "paused";

export type RecurringBillingMode = "direct" | "card";

export interface RecurringRule {
  id: string;
  kind: RecurringRuleKind;
  description: string;
  amountCents: number;
  category: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string;
  status: RecurringRuleStatus;
  billingMode: RecurringBillingMode;
  cardId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectedRecurringOccurrence {
  id: string;
  ruleId: string;
  kind: RecurringRuleKind;
  competenceMonth: string;
  expectedDate: string;
  description: string;
  amountCents: number;
  category: string;
  billingMode: RecurringBillingMode;
  cardId?: string;
  projected: true;
}

export interface RecurringMatch {
  id: string;
  ruleId: string;
  competenceMonth: string;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
}

export type RecurringOccurrenceResolutionState =
  | "projected"
  | "matched"
  | "covered_by_invoice";

export interface RecurringOccurrenceResolution {
  occurrence: ProjectedRecurringOccurrence;
  state: RecurringOccurrenceResolutionState;
  matchId?: string;
  transactionId?: string;
  expectedAmountCents: number;
  actualAmountCents?: number;
  differenceCents?: number;
}

export interface AppData {
  schemaVersion: "cfm.local.v2";
  selectedCompetenceMonth: string;
  transactions: Transaction[];
  cards: Card[];
  invoices: Invoice[];
  importMeta?: ImportMeta;
  recurringRules?: RecurringRule[];
  recurringMatches?: RecurringMatch[];
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
