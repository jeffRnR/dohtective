"""
backend/engine.py
AI Financial Controller detection engine — Kuzana x MiniHack Bounty 1.

This is the canonical detection engine. It supersedes any earlier draft
that used keyword-only mixed-funds matching — that version could not catch
the actual anomaly type the brief is built around (a recurring utility
payment with no keyword in it at all). See CHANGELOG comments inline for
exactly what was fixed and why, so the reasoning survives the edit.

Invocation (unchanged from the original):
    python engine.py <path-to-payload.json>
    python engine.py < payload.json   (stdin)

Output: structured JSON report on stdout, matching the ReportData contract
the Next.js frontend consumes.
"""

import json
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

Transaction = Dict[str, Any]
Invoice = Dict[str, Any]
BankStatement = Dict[str, Any]
SupportingDocument = Dict[str, Any]
Payload = Dict[str, Any]


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value)


# ─────────────────────────────────────────────────────────────────────────
# CHECK 1 — MIXED PERSONAL / BUSINESS FUNDS  ("the wedge" — build best)
#
# CHANGELOG: the previous version was a keyword search on description/
# account/category/contact text for words like "personal" or "owner draw".
# That is NOT what Section 3.2 of the build plan specs, and — more
# importantly — it cannot catch the seeded anomaly type the whole brief is
# built around: a recurring utility-style payment (e.g. "KPLC", KES 4,500)
# that hides BECAUSE it looks like a normal business bill, with no
# "personal" keyword anywhere in it. Run the old code against that
# transaction and it returns zero hits.
#
# Fixed logic, matching the real spec: flag recurring payments to
# utility/telco-pattern billers where there's no business justification on
# file for that biller/account-reference combination, OR where the keyword
# signal (explicit "owner draw" etc.) is present. Two independent signals,
# confidence-scored separately, rolled up to one flag per transaction.
# ─────────────────────────────────────────────────────────────────────────

PERSONAL_KEYWORD_PATTERNS = ["personal", "owner draw", "owner", "personal wallet"]

# Billers whose NAME pattern is "personal-shaped" even on a business
# till — utilities, telco postpaid, school fees, insurance. A payment to
# one of these is only legitimate if the business has an on-file reason
# for it (a registered branch account reference, a known business line).
PERSONAL_PATTERN_BILLER_KEYWORDS = [
    "kplc", "kenya power", "nairobi water", "water co", "dstv", "gotv",
    "school", "academy", "fees", "nhif", "insurance", "safaricom postpaid",
]


def _business_justification_exists(tx: Transaction, business_billers: List[Dict[str, Any]]) -> bool:
    """True if this transaction's recipient/account reference matches a
    biller the business has explicitly registered as legitimate (e.g. the
    CBD branch's own KPLC account). Falls back to False (no justification
    on file) if the business profile doesn't include billers at all —
    err toward flagging-for-review, not silently trusting unknown billers."""
    if not business_billers:
        return False
    contact = str(tx.get("contact_name", "")).lower()
    account_ref = str(tx.get("reference_number", "")) + str(tx.get("notes", ""))
    for biller in business_billers:
        name_match = str(biller.get("name", "")).lower() in contact or contact in str(biller.get("name", "")).lower()
        ref_match = biller.get("account_ref") and str(biller["account_ref"]) in account_ref
        if name_match and (ref_match or not biller.get("account_ref")):
            return True
    return False


def detect_mixed_funds(
    transactions: List[Transaction],
    business_billers: Optional[List[Dict[str, Any]]] = None,
) -> List[Tuple[Transaction, str]]:
    """Returns list of (transaction, confidence) tuples. confidence in
    {"high", "medium", "low"}."""
    business_billers = business_billers or []
    scored: List[Tuple[Transaction, str]] = []

    for tx in transactions:
        haystack = " ".join(
            str(tx.get(key, "")).lower()
            for key in ["description", "account_name", "category_name", "contact_name"]
        )

        has_keyword = any(pattern in haystack for pattern in PERSONAL_KEYWORD_PATTERNS)
        looks_like_personal_pattern_biller = any(kw in haystack for kw in PERSONAL_PATTERN_BILLER_KEYWORDS)
        has_justification = _business_justification_exists(tx, business_billers) if looks_like_personal_pattern_biller else True

        is_owner_draw_account = "owner draw" in str(tx.get("account_name", "")).lower() or "owner draw" in str(tx.get("category_name", "")).lower()
        is_unreconciled = tx.get("is_reconciled") is False

        if not has_keyword and not (looks_like_personal_pattern_biller and not has_justification):
            continue  # neither signal fired — not flagged

        # Confidence tiering (Section 3.2): structural signal (owner-draw
        # account + unreconciled) beats a loose text match; an unjustified
        # personal-pattern biller payment is treated as at least medium
        # confidence even with no keyword present at all, since this is
        # exactly the disguised case the spec calls out.
        if is_owner_draw_account and is_unreconciled:
            confidence = "high"
        elif looks_like_personal_pattern_biller and not has_justification:
            confidence = "medium"
        elif is_owner_draw_account or is_unreconciled:
            confidence = "medium"
        else:
            confidence = "low"

        scored.append((tx, confidence))

    return scored


# ─────────────────────────────────────────────────────────────────────────
# CHECK 2 — DUPLICATE / ROUND-NUMBER / ODD-AMOUNT TRANSACTIONS
#
# CHANGELOG: true-duplicate detection (2a) was already close to spec and is
# kept as-is. Added: a branch for the "oddly precise amount to a brand-new
# recipient" anomaly type (Section 2.5, anomaly #3) — the previous version
# only handled round numbers and could never catch a non-round amount like
# KES 47,832 to an unfamiliar till, under any threshold.
# ─────────────────────────────────────────────────────────────────────────

def detect_duplicate_transactions(transactions: List[Transaction]) -> List[Transaction]:
    groups: Dict[str, List[Transaction]] = {}
    for tx in transactions:
        key = f"{tx.get('contact_name')}|{tx.get('amount')}|{tx.get('branch')}|{tx.get('type')}"
        groups.setdefault(key, []).append(tx)

    duplicates: List[Transaction] = []
    for bucket in groups.values():
        if len(bucket) < 2:
            continue
        sorted_bucket = sorted(bucket, key=lambda tx: parse_date(tx["date"]))
        gaps = [
            (parse_date(sorted_bucket[i]["date"]) - parse_date(sorted_bucket[i - 1]["date"])).days
            for i in range(1, len(sorted_bucket))
        ]
        if len(sorted_bucket) >= 3 and all(g >= 6 for g in gaps):
            continue  # established recurring cadence, not a duplicate-entry anomaly
        for i, gap in enumerate(gaps, start=1):
            if gap <= 5:
                duplicates.append(sorted_bucket[i - 1])
                duplicates.append(sorted_bucket[i])

    unique_duplicates = {tx.get("transaction_id"): tx for tx in duplicates if tx.get("transaction_id")}
    return list(unique_duplicates.values())


def detect_round_number_payments(transactions: List[Transaction]) -> List[Transaction]:
    recurring_round_categories = {"Rent", "Payroll"}
    seen_count: Dict[str, int] = {}
    flagged: List[Transaction] = []
    ordered = sorted(transactions, key=lambda tx: parse_date(tx["date"]))

    for tx in ordered:
        contact = tx.get("contact_name", "")
        prior = seen_count.get(contact, 0)
        seen_count[contact] = prior + 1
        if tx.get("type") != "Expense":
            continue
        amount = tx.get("amount", 0)
        if amount < 50000 or amount % 10000 != 0:
            continue
        if tx.get("category_name") in recurring_round_categories:
            continue
        if prior < 2:
            flagged.append(tx)

    return flagged


def detect_odd_amount_new_recipient(transactions: List[Transaction]) -> List[Transaction]:
    """NEW — Section 2.5 anomaly #3: an oddly precise (non-round) payment
    to a recipient with no prior transaction history. Round-number
    detection above structurally cannot catch this case; it needs its own
    rule, not a threshold tweak on the existing one."""
    seen_count: Dict[str, int] = {}
    flagged: List[Transaction] = []
    ordered = sorted(transactions, key=lambda tx: parse_date(tx["date"]))

    for tx in ordered:
        contact = tx.get("contact_name", "")
        prior = seen_count.get(contact, 0)
        seen_count[contact] = prior + 1
        if tx.get("type") != "Expense":
            continue
        amount = tx.get("amount", 0)
        is_round = amount % 500 == 0
        is_brand_new_recipient = prior == 0
        is_meaningful_amount = amount >= 10000  # filter out small petty-cash noise
        if not is_round and is_brand_new_recipient and is_meaningful_amount:
            flagged.append(tx)

    return flagged


def detect_unusual_transactions(transactions: List[Transaction]) -> List[Transaction]:
    """CHANGELOG: narrowed the regex. The old pattern matched bare
    'transfer', which fires on almost any bank-transfer transaction
    description, including the payment_method value itself if it ever
    leaks into description text. Now requires a more specific phrase."""
    odd_pattern = re.compile(
        r"(one-off|one off|setup fee|unusual transfer|miscellaneous)", re.IGNORECASE
    )
    results = []
    for tx in transactions:
        large_expense = tx.get("type") == "Expense" and tx.get("amount", 0) >= 200000
        odd_description = bool(odd_pattern.search(str(tx.get("description", ""))))
        if large_expense or odd_description:
            results.append(tx)
    return results


def detect_unreconciled(transactions: List[Transaction]) -> List[Transaction]:
    return [tx for tx in transactions if not tx.get("is_reconciled", False)]


# ─────────────────────────────────────────────────────────────────────────
# CHECK 3 — ACCOUNTING ERRORS / MISSING ENTRIES
#
# CHANGELOG: did not exist at all in the previous version (detect_unreconciled
# was doing different, valid, but separate work). Implements the spec:
# sequence-gap detection on reference numbers, plus a running-balance
# consistency note. Honest about its ceiling (Build Plan Section 3.4): this
# can only detect internal inconsistency, not confirm what's actually
# missing — that needs a real chart of accounts.
# ─────────────────────────────────────────────────────────────────────────

_REF_NUMBER_PATTERN = re.compile(r"^([A-Za-z\-]*?)(\d+)$")


def detect_accounting_errors(transactions: List[Transaction]) -> Dict[str, Any]:
    """CHANGELOG (post-test-run fix): the first version extracted trailing
    digits from EVERY reference number and diffed them as one global
    sequence — but 'INV-0011' and 'HOME-KIASI-9981' are different ID
    schemes entirely, not adjacent points on one number line. Diffing
    across schemes produced nonsense gap counts (six figures, in testing).
    Fixed: group by the non-numeric PREFIX first (e.g. 'INV-', 'REF-'),
    and only look for sequence gaps within the same prefix family. A
    business using one consistent invoice-numbering scheme will still get
    real gap detection; mixed-format reference numbers (utility account
    refs, ad-hoc till references) are correctly excluded rather than
    polluting the sequence."""
    by_prefix: Dict[str, List[Tuple[int, str]]] = {}
    for tx in transactions:
        ref = str(tx.get("reference_number", ""))
        match = _REF_NUMBER_PATTERN.match(ref)
        if not match:
            continue
        prefix, digits = match.group(1), match.group(2)
        # Require at least 3 digits — short numeric suffixes (account refs
        # like "001", "9981" used as IDs rather than sequence counters) are
        # too easily mistaken for a real sequence; this is a heuristic
        # threshold, not a guarantee, and should be tuned with real data.
        if len(digits) < 4:
            continue
        by_prefix.setdefault(prefix, []).append((int(digits), ref))

    gaps_found = []
    for prefix, refs in by_prefix.items():
        if len(refs) < 2:
            continue
        refs.sort(key=lambda pair: pair[0])
        for i in range(1, len(refs)):
            prev_num, prev_ref = refs[i - 1]
            curr_num, curr_ref = refs[i]
            gap_size = curr_num - prev_num - 1
            # Cap how large a single "gap" we'll report — a huge jump
            # almost always means two unrelated numbering schemes slipped
            # past the prefix grouping, not 9,000 missing invoices.
            if 0 < gap_size <= 50:
                gaps_found.append({"between": [prev_ref, curr_ref], "missing_count": gap_size})

    return {
        "sequence_gaps_found": len(gaps_found),
        "gap_details": gaps_found[:5],
        # Honest ceiling, stated explicitly rather than implied — Section 3.4.
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
    docs_by_tx = {doc.get("linked_transaction_id"): doc for doc in documents if doc.get("linked_transaction_id")}
    missing = []
    expected_count = 0
    for tx in transactions:
        if tx.get("type") != "Expense":
            continue
        if tx.get("amount", 0) < 30000:
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

    unpaid_invoices = [inv for inv in invoices if inv.get("balance", 0) > 0 and inv.get("status") != "Paid"]
    missing_invoice_docs = [inv for inv in unpaid_invoices if not any(doc.get("invoice_id") == inv.get("invoice_id") for doc in documents)]

    return {
        "expected_documents": expected_count,
        "missing_documents": len(missing),
        "invoice_documents_missing": len(missing_invoice_docs),
        "details": missing[:5],
    }


def detect_bank_statement_issues(statements: List[BankStatement]) -> List[BankStatement]:
    return [stmt for stmt in statements if not stmt.get("reconciled", False)]


# ─────────────────────────────────────────────────────────────────────────
# CHECK 4 — CASH FLOW RISK (liquidity stress proxy)
#
# CHANGELOG: real math bug fixed. The old version divided the FULL-PERIOD
# outflow total by a hardcoded 30, regardless of how many days the dataset
# actually spans — a 75-day dataset overstated daily burn by ~2.5x. It also
# never netted inflows against outflows, using gross spend instead of net
# burn. Net effect: a profitable or break-even business could get flagged
# "tight" purely from this bug. Fixed: real period length, net burn rate,
# and a three-tier risk band (high/medium/low) instead of a single cutoff,
# matching the build plan's spec.
# ─────────────────────────────────────────────────────────────────────────

def calculate_cash_buffer(transactions: List[Transaction]) -> Dict[str, Any]:
    if not transactions:
        return {"total_in": 0, "total_out": 0, "buffer_days": 0, "risk_level": "unknown",
                "limitation_note": "No transactions in the period — cannot estimate cash buffer."}

    inflows = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "Income")
    outflows = sum(tx.get("amount", 0) for tx in transactions if tx.get("type") == "Expense")

    dated = sorted(transactions, key=lambda tx: parse_date(tx["date"]))
    period_days = max(1, (parse_date(dated[-1]["date"]) - parse_date(dated[0]["date"])).days + 1)

    # Net daily burn = (outflows - inflows) / actual period length, not a
    # hardcoded 30. If the business is net cash-positive over the period,
    # net_burn is negative or zero — runway is effectively unbounded by
    # this proxy, which is the correct behavior, not a bug to suppress.
    net_burn_per_day = (outflows - inflows) / period_days

    starting_balance = 250000  # same assumption used by the mock seed script — keep in sync
    running_balance = starting_balance
    for tx in dated:
        running_balance += tx.get("amount", 0) if tx.get("type") == "Income" else -tx.get("amount", 0)
    available_cash = max(0, running_balance)

    if net_burn_per_day > 0:
        buffer_days = round(available_cash / net_burn_per_day)
    else:
        buffer_days = 9999  # net cash-positive — represent as "effectively unbounded", capped for display

    risk_level = "high" if buffer_days < 14 else "medium" if buffer_days < 30 else "low"

    return {
        "total_in": inflows,
        "total_out": outflows,
        "buffer_days": min(buffer_days, 9999),
        "risk_level": risk_level,
        # Stated proactively, per Section 3.5 — this is a trailing-burn
        # proxy, not a true receivables-aging model. Surfaced in output so
        # the frontend/pitch can show it, not just hide it in code comments.
        "limitation_note": (
            "This is a trailing-burn estimate based on the last "
            f"{period_days} days, not a forward-looking model. It can't see "
            "a large payment due next week that hasn't happened yet."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────
# REPORT ASSEMBLY
# ─────────────────────────────────────────────────────────────────────────

CONFIDENCE_LABELS = {
    "high": "We're quite sure — act on this now",
    "medium": "Worth a look when you get a chance",
    "low": "Probably nothing, just flagging it",
}


def build_report(payload: Payload) -> Dict[str, Any]:
    transactions = payload.get("transactions", [])
    invoices = payload.get("invoices", [])
    bank_statements = payload.get("bank_statements", [])
    supporting_documents = payload.get("supporting_documents", [])
    business_billers = payload.get("business_billers", [])  # NEW input — see note at bottom of file

    mixed_scored = detect_mixed_funds(transactions, business_billers)
    mixed = [tx for tx, _ in mixed_scored]
    mixed_confidence_by_id = {
        str(tx["transaction_id"]): conf for tx, conf in mixed_scored if tx.get("transaction_id")
    }
    rank = {"high": 3, "medium": 2, "low": 1}
    mixed_overall_confidence = max((conf for _, conf in mixed_scored), key=lambda c: rank[c], default=None)

    duplicates = detect_duplicate_transactions(transactions)
    rounds = detect_round_number_payments(transactions)
    odd_amounts = detect_odd_amount_new_recipient(transactions)
    unusual = detect_unusual_transactions(transactions)
    unreconciled = detect_unreconciled(transactions)
    accounting_errors = detect_accounting_errors(transactions)
    docs_review = detect_missing_documentation(transactions, invoices, supporting_documents)
    bank_issues = detect_bank_statement_issues(bank_statements)
    cash = calculate_cash_buffer(transactions)

    flags = []
    if mixed:
        mixed_confidence_safe: str = mixed_overall_confidence if mixed_overall_confidence else "low"
        flags.append({
            "title": "Possible mixed personal and business funds — needs review",
            "detail": (
                f"{len(mixed)} transaction(s) totalling KES {sum(tx.get('amount', 0) for tx in mixed):,} "
                f"look like they might mix personal and business spending. This isn't an accusation — "
                f"it's a list of things worth a quick check with your bookkeeper."
            ),
            "severity": mixed_confidence_safe,
            "confidence": mixed_confidence_safe,
            "confidenceLabel": CONFIDENCE_LABELS.get(mixed_confidence_safe, CONFIDENCE_LABELS["low"]),
        })
    if duplicates:
        flags.append({
            "title": "Possible duplicate payments — needs review",
            "detail": (
                f"{len(duplicates)} transactions look like they might be accidental repeat payments "
                f"within a 5-day window. Could be a genuine re-order — worth a quick check."
            ),
            "severity": "high",
        })
    if rounds:
        flags.append({
            "title": "Round-number payments to unfamiliar recipients",
            "detail": f"{len(rounds)} large round-number expenses went to recipients you've rarely paid before. Probably fine, worth a glance.",
            "severity": "medium",
        })
    if odd_amounts:
        flags.append({
            "title": "Unusually precise payments to brand-new recipients",
            "detail": f"{len(odd_amounts)} payments with oddly specific amounts went to recipients with no prior history. Worth confirming these are legitimate.",
            "severity": "medium",
        })
    if unusual:
        flags.append({
            "title": "Unusual transactions detected",
            "detail": f"{len(unusual)} transactions are unusually large or describe a one-off charge.",
            "severity": "medium",
        })
    if unreconciled:
        flags.append({
            "title": "Unreconciled entries present",
            "detail": f"{len(unreconciled)} transactions are not reconciled.",
            "severity": "medium",
        })
    if accounting_errors["sequence_gaps_found"] > 0:
        flags.append({
            "title": "Reference number sequence has gaps",
            "detail": (
                f"{accounting_errors['sequence_gaps_found']} gap(s) found in your reference numbering — "
                f"could mean a missing entry, or just a voided one. {accounting_errors['limitation_note']}"
            ),
            "severity": "medium",
        })
    if docs_review["missing_documents"] > 0 or docs_review["invoice_documents_missing"] > 0:
        flags.append({
            "title": "Supporting documents incomplete",
            "detail": f"{docs_review['missing_documents']} expense documents and {docs_review['invoice_documents_missing']} invoice documents are missing or unavailable.",
            "severity": "high" if docs_review["missing_documents"] + docs_review["invoice_documents_missing"] > 1 else "medium",
        })
    if bank_issues:
        flags.append({
            "title": "Bank statement not fully reconciled",
            "detail": f"{len(bank_issues)} bank statement(s) still show unreconciled items.",
            "severity": "medium",
        })
    if cash["risk_level"] in ("high", "medium"):
        flags.append({
            "title": "Cash buffer needs attention" if cash["risk_level"] == "high" else "Cash buffer worth watching",
            "detail": f"Estimated cash buffer is {cash['buffer_days']} days. {cash['limitation_note']}",
            "severity": cash["risk_level"],
        })

    # ── per-instance anomaly feed — unchanged shape, extended with new checks ──
    anomaly_transactions = []
    anomaly_map: Dict[str, Dict[str, Any]] = {}

    def _safe_id(tx: Transaction) -> Optional[str]:
        """transaction_id should always be present, but real-world data
        (a malformed upload, a bad CSV row) can break that assumption.
        Returns None for anything unusable, rather than letting a None
        silently become a dict key that merges unrelated transactions
        together — that's a data-integrity bug, not a type-checker
        nitpick, even though Python wouldn't crash on it at runtime."""
        tx_id = tx.get("transaction_id")
        return str(tx_id) if tx_id else None

    mixed_ids = {tid for tx in mixed if (tid := _safe_id(tx))}
    duplicate_ids = {tid for tx in duplicates if (tid := _safe_id(tx))}
    round_ids = {tid for tx in rounds if (tid := _safe_id(tx))}
    odd_amount_ids = {tid for tx in odd_amounts if (tid := _safe_id(tx))}
    unusual_ids = {tid for tx in unusual if (tid := _safe_id(tx))}
    unreconciled_ids = {tid for tx in unreconciled if (tid := _safe_id(tx))}

    skipped_no_id_count = 0
    for tx in mixed + duplicates + rounds + odd_amounts + unusual + unreconciled:
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
        entry = anomaly_map[tx_id]
        if tx_id in mixed_ids and "Mixed funds" not in entry["anomaly_type"]:
            conf = mixed_confidence_by_id.get(tx_id, "low")
            entry["anomaly_type"].append("Mixed funds")
            entry["reason"].append(f"Possible personal/business mix ({CONFIDENCE_LABELS.get(conf, '')}).")
        if tx_id in duplicate_ids and "Duplicate transaction" not in entry["anomaly_type"]:
            entry["anomaly_type"].append("Duplicate transaction")
            entry["reason"].append("Potential duplicate supplier payment within 5 days — needs review, not confirmed.")
        if tx_id in round_ids and "Round-number payment" not in entry["anomaly_type"]:
            entry["anomaly_type"].append("Round-number payment")
            entry["reason"].append("Large round-number expense to an unfamiliar recipient.")
        if tx_id in odd_amount_ids and "Odd amount, new recipient" not in entry["anomaly_type"]:
            entry["anomaly_type"].append("Odd amount, new recipient")
            entry["reason"].append("Unusually precise amount paid to a brand-new recipient.")
        if tx_id in unusual_ids and "Unusual transaction" not in entry["anomaly_type"]:
            entry["anomaly_type"].append("Unusual transaction")
            entry["reason"].append("One-off or unusually large expense description detected.")
        if tx_id in unreconciled_ids and "Unreconciled entry" not in entry["anomaly_type"]:
            entry["anomaly_type"].append("Unreconciled entry")
            entry["reason"].append("Transaction not marked as reconciled in the books.")

    for entry in anomaly_map.values():
        entry["anomaly_type"] = ", ".join(dict.fromkeys(entry["anomaly_type"]))
        entry["reason"] = " / ".join(dict.fromkeys(entry["reason"]))
        anomaly_transactions.append(entry)

    branches = {tx.get("branch") for tx in transactions}
    return {
        "cash_buffer_days": cash["buffer_days"],
        "cash_buffer_risk_level": cash["risk_level"],
        "total_cash_outflows": cash["total_out"],
        "total_cash_inflows": cash["total_in"],
        "flags": flags,
        "mixed_funds_count": len(mixed),
        "mixed_funds_total": sum(tx.get("amount", 0) for tx in mixed),
        # Data-quality signal, not a detection result: transactions flagged
        # by a check but missing a usable transaction_id can't be placed in
        # the per-instance anomaly feed below. Surfaced here rather than
        # silently dropped, so a malformed-data problem is visible in the
        # report instead of just quietly shrinking the anomaly list.
        "skipped_malformed_transaction_count": skipped_no_id_count,
        "plain_language": [
            f"This report reviews {len(branches)} branch(es) for the month and highlights risk areas before the next investor update.",
            (f"{len(mixed)} transactions look like they might mix personal and business spending — worth a quick check, not a verdict."
             if mixed else "No personal/business mixing was detected this period."),
            (f"{len(duplicates)} possible duplicate payments were found." if duplicates else "No duplicate payment patterns were flagged."),
            (f"{len(odd_amounts)} unusually precise payments went to brand-new recipients." if odd_amounts else "No odd-amount/new-recipient payments stood out."),
            (f"Supporting documents are incomplete: {docs_review['missing_documents']} expense docs and {docs_review['invoice_documents_missing']} invoice docs missing."
             if docs_review["missing_documents"] or docs_review["invoice_documents_missing"] else "Supporting documents are complete for the reviewed period."),
            f"Cash buffer is about {cash['buffer_days']} days ({cash['risk_level']} risk). {cash['limitation_note']}",
        ],
        "followup_workflow": [
            {"title": "Review unreconciled transactions", "action": "Match all unreconciled transactions against bank statements and supporting documents.", "role": "accountant"},
            {"title": "Validate possible mixed spend", "action": "Look at flagged personal/business transactions together and confirm or reclassify them — these are leads, not conclusions.", "role": "founder"},
            {"title": "Confirm supporting documents", "action": "Collect missing receipts, supplier invoices and contracts for large expenses.", "role": "accountant"},
            {"title": "Follow up overdue invoices", "action": "Contact customers for unpaid invoices and reconcile receipts with recorded sales.", "role": "founder"},
            {"title": "Check reference number gaps", "action": "Confirm whether sequence gaps are voided entries or genuinely missing records.", "role": "accountant"},
        ],
        "missing_information_checklist": [
            "Review unreconciled transactions and match them to bank statements.",
            "Look at possible mixed personal/business payments and confirm or reclassify them.",
            "Collect missing supporting documents for large expenses and invoices.",
            "Reconcile bank statements that still show unreconciled items.",
            "Confirm whether reference-number gaps are voided entries or missing records.",
        ],
        "anomaly_transactions": anomaly_transactions,
        "supporting_document_review": {
            "expected_documents": docs_review["expected_documents"],
            "missing_documents": docs_review["missing_documents"],
            "invoice_documents_missing": docs_review["invoice_documents_missing"],
            "summary": f"{docs_review['missing_documents']} expense docs and {docs_review['invoice_documents_missing']} invoice docs are missing or unavailable.",
        },
        "accounting_errors": accounting_errors,
    }


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as fd:
            payload = json.load(fd)
    else:
        payload = json.load(sys.stdin)

    report = build_report(payload)
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()


# ─────────────────────────────────────────────────────────────────────────
# NOTE ON A NEW REQUIRED INPUT: business_billers
#
# Fixing Check 1 to match spec required adding an optional `business_billers`
# key to the payload (list of {name, account_ref} the business has
# registered as legitimate — e.g. each branch's own KPLC account). Without
# it, the function still runs and still flags personal-pattern billers, but
# treats EVERY such payment as having no justification on file (conservative
# default — flag for review rather than silently trust). Wire this from
# business_profile.py's legitimate_business_billers list when calling this
# engine from the seed pipeline, or the legitimate utility payments in your
# mock data will get flagged as medium-confidence mixed-funds, which is a
# false positive you don't want in a demo.
# ─────────────────────────────────────────────────────────────────────────