export type FlagItem = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  confidence?: "high" | "medium" | "low";
  confidenceLabel?: string;
};

export type FollowupWorkflowItem = {
  title: string;
  action: string;
  role: "founder" | "accountant" | "reviewer";
};

export type AnomalyTransaction = {
  transaction_id: string;
  anomaly_type: string;
  reason: string;
  date: string;
  branch: string;
  amount: number;
  description: string;
  contact_name: string;
  category_name: string;
  account_name: string;
  status: string;
  is_reconciled: boolean;
  payment_method: string;
  reference_number: string;
};

export type SupportingDocumentReview = {
  expected_documents: number;
  missing_documents: number;
  invoice_documents_missing: number;
  summary: string;
};

export type AccountingErrors = {
  sequence_gaps_found: number;
  gap_details: Array<{ between: [string, string]; missing_count: number }>;
  limitation_note: string;
};

export type ReportData = {
  cash_buffer_days: number;
  cash_buffer_risk_level: "high" | "medium" | "low" | "unknown";
  total_cash_outflows: number;
  total_cash_inflows: number;
  flags: FlagItem[];
  mixed_funds_count: number;
  mixed_funds_total: number;
  plain_language: string[];
  followup_workflow: FollowupWorkflowItem[];
  missing_information_checklist: string[];
  anomaly_transactions: AnomalyTransaction[];
  supporting_document_review: SupportingDocumentReview;
  accounting_errors: AccountingErrors;
  skipped_malformed_transaction_count: number;
};

export type Org = {
  slug: string;
  company_name: string;
  branch_count: number;
  role: "founder" | "accountant" | "reviewer";
};

export type ZohoMeta = {
  company_name: string;
  period_start: string;
  period_end: string;
  branches: string[];
  currency: string;
};

export type FrontendTransaction = {
  transaction_id: string;
  date: string;
  branch: string;
  type: string;
  account_name: string;
  category_name: string;
  contact_name: string;
  reference_number: string;
  payment_method: string;
  description: string;
  amount: number;
  status: string;
  bank_account: string;
  is_reconciled: boolean;
  notes: string;
};

export type ReportTrend =
  | {
      available: true;
      priorMonth: string;
      cashBufferDaysDelta: number;
      priorCashBufferDays: number;
      mixedFundsCountDelta: number;
      priorMixedFundsCount: number;
    }
  | {
      available: false;
      reason: string;
    };

export type ZohoPayload = {
  meta: ZohoMeta;
  transactions: FrontendTransaction[] | null;
  report: ReportData;
  trend: ReportTrend;
  // Authoritative empty-state signal from the server. A business with
  // transactions but zero anomalies must show the populated view — using
  // flag count for this was the bug. This field replaces that heuristic.
  hasTransactions: boolean;
  zoho_connected?: boolean;
};

// Output shape of CsvUploader — frontend-neutral, does not mirror
// engine.py's internal field names. The ingest route's normalizeForEngine()
// function is the only place that knows how to translate this into the
// engine's expected transaction shape.
export interface NormalizedTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  vendor: string;
  source: 'ZOHO' | 'EXCEL' | 'MPESA';
  raw: any;
}