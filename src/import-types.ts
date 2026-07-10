export const IMPORT_SCHEMA_VERSION = "cfm.import.v1" as const;

export interface ImportSource {
  institution: string;
  documentType: string;
  label?: string;
  exportedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  rawHash?: string;
  canonicalFingerprint?: string;
  externalRef?: string;
}

export interface ImportAccount {
  id: string;
  name: string;
  type: "checking" | "savings" | "investment";
  institution?: string;
  lastFour?: string;
  currency?: string;
  isActive?: boolean;
}

export interface ImportCard {
  id: string;
  name: string;
  brand?: string;
  lastFour?: string;
  closingDay?: number | null;
  dueDay?: number | null;
  limitCents?: number;
  accountId?: string;
  externalRef?: string;
  aliases?: string[];
}

export interface ImportCardSnapshot {
  cardId: string;
  snapshotMonth: string;
  snapshotDate?: string;
  limitCents?: number;
  usedCents?: number;
  availableCents?: number;
  source?: string;
  confidence?: string;
}

export interface ImportInvoice {
  id: string;
  externalRef?: string;
  cardId: string;
  competenceMonth: string;
  dueDate?: string;
  totalCents?: number;
  amountDueCents?: number;
  creditBalanceCents?: number;
  balanceDirection?: string;
  creditBehavior?: string;
  status?: string;
  isStub?: boolean;
  referenceOnly?: boolean;
}

export interface ImportTransactionSource {
  rawHash?: string;
  canonicalFingerprint?: string;
  rawFingerprint?: string;
}

export interface ImportTransaction {
  id: string;
  externalRef?: string;
  accountId?: string;
  cardId?: string;
  invoiceId?: string;
  installmentPlanId?: string;
  description: string;
  categoryLabel?: string;
  type: string;
  competenceMonth: string;
  date: string;
  amountCents: number;
  flow: "in" | "out" | "neutral";
  installment?: { current?: number; total?: number };
  source?: ImportTransactionSource;
}

export interface ImportInstallmentPlan {
  id: string;
  externalRef?: string;
  cardId?: string;
  description?: string;
  kind?: string;
  totalInstallments?: number;
  currentInstallment?: number;
  installmentAmountCents?: number;
  startCompetenceMonth?: string;
  flow?: string;
}

export interface ImportRecurringRule {
  externalRef?: string;
  id?: string;
  description?: string;
  type?: string;
  flow?: string;
  frequency?: string;
  expectedAmountCents?: number;
  categoryLabel?: string;
  startCompetenceMonth?: string;
  sourcePattern?: string;
  sourceInstitution?: string;
  accountId?: string;
  dayOfMonth?: number;
  isActive?: boolean;
}

export interface ImportReview {
  status?: string;
  notes?: string;
}

export interface ImportPayload {
  schemaVersion: typeof IMPORT_SCHEMA_VERSION;
  source: ImportSource;
  accounts?: ImportAccount[];
  cards?: ImportCard[];
  cardSnapshots?: ImportCardSnapshot[];
  invoices?: ImportInvoice[];
  transactions?: ImportTransaction[];
  installmentPlans?: ImportInstallmentPlan[];
  recurringRules?: ImportRecurringRule[];
  review?: ImportReview;
}

export interface ImportReviewSummary {
  fileName: string;
  institution: string;
  documentType: string;
  periodLabel: string;
  counts: {
    accounts: number;
    cards: number;
    cardSnapshots: number;
    invoices: number;
    transactions: number;
    installmentPlans: number;
    recurringRules: number;
  };
  warnings: string[];
  errors: string[];
}

export interface ImportPlanItem {
  entity: "card" | "invoice" | "transaction";
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
