"""
detection/cash_buffer.py
Check 4 — Cash flow risk (liquidity stress proxy).

CHANGELOG — math bugs fixed:
  (a) The old version divided full-period outflow by a hardcoded 30 days,
      regardless of how many days the dataset actually spans. A 75-day
      dataset overstated daily burn by ~2.5x.
  (b) It used gross spend instead of net burn (never netted inflows against
      outflows). A profitable business could be flagged "tight" purely from
      this arithmetic error.
  Fixed: actual period length from the dataset's own date range; net burn
  rate = (outflows - inflows) / period_days; three-tier risk band
  (high / medium / low) replacing a single cutoff.

CHANGELOG — hardcoded starting balance:
  starting_balance was KES 250,000, hardcoded to match the mock seed
  script. Any real upload that didn't share that assumption produced a
  silently wrong buffer_days — a number that directly drives the
  "high risk" / "low risk" label shown to a founder. It's now an optional
  argument sourced from the payload, with the old value kept only as an
  explicit fallback that is surfaced in the output when used.

HONEST CEILING (Section 3.5):
This is a trailing-burn estimate based on the dataset's own period, not
a forward-looking model. It cannot see a large payment due next week that
hasn't happened yet. Surfaced explicitly in the output rather than buried
in code comments.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from .helpers import Transaction, _safe_amount, transactions_with_valid_dates, parse_date

_DATE_FALLBACK = datetime.min  # sort key sentinel — see note in duplicates_and_amounts.py

# Kept in sync with the mock seed script. Only used as a fallback when
# no starting_cash_balance key is present in the payload.
DEFAULT_STARTING_BALANCE = 250_000


def calculate_cash_buffer(
    transactions: List[Transaction],
    starting_balance: Optional[float] = None,
) -> Dict[str, Any]:
    """Estimates cash runway in days from the trailing period's net burn rate.

    Args:
        transactions: Full transaction list for the period.
        starting_balance: Opening cash balance from the payload.
            If None, DEFAULT_STARTING_BALANCE is used and the fallback is
            flagged in the output so the caller knows buffer_days is
            illustrative only.

    Returns:
        Dict with buffer_days, risk_level, totals, and honesty notes.
        risk_level: "high" (< 14 days), "medium" (< 30 days), "low" (≥ 30).
    """
    transactions = transactions_with_valid_dates(transactions)

    if not transactions:
        return {
            "total_in": 0,
            "total_out": 0,
            "buffer_days": 0,
            "risk_level": "unknown",
            "used_fallback_starting_balance": starting_balance is None,
            "limitation_note": (
                "No transactions with a parsable date in the period — "
                "cannot estimate cash buffer."
            ),
        }

    inflows = sum(_safe_amount(tx) for tx in transactions if tx.get("type") == "Income")
    outflows = sum(_safe_amount(tx) for tx in transactions if tx.get("type") == "Expense")

    dated = sorted(transactions, key=lambda tx: parse_date(tx.get("date")) or _DATE_FALLBACK)
    first_date = parse_date(dated[0]["date"]) or _DATE_FALLBACK
    last_date = parse_date(dated[-1]["date"]) or _DATE_FALLBACK
    period_days = max(1, (last_date - first_date).days + 1)
    net_burn_per_day = (outflows - inflows) / period_days

    used_fallback = starting_balance is None
    balance = starting_balance if not used_fallback else DEFAULT_STARTING_BALANCE

    running_balance = balance
    for tx in dated:
        delta = _safe_amount(tx)
        running_balance += delta if tx.get("type") == "Income" else -delta
    available_cash = max(0.0, running_balance)

    if net_burn_per_day > 0:
        buffer_days = round(available_cash / net_burn_per_day)
    else:
        # Net cash-positive — represent as "effectively unbounded", capped for display.
        buffer_days = 9999

    risk_level = (
        "high" if buffer_days < 14
        else "medium" if buffer_days < 30
        else "low"
    )

    note_parts = [
        f"This is a trailing-burn estimate based on the last {period_days} days, "
        "not a forward-looking model. It can't see a large payment due next week "
        "that hasn't happened yet."
    ]
    if used_fallback:
        note_parts.append(
            f"No starting cash balance was supplied in the data; "
            f"a placeholder of KES {DEFAULT_STARTING_BALANCE:,} was assumed — "
            f"treat buffer_days as illustrative until a real opening balance is provided."
        )

    return {
        "total_in": inflows,
        "total_out": outflows,
        "buffer_days": min(buffer_days, 9999),
        "risk_level": risk_level,
        "used_fallback_starting_balance": used_fallback,
        "limitation_note": " ".join(note_parts),
    }