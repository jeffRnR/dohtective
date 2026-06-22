"""
detection/duplicates_and_amounts.py
Check 2 — Duplicate payments, round-number payments, and odd-amount
new-recipient payments.

Three structurally distinct anomaly types that all live in the "amount
pattern" family:

  2a. True duplicates  — same contact/amount/branch/type within 5 days.
  2b. Round-number     — large round-number expense to an unfamiliar
                         recipient (≥ KES 50,000, % 10,000 == 0).
  2c. Odd-amount/new   — oddly precise (non-round) payment to a brand-new
                         recipient. Round-number detection can never catch
                         this case (e.g. KES 47,832 to an unknown till);
                         it needs its own rule, not a threshold tweak.

KNOWN LIMITATION — None-as-"None" in grouping key:
The duplicate-detection key f"{contact}|{amount}|{branch}|{type}" uses
Python's default str() conversion for missing values, so a missing
contact_name becomes the literal string "None". This is mostly harmless
(it groups "None-contact" transactions together, which is conservative
rather than wrong) but worth knowing if you ever see unexpected clusters
of transactions with no contact name treated as potential duplicates of
each other.
"""

from datetime import datetime
from typing import Any, Dict, List

from .helpers import Transaction, _safe_amount, transactions_with_valid_dates, parse_date

# Fallback used only as a sort key sentinel — transactions_with_valid_dates()
# strips unparsable dates before every sort, so this branch never fires at
# runtime. The `or datetime.min` is purely to satisfy Pylance: parse_date()
# returns datetime | None, and sorted()'s key must return SupportsRichComparison,
# which None does not satisfy.
_DATE_FALLBACK = datetime.min


def detect_duplicate_transactions(transactions: List[Transaction]) -> List[Transaction]:
    """Flags transactions that appear to be accidental repeat payments.

    A "duplicate" here means: same contact/amount/branch/type appearing
    twice or more within a 5-day window. Three or more occurrences with
    all gaps ≥ 6 days are treated as an established recurring cadence
    (e.g. a weekly standing order) and excluded.
    """
    transactions = transactions_with_valid_dates(transactions)

    groups: Dict[str, List[Transaction]] = {}
    for tx in transactions:
        key = (
            f"{tx.get('contact_name')}|{tx.get('amount')}"
            f"|{tx.get('branch')}|{tx.get('type')}"
        )
        groups.setdefault(key, []).append(tx)

    duplicates: List[Transaction] = []
    for bucket in groups.values():
        if len(bucket) < 2:
            continue
        sorted_bucket = sorted(bucket, key=lambda tx: parse_date(tx.get("date")) or _DATE_FALLBACK)
        gaps = [
            (
                (parse_date(sorted_bucket[i]["date"]) or _DATE_FALLBACK)
                - (parse_date(sorted_bucket[i - 1]["date"]) or _DATE_FALLBACK)
            ).days
            for i in range(1, len(sorted_bucket))
        ]
        # Established recurring cadence — not a duplicate anomaly.
        if len(sorted_bucket) >= 3 and all(g >= 6 for g in gaps):
            continue
        for i, gap in enumerate(gaps, start=1):
            if gap <= 5:
                duplicates.append(sorted_bucket[i - 1])
                duplicates.append(sorted_bucket[i])

    unique_duplicates = {
        tx.get("transaction_id"): tx
        for tx in duplicates
        if tx.get("transaction_id")
    }
    return list(unique_duplicates.values())


def detect_round_number_payments(transactions: List[Transaction]) -> List[Transaction]:
    """Flags large round-number expenses to unfamiliar recipients.

    Thresholds: ≥ KES 50,000, divisible by 10,000, to a recipient seen
    fewer than 2 times before in this dataset. Rent and Payroll are
    excluded — they're legitimately large round numbers on a recurring
    basis.
    """
    transactions = transactions_with_valid_dates(transactions)

    recurring_round_categories = {"Rent", "Payroll"}
    seen_count: Dict[str, int] = {}
    flagged: List[Transaction] = []
    ordered = sorted(transactions, key=lambda tx: parse_date(tx.get("date")) or _DATE_FALLBACK)

    for tx in ordered:
        contact = tx.get("contact_name", "")
        prior = seen_count.get(contact, 0)
        seen_count[contact] = prior + 1

        if tx.get("type") != "Expense":
            continue
        amount = _safe_amount(tx)
        if amount < 50000 or amount % 10000 != 0:
            continue
        if tx.get("category_name") in recurring_round_categories:
            continue
        if prior < 2:
            flagged.append(tx)

    return flagged


def detect_odd_amount_new_recipient(transactions: List[Transaction]) -> List[Transaction]:
    """Flags oddly precise payments to brand-new recipients.

    An "oddly precise" amount is one that is NOT divisible by 500 —
    e.g. KES 47,832 rather than KES 48,000. Payments below KES 10,000
    are excluded as petty-cash noise.

    This check exists because round-number detection structurally cannot
    catch this case: a non-round amount will never match `amount % 10000
    == 0` regardless of the threshold, so it needs its own rule.
    """
    transactions = transactions_with_valid_dates(transactions)

    seen_count: Dict[str, int] = {}
    flagged: List[Transaction] = []
    ordered = sorted(transactions, key=lambda tx: parse_date(tx.get("date")) or _DATE_FALLBACK)

    for tx in ordered:
        contact = tx.get("contact_name", "")
        prior = seen_count.get(contact, 0)
        seen_count[contact] = prior + 1

        if tx.get("type") != "Expense":
            continue
        amount = _safe_amount(tx)
        is_round = amount % 500 == 0
        is_brand_new = prior == 0
        is_meaningful = amount >= 10000  # filter petty-cash noise
        if not is_round and is_brand_new and is_meaningful:
            flagged.append(tx)

    return flagged