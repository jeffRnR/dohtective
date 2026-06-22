"""
detection/report_builder.py
Report assembly — orchestrates all detection checks, builds the flags
list and per-instance anomaly feed, and assembles the final report dict.

Two structural improvements over the previous monolithic engine.py:

  1. FLAG CONSTRUCTION is now data-driven.
     The nine near-identical `if X: flags.append({...})` blocks have been
     replaced with a _build_flags() function that works from a declarative
     list of (condition, flag_dict) pairs. Adding a 10th flag type means
     adding one entry to that list — not copy-pasting an if-block and
     hoping the severity string doesn't have a typo.

  2. DATA QUALITY is formalized into a single `data_quality` dict.
     The previous version had four different ad-hoc fields
     (skipped_malformed_transaction_count, used_fallback_starting_balance,
     limitation_note on cash, limitation_note on accounting_errors) that
     each invented their own shape. All honesty notes now live under
     `data_quality` in the report, with a consistent structure:
       - counts (skipped_no_id, skipped_invalid_date)
       - flags (used_fallback_starting_balance)
       - notes list (human-readable, only non-trivial items included)
       - limitation_notes dict (module-level ceiling statements, always present)
     This makes it easy to extend when a 7th detector needs to surface its
     own "here's what I couldn't determine" note.
"""

from typing import Any, Dict, List, Optional, Set, Tuple

from .helpers import Transaction, _safe_amount, _safe_id, invalid_date_count
from .mixed_funds import detect_mixed_funds
from .duplicates_and_amounts import (
    detect_duplicate_transactions,
    detect_round_number_payments,
    detect_odd_amount_new_recipient,
)
from .unusual_and_unreconciled import detect_unusual_transactions, detect_unreconciled
from .accounting_errors import (
    detect_accounting_errors,
    detect_missing_documentation,
    detect_bank_statement_issues,
)
from .cash_buffer import calculate_cash_buffer

Invoice = Dict[str, Any]
BankStatement = Dict[str, Any]
SupportingDocument = Dict[str, Any]
Payload = Dict[str, Any]

CONFIDENCE_LABELS = {
    "high": "We're quite sure — act on this now",
    "medium": "Worth a look when you get a chance",
    "low": "Probably nothing, just flagging it",
}

_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


# ── flag construction (data-driven) ───────────────────────────────────────

def _build_flags(
    *,
    mixed: List[Transaction],
    mixed_total: float,
    mixed_confidence_safe: str,
    duplicates: List[Transaction],
    rounds: List[Transaction],
    odd_amounts: List[Transaction],
    unusual: List[Transaction],
    unreconciled: List[Transaction],
    accounting_errors: Dict[str, Any],
    docs_review: Dict[str, Any],
    bank_issues: List[Any],
    cash: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Builds the flags list from a declarative table of (condition, flag) pairs.

    CHANGELOG: the nine separate `if X: flags.append({...})` blocks have been
    replaced with this function. Each entry in `specs` is a 2-tuple:
      (bool condition, dict flag)
    Only entries where condition is True are included in the output.
    Adding a new flag type = adding one tuple to specs, not copy-pasting
    an if-block with a potentially-typo'd severity string.

    Flags with extra fields (confidence, confidenceLabel for mixed funds)
    include those fields directly in the dict; the frontend already handles
    optional flag fields, so this doesn't break existing consumers.
    """
    docs_flag_count = docs_review["missing_documents"] + docs_review["invoice_documents_missing"]

    specs: List[Tuple[bool, Dict[str, Any]]] = [
        (
            bool(mixed),
            {
                "title": "Possible mixed personal and business funds — needs review",
                "detail": (
                    f"{len(mixed)} transaction(s) totalling KES {mixed_total:,.0f} "
                    f"look like they might mix personal and business spending. "
                    f"This isn't an accusation — it's a list of things worth a "
                    f"quick check with your bookkeeper."
                ),
                "severity": mixed_confidence_safe,
                "confidence": mixed_confidence_safe,
                "confidenceLabel": CONFIDENCE_LABELS.get(
                    mixed_confidence_safe, CONFIDENCE_LABELS["low"]
                ),
            },
        ),
        (
            bool(duplicates),
            {
                "title": "Possible duplicate payments — needs review",
                "detail": (
                    f"{len(duplicates)} transactions look like they might be accidental "
                    f"repeat payments within a 5-day window. Could be a genuine "
                    f"re-order — worth a quick check."
                ),
                "severity": "high",
            },
        ),
        (
            bool(rounds),
            {
                "title": "Round-number payments to unfamiliar recipients",
                "detail": (
                    f"{len(rounds)} large round-number expenses went to recipients "
                    f"you've rarely paid before. Probably fine, worth a glance."
                ),
                "severity": "medium",
            },
        ),
        (
            bool(odd_amounts),
            {
                "title": "Unusually precise payments to brand-new recipients",
                "detail": (
                    f"{len(odd_amounts)} payments with oddly specific amounts went to "
                    f"recipients with no prior history. Worth confirming these are legitimate."
                ),
                "severity": "medium",
            },
        ),
        (
            bool(unusual),
            {
                "title": "Unusual transactions detected",
                "detail": (
                    f"{len(unusual)} transactions are unusually large or describe a one-off charge."
                ),
                "severity": "medium",
            },
        ),
        (
            bool(unreconciled),
            {
                "title": "Unreconciled entries present",
                "detail": f"{len(unreconciled)} transactions are not reconciled.",
                "severity": "medium",
            },
        ),
        (
            accounting_errors["sequence_gaps_found"] > 0,
            {
                "title": "Reference number sequence has gaps",
                "detail": (
                    f"{accounting_errors['sequence_gaps_found']} gap(s) found in your "
                    f"reference numbering — could mean a missing entry, or just a voided one. "
                    f"{accounting_errors['limitation_note']}"
                ),
                "severity": "medium",
            },
        ),
        (
            docs_flag_count > 0,
            {
                "title": "Supporting documents incomplete",
                "detail": (
                    f"{docs_review['missing_documents']} expense documents and "
                    f"{docs_review['invoice_documents_missing']} invoice documents "
                    f"are missing or unavailable."
                ),
                "severity": "high" if docs_flag_count > 1 else "medium",
            },
        ),
        (
            bool(bank_issues),
            {
                "title": "Bank statement not fully reconciled",
                "detail": f"{len(bank_issues)} bank statement(s) still show unreconciled items.",
                "severity": "medium",
            },
        ),
        (
            cash["risk_level"] in ("high", "medium"),
            {
                "title": (
                    "Cash buffer needs attention"
                    if cash["risk_level"] == "high"
                    else "Cash buffer worth watching"
                ),
                "detail": (
                    f"Estimated cash buffer is {cash['buffer_days']} days. "
                    f"{cash['limitation_note']}"
                ),
                "severity": cash["risk_level"],
            },
        ),
    ]

    return [flag for condition, flag in specs if condition]


# ── data quality formalization ─────────────────────────────────────────────

def _build_data_quality(
    *,
    skipped_no_id_count: int,
    skipped_invalid_date_count: int,
    cash: Dict[str, Any],
    accounting_errors: Dict[str, Any],
) -> Dict[str, Any]:
    """Consolidates all honesty / data-quality notes into a single dict.

    CHANGELOG: the previous version scattered data-quality signals across
    four different ad-hoc top-level fields with different shapes. This
    replaces them with a consistent structure that is easy to extend when
    a new detector needs to surface its own limitation note.

    Structure:
      counts        — how many transactions were excluded and why
      flags         — boolean conditions worth surfacing (e.g. fallback balance)
      notes         — human-readable list; only non-trivial items are included
      limitation_notes — module-level ceiling statements, always present
    """
    notes: List[str] = []
    if skipped_no_id_count:
        notes.append(
            f"{skipped_no_id_count} transaction(s) excluded from the anomaly feed "
            f"due to missing transaction IDs."
        )
    if skipped_invalid_date_count:
        notes.append(
            f"{skipped_invalid_date_count} transaction(s) excluded from date-dependent "
            f"checks due to unparsable dates."
        )
    if cash.get("used_fallback_starting_balance"):
        notes.append(
            "Cash buffer estimate used a placeholder opening balance — treat "
            "buffer_days as illustrative until a real opening balance is provided."
        )

    return {
        "counts": {
            "skipped_no_id": skipped_no_id_count,
            "skipped_invalid_date": skipped_invalid_date_count,
        },
        "flags": {
            "used_fallback_starting_balance": cash.get("used_fallback_starting_balance", False),
        },
        "notes": notes,
        "limitation_notes": {
            "accounting_errors": accounting_errors.get("limitation_note", ""),
            "cash_buffer": cash.get("limitation_note", ""),
        },
    }


# ── anomaly feed assembly ──────────────────────────────────────────────────

def _build_anomaly_feed(
    *,
    mixed: List[Transaction],
    mixed_confidence_by_id: Dict[str, str],
    duplicates: List[Transaction],
    rounds: List[Transaction],
    odd_amounts: List[Transaction],
    unusual: List[Transaction],
    unreconciled: List[Transaction],
) -> Tuple[List[Dict[str, Any]], int]:
    """Builds the per-instance anomaly feed and returns (entries, skipped_count).

    CHANGELOG: the six near-identical `if tx_id in X_ids` blocks from the
    original monolith are now one data-driven loop over `anomaly_rules`.
    Adding a 7th anomaly type means appending one tuple to that list.

    Mixed-funds reason text is dynamic (depends on per-transaction
    confidence) and is handled as a special case in the loop.
    """
    def _ids(txs: List[Transaction]) -> Set[str]:
        return {tid for tx in txs if (tid := _safe_id(tx))}

    mixed_ids = _ids(mixed)
    duplicate_ids = _ids(duplicates)
    round_ids = _ids(rounds)
    odd_amount_ids = _ids(odd_amounts)
    unusual_ids = _ids(unusual)
    unreconciled_ids = _ids(unreconciled)

    # Rules: (id_set, label, static_reason_or_None_for_dynamic)
    # Mixed funds reason is dynamic (per-transaction confidence) — None signals
    # that the loop should compute it from mixed_confidence_by_id.
    anomaly_rules: List[Tuple[Set[str], str, Optional[str]]] = [
        (mixed_ids,       "Mixed funds",             None),
        (duplicate_ids,   "Duplicate transaction",   "Potential duplicate supplier payment within 5 days — needs review, not confirmed."),
        (round_ids,       "Round-number payment",    "Large round-number expense to an unfamiliar recipient."),
        (odd_amount_ids,  "Odd amount, new recipient","Unusually precise amount paid to a brand-new recipient."),
        (unusual_ids,     "Unusual transaction",     "One-off or unusually large expense description detected."),
        (unreconciled_ids,"Unreconciled entry",      "Transaction not marked as reconciled in the books."),
    ]

    anomaly_map: Dict[str, Dict[str, Any]] = {}
    skipped_no_id_count = 0

    all_flagged = mixed + duplicates + rounds + odd_amounts + unusual + unreconciled
    for tx in all_flagged:
        tx_id = _safe_id(tx)
        if tx_id is None:
            skipped_no_id_count += 1
            continue
        if tx_id not in anomaly_map:
            anomaly_map[tx_id] = {
                "transaction_id": tx_id,
                "anomaly_type": [],
                "reason": [],
                "date": tx.get("date"),
                "branch": tx.get("branch"),
                "amount": tx.get("amount"),
                "description": tx.get("description"),
                "contact_name": tx.get("contact_name"),
                "category_name": tx.get("category_name"),
                "account_name": tx.get("account_name"),
                "status": tx.get("status"),
                "is_reconciled": tx.get("is_reconciled"),
                "payment_method": tx.get("payment_method"),
                "reference_number": tx.get("reference_number"),
            }

    for tx_id, entry in anomaly_map.items():
        for id_set, label, reason_text in anomaly_rules:
            if tx_id not in id_set:
                continue
            if label == "Mixed funds":
                conf = mixed_confidence_by_id.get(tx_id, "low")
                reason_text = (
                    f"Possible personal/business mix "
                    f"({CONFIDENCE_LABELS.get(conf, '')})."
                )
            entry["anomaly_type"].append(label)
            entry["reason"].append(reason_text)

    anomaly_transactions = []
    for entry in anomaly_map.values():
        entry["anomaly_type"] = ", ".join(entry["anomaly_type"])
        entry["reason"] = " / ".join(entry["reason"])
        anomaly_transactions.append(entry)

    return anomaly_transactions, skipped_no_id_count


# ── main entrypoint ────────────────────────────────────────────────────────

def build_report(payload: Payload) -> Dict[str, Any]:
    """Orchestrates all detection checks and assembles the final report.

    Payload keys consumed:
      transactions           — required
      invoices               — optional, defaults to []
      bank_statements        — optional, defaults to []
      supporting_documents   — optional, defaults to []
      business_billers       — optional; see detection/mixed_funds.py note
      starting_cash_balance  — optional; see detection/cash_buffer.py note
    """
    transactions: List[Transaction] = payload.get("transactions", [])
    invoices: List[Invoice] = payload.get("invoices", [])
    bank_statements: List[BankStatement] = payload.get("bank_statements", [])
    supporting_documents: List[SupportingDocument] = payload.get("supporting_documents", [])
    business_billers: List[Dict[str, Any]] = payload.get("business_billers", [])
    starting_cash_balance: Optional[float] = payload.get("starting_cash_balance")

    # ── run all checks ─────────────────────────────────────────────────────
    mixed_scored = detect_mixed_funds(transactions, business_billers)
    mixed = [tx for tx, _ in mixed_scored]
    mixed_confidence_by_id = {
        str(tx["transaction_id"]): conf
        for tx, conf in mixed_scored
        if tx.get("transaction_id")
    }
    mixed_overall_confidence: Optional[str] = max(
        (conf for _, conf in mixed_scored),
        key=lambda c: _CONFIDENCE_RANK[c],
        default=None,
    )
    mixed_confidence_safe: str = mixed_overall_confidence or "low"
    mixed_total = sum(_safe_amount(tx) for tx in mixed)

    duplicates = detect_duplicate_transactions(transactions)
    rounds = detect_round_number_payments(transactions)
    odd_amounts = detect_odd_amount_new_recipient(transactions)
    unusual = detect_unusual_transactions(transactions)
    unreconciled = detect_unreconciled(transactions)
    accounting_errors = detect_accounting_errors(transactions)
    docs_review = detect_missing_documentation(transactions, invoices, supporting_documents)
    bank_issues = detect_bank_statement_issues(bank_statements)
    cash = calculate_cash_buffer(transactions, starting_balance=starting_cash_balance)

    skipped_invalid_date = invalid_date_count(transactions)

    # ── build structured outputs ───────────────────────────────────────────
    flags = _build_flags(
        mixed=mixed,
        mixed_total=mixed_total,
        mixed_confidence_safe=mixed_confidence_safe,
        duplicates=duplicates,
        rounds=rounds,
        odd_amounts=odd_amounts,
        unusual=unusual,
        unreconciled=unreconciled,
        accounting_errors=accounting_errors,
        docs_review=docs_review,
        bank_issues=bank_issues,
        cash=cash,
    )

    anomaly_transactions, skipped_no_id = _build_anomaly_feed(
        mixed=mixed,
        mixed_confidence_by_id=mixed_confidence_by_id,
        duplicates=duplicates,
        rounds=rounds,
        odd_amounts=odd_amounts,
        unusual=unusual,
        unreconciled=unreconciled,
    )

    data_quality = _build_data_quality(
        skipped_no_id_count=skipped_no_id,
        skipped_invalid_date_count=skipped_invalid_date,
        cash=cash,
        accounting_errors=accounting_errors,
    )

    branches = {tx.get("branch") for tx in transactions}

    return {
        # ── cash summary ───────────────────────────────────────────────────
        "cash_buffer_days": cash["buffer_days"],
        "cash_buffer_risk_level": cash["risk_level"],
        "total_cash_outflows": cash["total_out"],
        "total_cash_inflows": cash["total_in"],
        # ── flags (data-driven, see _build_flags) ─────────────────────────
        "flags": flags,
        # ── mixed-funds summary ────────────────────────────────────────────
        "mixed_funds_count": len(mixed),
        "mixed_funds_total": mixed_total,
        # ── per-instance anomaly feed ──────────────────────────────────────
        "anomaly_transactions": anomaly_transactions,
        # ── data quality (formalized, see _build_data_quality) ────────────
        "data_quality": data_quality,
        # ── plain-language summary ─────────────────────────────────────────
        "plain_language": [
            f"This report reviews {len(branches)} branch(es) for the month and "
            f"highlights risk areas before the next investor update.",
            (
                f"{len(mixed)} transactions look like they might mix personal and "
                f"business spending — worth a quick check, not a verdict."
                if mixed
                else "No personal/business mixing was detected this period."
            ),
            (
                f"{len(duplicates)} possible duplicate payments were found."
                if duplicates
                else "No duplicate payment patterns were flagged."
            ),
            (
                f"{len(odd_amounts)} unusually precise payments went to brand-new recipients."
                if odd_amounts
                else "No odd-amount/new-recipient payments stood out."
            ),
            (
                f"Supporting documents are incomplete: {docs_review['missing_documents']} "
                f"expense docs and {docs_review['invoice_documents_missing']} invoice docs missing."
                if docs_review["missing_documents"] or docs_review["invoice_documents_missing"]
                else "Supporting documents are complete for the reviewed period."
            ),
            f"Cash buffer is about {cash['buffer_days']} days ({cash['risk_level']} risk). "
            f"{cash['limitation_note']}",
        ],
        # ── follow-up workflow ─────────────────────────────────────────────
        "followup_workflow": [
            {
                "title": "Review unreconciled transactions",
                "action": "Match all unreconciled transactions against bank statements and supporting documents.",
                "role": "accountant",
            },
            {
                "title": "Validate possible mixed spend",
                "action": "Look at flagged personal/business transactions together and confirm or reclassify them — these are leads, not conclusions.",
                "role": "founder",
            },
            {
                "title": "Confirm supporting documents",
                "action": "Collect missing receipts, supplier invoices and contracts for large expenses.",
                "role": "accountant",
            },
            {
                "title": "Follow up overdue invoices",
                "action": "Contact customers for unpaid invoices and reconcile receipts with recorded sales.",
                "role": "founder",
            },
            {
                "title": "Check reference number gaps",
                "action": "Confirm whether sequence gaps are voided entries or genuinely missing records.",
                "role": "accountant",
            },
        ],
        "missing_information_checklist": [
            "Review unreconciled transactions and match them to bank statements.",
            "Look at possible mixed personal/business payments and confirm or reclassify them.",
            "Collect missing supporting documents for large expenses and invoices.",
            "Reconcile bank statements that still show unreconciled items.",
            "Confirm whether reference-number gaps are voided entries or missing records.",
        ],
        # ── supporting document detail ─────────────────────────────────────
        "supporting_document_review": {
            "expected_documents": docs_review["expected_documents"],
            "missing_documents": docs_review["missing_documents"],
            "invoice_documents_missing": docs_review["invoice_documents_missing"],
            "summary": (
                f"{docs_review['missing_documents']} expense docs and "
                f"{docs_review['invoice_documents_missing']} invoice docs are "
                f"missing or unavailable."
            ),
        },
        # ── accounting errors detail ───────────────────────────────────────
        "accounting_errors": {
            "sequence_gaps_found": accounting_errors["sequence_gaps_found"],
            "gap_details": accounting_errors["gap_details"],
            # limitation_note lives in data_quality.limitation_notes now;
            # kept here too for backward compatibility with existing consumers.
            "limitation_note": accounting_errors["limitation_note"],
        },
    }