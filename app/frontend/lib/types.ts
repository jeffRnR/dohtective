// app/frontend/lib/types.ts
// Derived from backend/engine.py's build_report() output - engine.py is
// the canonical detection engine (see its module docstring); this file
// must track ITS output shape, not app/lib/analysis.ts's older TS port.
//
// CHANGELOG: engine.py has produced anomaly_transactions,
// supporting_document_review, accounting_errors, and
// cash_buffer_risk_level since the Check 1/3/4 fixes - but this file was
// never updated to match, so those fields were invisible to the frontend
// (present in the JSON, untyped, unused) until AnomalyExplorer's build
// broke on the missing type and surfaced the gap.

export type FlagItem = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  // Optional - only the mixed-funds flag sets these today (see engine.py).
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

export type AnomalyTransaction = {
  transaction_id: string;
  anomaly_type: string; // comma-joined list of types, e.g. "Mixed funds, Unreconciled entry"
  reason: string; // " / "-joined list of human-readable reasons
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

// CHANGELOG: data_file/csv_file removed - those were flat-file storage
// artifacts (mock-data/*.json paths) that no longer exist now that
// businesses are real Postgres rows. `role` added - reflects this user's
// BusinessMember.role for this business, since the same business can
// show up differently depending on who's looking at it (founder vs.
// accountant), which matters for UI decisions like "can I add members."
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

// Mirrors ZohoTransaction from app/lib/analysis.ts - kept as a loose alias
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
