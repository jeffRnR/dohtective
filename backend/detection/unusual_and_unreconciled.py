"""
detection/unusual_and_unreconciled.py
Ancillary checks: unusual transaction descriptions and unreconciled entries.

These two checks are structurally simple enough to live together without
a dedicated module each.

CHANGELOG — unusual transaction regex:
The original pattern matched bare 'transfer', which fires on almost any
bank-transfer description, including the payment_method field if it ever
leaks into description text. Narrowed to require a more specific phrase
("unusual transfer") so legitimate EFT/RTGS entries don't generate noise.
"""

import re
from typing import List

from .helpers import Transaction, _safe_amount

_ODD_PATTERN = re.compile(
    r"(one-off|one off|setup fee|unusual transfer|miscellaneous)",
    re.IGNORECASE,
)


def detect_unusual_transactions(transactions: List[Transaction]) -> List[Transaction]:
    """Flags transactions that are unusually large or describe a one-off charge.

    Two independent signals — either one is sufficient to flag:
      (a) Any Expense ≥ KES 200,000 (large-expense threshold).
      (b) Description matching the one-off / setup-fee pattern above.
    """
    results = []
    for tx in transactions:
        large_expense = tx.get("type") == "Expense" and _safe_amount(tx) >= 200_000
        odd_description = bool(_ODD_PATTERN.search(str(tx.get("description", ""))))
        if large_expense or odd_description:
            results.append(tx)
    return results


def detect_unreconciled(transactions: List[Transaction]) -> List[Transaction]:
    """Returns all transactions not marked as reconciled in the books."""
    return [tx for tx in transactions if not tx.get("is_reconciled", False)]