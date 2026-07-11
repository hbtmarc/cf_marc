export const IMPORT_SCHEMA_VERSION = "cfm.import.v1" as const;

export type ImportExpenseKind = "expense" | "fee" | "refund";
export type ImportExpenseStatus = "paid" | "pending" | "in_invoice";
export type ImportInvoiceStatus = "paid" | "open" | "closed" | "partial";

export interface ImportIncome {
  id: string;
  competenceMonth: string;
  receivedDate: string;
  description: string;
  amountCents: number;
  canonicalFingerprint: string;
  sourceType: string;
  sourceRecordId?: string;
}

export interface ImportCard {
  id: string;
  name: string;
  issuer?: string;
  last4?: string;
  aliasesLast4?: string[];
  closingDay?: number;
  dueDay?: number;
}

export interface ImportInvoice {
  id: string;
  cardId: string;
  competenceMonth: string;
  status: ImportInvoiceStatus;
  invoiceTotalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  creditBalanceCents: number;
  closingDate?: string;
  dueDate?: string;
  paymentDate?: string;
  paidFrom?: string;
  asOfDate?: string;
  sourceType: string;
}

export interface ImportExpenseInstallment {
  current: number;
  total: number;
}

export interface ImportExpense {
  id: string;
  competenceMonth: string;
  date: string;
  description: string;
  amountCents: number;
  category: string;
  kind: ImportExpenseKind;
  status: ImportExpenseStatus;
  canonicalFingerprint: string;
  cardId?: string;
  invoiceId?: string;
  installment?: ImportExpenseInstallment;
  paymentMethod: string;
  paymentLabel: string;
  paymentDate?: string;
  sourceType: string;
  sourceRecordId?: string;
}

export interface ImportPayload {
  schemaVersion: typeof IMPORT_SCHEMA_VERSION;
  generatedAt: string;
  currency: string;
  incomes: ImportIncome[];
  cards: ImportCard[];
  invoices: ImportInvoice[];
  expenses: ImportExpense[];
}

export interface ImportReviewSummary {
  fileName: string;
  generatedAt: string;
  currency: string;
  competenceMonths: string[];
  counts: {
    incomes: number;
    cards: number;
    invoices: number;
    expenses: number;
    expenseByKind: {
      expense: number;
      fee: number;
      refund: number;
    };
    installments: number;
    uniqueFingerprints: number;
  };
  planCounts: {
    new: number;
    updated: number;
    existing: number;
    conflicts: number;
  };
  warnings: string[];
  errors: string[];
}

export type ImportEntity = "income" | "expense" | "card" | "invoice";

export interface ImportPlanItem {
  entity: ImportEntity;
  importId: string;
  label: string;
  action: "create" | "existing" | "updated" | "conflict";
  reason?: string;
}

export interface ImportPlan {
  payload: ImportPayload;
  summary: ImportReviewSummary;
  items: ImportPlanItem[];
  canImport: boolean;
}

export interface ImportResult {
  created: number;
  existing: number;
  updated: number;
  conflicts: number;
  errors: string[];
  items: ImportPlanItem[];
}
