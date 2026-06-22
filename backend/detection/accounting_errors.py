"""
detection/accounting_errors.py
Check 3 — Accounting errors, missing documentation, and bank-statement
reconciliation.

CHANGELOG — sequence gap detection:
The first version extracted trailing digits from EVERY reference number
and diffed them as one global sequence. "INV-0011" and "HOME-KIASI-9981"
are different ID schemes entirely, not adjacent points on one number line.
Diffing across schemes produced nonsense gap counts (six figures, in
testing). Fixed: group by the non-numeric PREFIX first, and only look for
gaps within the same prefix family.

CHANGELOG — gap cap:
A gap larger than 50 almost always means two unrelated numbering schemes
slipped past the prefix grouping — not 9,000 missing invoices. Capped to
avoid false alarms on ad-hoc or mixed-format reference numbers.

HONEST CEILING (Section 3.4):
Sequence-gap detection can only tell you that a reference-number sequence
has gaps. It cannot tell you what was actually missing without a full
chart of accounts. Voided or cancelled entries also create legitimate gaps.
This limitation is surfaced in the output rather than buried in comments.
"""

import re
from typing import Any, Dict, List, Tuple

from .helpers import Transaction, _safe_amount

Invoice = Dict[str, Any]
SupportingDocument = Dict[str, Any]
BankStatement = Dict[str, Any]

_REF_NUMBER_PATTERN = re.compile(r"^([A-Za-z\-]*?)(\d+)$")

_SEQUENCE_GAP_LIMIT = 50  # gaps larger than this are almost certainly schema collisions
_MIN_DIGIT_LENGTH = 4     # short suffixes (e.g. "001") are IDs, not sequence counters


def detect_accounting_errors(transactions: List[Transaction]) -> Dict[str, Any]:
    """Detects gaps in reference-number sequences within each prefix family."""
    by_prefix: Dict[str, List[Tuple[int, str]]] = {}
    for tx in transactions:
        ref = str(tx.get("reference_number", ""))
        match = _REF_NUMBER_PATTERN.match(ref)
        if not match:
            continue
        prefix, digits = match.group(1), match.group(2)
        if len(digits) < _MIN_DIGIT_LENGTH:
            continue
        by_prefix.setdefault(prefix, []).append((int(digits), ref))

    gaps_found = []
    for _prefix, refs in by_prefix.items():
        if len(refs) < 2:
            continue
        refs.sort(key=lambda pair: pair[0])
        for i in range(1, len(refs)):
            prev_num, prev_ref = refs[i - 1]
            curr_num, curr_ref = refs[i]
            gap_size = curr_num - prev_num - 1
            if 0 < gap_size <= _SEQUENCE_GAP_LIMIT:
                gaps_found.append({
                    "between": [prev_ref, curr_ref],
                    "missing_count": gap_size,
                })

    return {
        "sequence_gaps_found": len(gaps_found),
        "gap_details": gaps_found[:5],
        "limitation_note": (
            "This check can only tell you the reference-number sequence has gaps — "
            "it cannot tell you what was actually missing without a full chart of "
            "accounts. Voided or cancelled entries also create legitimate gaps."
        ),
    }


def detect_missing_documentation(
    transactions: List[Transaction],
    invoices: List[Invoice],
    documents: List[SupportingDocument],
) -> Dict[str, Any]:
    """Identifies large expenses and unpaid invoices lacking supporting documents.

    Threshold: expenses ≥ KES 30,000 are expected to have a linked
    receipt or invoice marked "Available".
    """
    docs_by_tx = {
        doc.get("linked_transaction_id"): doc
        for doc in documents
        if doc.get("linked_transaction_id")
    }
    missing = []
    expected_count = 0

    for tx in transactions:
        if tx.get("type") != "Expense":
            continue
        if _safe_amount(tx) < 30_000:
            continue
        expected_count += 1
        linked = docs_by_tx.get(tx.get("transaction_id"))
        if not linked or linked.get("status") != "Available":
            missing.append({
                "transaction_id": tx.get("transaction_id"),
                "description": tx.get("description"),
                "branch": tx.get("branch"),
                "amount": tx.get("amount"),
                "expected_document_type": "Receipt or invoice",
                "status": linked.get("status") if linked else "Missing",
            })

    unpaid_invoices = [
        inv for inv in invoices
        if inv.get("balance", 0) > 0 and inv.get("status") != "Paid"
    ]
    missing_invoice_docs = [
        inv for inv in unpaid_invoices
        if not any(doc.get("invoice_id") == inv.get("invoice_id") for doc in documents)
    ]

    return {
        "expected_documents": expected_count,
        "missing_documents": len(missing),
        "invoice_documents_missing": len(missing_invoice_docs),
        "details": missing[:5],
    }


def detect_bank_statement_issues(statements: List[BankStatement]) -> List[BankStatement]:
    """Returns bank statements that have not been fully reconciled."""
    return [stmt for stmt in statements if not stmt.get("reconciled", False)]