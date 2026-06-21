"""
models.py
Pydantic models mirroring the TypeScript types in:
  - app/lib/analysis.ts        (ZohoTransaction, ZohoInvoice, ZohoBankStatement, ZohoReport)
  - app/frontend/lib/types.ts  (FlagItem, FollowupWorkflowItem, ReportData)

CONTRACT DISCIPLINE: this file is the Python side of a cross-language contract.
If you change a field name or type here, the TypeScript side breaks silently
(Next.js will just get unexpected JSON shapes back, not a compile error,
since the boundary is an HTTP call). Change both sides together, in the same
commit, every time.
"""

from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Core transaction/invoice/statement shapes — mirror ZohoTransaction etc. ──

class ZohoTransaction(BaseModel):
    transaction_id: str
    date: str  # ISO date string, kept as str to match JS Date.toISOString() round-trip
    branch: str
    type: str  # "Income" | "Expense" — kept as str, not Literal, to tolerate future categories
    account_name: str
    category_name: str
    contact_name: str
    reference_number: str
    payment_method: str
    description: str
    amount: float
    status: str
    bank_account: str
    is_reconciled: bool
    notes: str = ""


class ZohoInvoice(BaseModel):
    invoice_id: str
    customer_name: str
    total: float
    balance: float
    status: str
    date: str
    due_date: str
    reference_number: str
    branch: str


class ZohoBankStatement(BaseModel):
    statement_id: str
    date_from: str
    date_to: str
    opening_balance: float
    closing_balance: float
    reconciled: bool
    notes: str = ""


# ── Report output shapes — mirror ZohoReport / FlagItem / FollowupWorkflowItem ──

ConfidenceLevel = Literal["high", "medium", "low"]


class FlagItem(BaseModel):
    title: str
    detail: str
    severity: ConfidenceLevel
    # Optional — only mixed-funds sets these today, same as the TS side.
    # confidenceLabel is plain language shown to a non-technical SME owner.
    confidence: Optional[ConfidenceLevel] = None
    confidenceLabel: Optional[str] = None


class FollowupWorkflowItem(BaseModel):
    title: str
    action: str
    role: Literal["founder", "accountant", "reviewer"]


class ReportData(BaseModel):
    cash_buffer_days: int
    total_cash_inflows: float
    total_cash_outflows: float
    flags: list[FlagItem]
    mixed_funds_count: int
    mixed_funds_total: float
    plain_language: list[str]
    followup_workflow: list[FollowupWorkflowItem]
    missing_information_checklist: list[str]


# ── Request/response envelopes for the FastAPI endpoints ──

class AnalyzeRequest(BaseModel):
    transactions: list[ZohoTransaction]
    invoices: list[ZohoInvoice] = Field(default_factory=list)
    bank_statements: list[ZohoBankStatement] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    report: ReportData


# ── Supporting-document extraction shapes ──

DocumentKind = Literal["receipt", "bank_statement", "etims", "kra_pin", "business_registration"]


class ExtractedLineItem(BaseModel):
    """A single line of evidence pulled from a document — not yet a full
    transaction, just a candidate fact that detection logic or a human can
    use to corroborate or contradict what Zoho says happened."""
    description: str
    amount: Optional[float] = None
    date: Optional[str] = None
    raw_text: str  # always populated, even if structured fields fail to parse


class ExtractedDocument(BaseModel):
    """Shared output shape for ALL THREE document extractors (receipts,
    bank statements, eTIMS). Keeping one shape across three very different
    source formats means downstream code (matching against Zoho transactions,
    displaying in the UI) doesn't need to branch on document type."""
    document_kind: DocumentKind
    source_filename: str
    extraction_method: Literal["text_layer", "ocr"]
    confidence: ConfidenceLevel  # text_layer extraction is more trustworthy than OCR
    line_items: list[ExtractedLineItem]
    # Document-level fields that don't fit a line item — e.g. bank statement
    # opening/closing balance, eTIMS PIN/invoice number, receipt vendor name.
    metadata: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class DocumentMatchResult(BaseModel):
    """Result of attempting to match an extracted document against the
    existing Zoho transaction set — feeds the 'missing information' /
    reconciliation checks, not a replacement for them."""
    document: ExtractedDocument
    matched_transaction_id: Optional[str] = None
    match_confidence: ConfidenceLevel
    explanation: str