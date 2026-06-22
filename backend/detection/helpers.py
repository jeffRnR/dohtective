"""
detection/helpers.py
Shared defensive parsing utilities used across all detection modules.

All helpers follow the same contract: never raise on malformed data.
Return a safe fallback (None, 0.0, empty list) and let callers count
what was excluded — the same pattern _safe_id() established in the
original engine.py for missing transaction IDs, extended here to dates
and amounts.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

Transaction = Dict[str, Any]


def parse_date(value: Optional[str]) -> Optional[datetime]:
    """Returns None for missing/malformed dates instead of raising.

    Previously: datetime.fromisoformat() called directly at each sort
    site, and tx["date"] used instead of tx.get("date") — so one
    malformed row anywhere crashed the whole report. A bad date should
    be excluded and surfaced in data_quality, not take down the engine.
    """
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _safe_amount(tx: Transaction) -> float:
    """Returns 0.0 for missing or non-numeric amounts.

    Prevents TypeError from comparisons like `amount >= 200000` when a
    CSV upload delivers amount as a string (e.g. "47,832" with a comma).
    """
    value = tx.get("amount", 0)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_id(tx: Transaction) -> Optional[str]:
    """Returns None for a missing/unusable transaction_id.

    A None transaction_id silently becomes the string key "None" in a
    dict, merging unrelated transactions together. That's a data-integrity
    bug, not a type-checker nitpick, even though Python wouldn't crash.
    Callers count how many were skipped and surface the count in
    data_quality rather than dropping them silently.
    """
    tx_id = tx.get("transaction_id")
    return str(tx_id) if tx_id else None


def transactions_with_valid_dates(transactions: List[Transaction]) -> List[Transaction]:
    """Filters out transactions whose date can't be parsed.

    Used by any check that sorts or diffs by date. Centralises the
    exclusion at the point of use so individual checks don't need to
    remember that tx["date"] can throw.
    """
    return [tx for tx in transactions if parse_date(tx.get("date")) is not None]


def invalid_date_count(transactions: List[Transaction]) -> int:
    """Count of transactions excluded from date-dependent checks."""
    return sum(1 for tx in transactions if parse_date(tx.get("date")) is None)