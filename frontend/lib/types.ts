// app/frontend/lib/types.ts
// Derived directly from app/lib/analysis.ts's ZohoReport shape and the
// payload returned by app/api/report/route.ts. Keep this file in sync if
// either of those change — it is the single contract every dashboard
// component below relies on.

export type FlagItem = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  // Optional — only the mixed-funds flag sets these today (see analysis.ts).
  // confidenceLabel is the plain-language string actually shown to a
  // non-technical SME owner; confidence is the raw level, kept for any
  // future internal use but not required for rendering.
  confidence?: "high" | "medium" | "low";
  confidenceLabel?: string;
};

export type FollowupWorkflowItem = {
  title: string;
  action: string;
  role: "founder" | "accountant" | "reviewer";
};

export type ReportData = {
  cash_buffer_days: number;
  total_cash_outflows: number;
  total_cash_inflows: number;
  flags: FlagItem[];
  mixed_funds_count: number;
  mixed_funds_total: number;
  plain_language: string[];
  followup_workflow: FollowupWorkflowItem[];
  missing_information_checklist: string[];
  anomaly_transactions: {
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
  }[];
  supporting_document_review: {
    expected_documents: number;
    missing_documents: number;
    invoice_documents_missing: number;
    summary: string;
  };
};

export type Org = {
  slug: string;
  company_name: string;
  data_file: string;
  csv_file: string;
  branch_count: number;
};

export type ZohoMeta = {
  company_name: string;
  period_start: string;
  period_end: string;
  branches: string[];
  currency: string;
};

// Mirrors ZohoTransaction from app/lib/analysis.ts — kept as a loose alias
// rather than re-importing across the app/ and app/frontend/ boundary, so
// the frontend has no compile-time dependency on backend-only code paths.
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

export type ZohoPayload = {
  meta: ZohoMeta;
  transactions: FrontendTransaction[];
  report: ReportData;
};