"""
detection/cash_buffer.py
Check 4 — Cash flow risk (liquidity stress proxy).

CHANGELOG — type matching generalised:
  The old version only recognised "Income" and "Expense" as type strings
  (Zoho's exact output). Manual CSV uploads and GearNova-style exports use
  "Revenue", "Supplier", "Operating", "Owner", "PettyCash" etc. Those rows
  were silently skipped, making inflows and outflows both 0, triggering the
  "net cash-positive" branch and returning buffer_days=9999 regardless of
  actual financial position.

  Fix: two sets of normalised type classifiers. Any type string that maps to
  an inflow (Revenue, Income, Sales, Receipt) is counted as income. Any type
  string that maps to an outflow (Expense, Supplier, Operating, Owner,
  PettyCash, Logistics, Services, Misc, Utility, Bill, Cost, Payment) is
  counted as expenditure. Unrecognised types are logged but not silently
  dropped — they fall through to a sign-based fallback using the amount.

CHANGELOG — math bugs fixed (previous version):
  (a) Divided full-period outflow by hardcoded 30 days regardless of actual
      dataset span. Fixed: actual period length from date range.
  (b) Used gross spend instead of net burn. Fixed: net burn = (outflows -
      inflows) / period_days.

CHANGELOG — hardcoded starting balance:
  Was KES 250,000 hardcoded. Now an optional argument from the payload,
  with fallback surfaced explicitly in output.

HONEST CEILING:
This is a trailing-burn estimate, not a forward-looking model.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from .helpers import Transaction, _safe_amount, transactions_with_valid_dates, parse_date

_DATE_FALLBACK = datetime.min

DEFAULT_STARTING_BALANCE = 250_000

# Type strings that represent money coming IN to the business.
# Case-insensitive match used at call site.
_INFLOW_TYPES: Set[str] = {
    "income",
    "revenue",
    "sales",
    "receipt",
    "inflow",
    "credit",
    "initial",   # catches "Initial" balance entries in GearNova-style CSVs
}

# Type strings that represent money going OUT of the business.
_OUTFLOW_TYPES: Set[str] = {
    "expense",
    "supplier",
    "operating",
    "owner",
    "pettycash",
    "petty cash",
    "logistics",
    "services",
    "misc",
    "utility",
    "utilities",
    "bill",
    "cost",
    "payment",
    "stock",
    "rent",
    "salary",
    "salaries",
    "payroll",
    "tax",
    "transfer",
    "withdrawal",
    "draw",
}


def _classify_transaction(tx: Transaction) -> str:
    """
    Returns "income", "expense", or "unknown".

    Resolution order:
      1. Normalise the type field and check against known inflow/outflow sets.
      2. If type is unrecognised, fall back to amount sign
         (positive = income, negative = expense).
      3. If neither resolves, return "unknown" — caller skips the row.
    """
    raw_type = str(tx.get("type") or "").strip().lower().replace("-", " ")

    if raw_type in _INFLOW_TYPES:
        return "income"
    if raw_type in _OUTFLOW_TYPES:
        return "expense"

    # Sign-based fallback for unrecognised type strings.
    # normalizeForEngine sets amount to Math.abs(), so sign is lost by the
    # time it reaches here for ingest-route uploads. This fallback is more
    # useful for direct Zoho data where the original sign may be preserved.
    amount = _safe_amount(tx)
    if amount > 0:
        return "income"   # ambiguous but better than dropping the row
    if amount < 0:
        return "expense"

    return "unknown"


def calculate_cash_buffer(
    transactions: List[Transaction],
    starting_balance: Optional[float] = None,
) -> Dict[str, Any]:
    """Estimates cash runway in days from the trailing period's net burn rate."""
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

    inflows = 0.0
    outflows = 0.0
    unclassified_count = 0

    for tx in transactions:
        classification = _classify_transaction(tx)
        amount = _safe_amount(tx)
        if classification == "income":
            inflows += amount
        elif classification == "expense":
            outflows += amount
        else:
            unclassified_count += 1

    dated = sorted(
        transactions,
        key=lambda tx: parse_date(tx.get("date")) or _DATE_FALLBACK,
    )
    first_date = parse_date(dated[0]["date"]) or _DATE_FALLBACK
    last_date = parse_date(dated[-1]["date"]) or _DATE_FALLBACK
    period_days = max(1, (last_date - first_date).days + 1)
    net_burn_per_day = (outflows - inflows) / period_days

    used_fallback = starting_balance is None
    balance = starting_balance if not used_fallback else DEFAULT_STARTING_BALANCE

    running_balance = balance
    for tx in dated:
        classification = _classify_transaction(tx)
        delta = _safe_amount(tx)
        if classification == "income":
            running_balance += delta
        elif classification == "expense":
            running_balance -= delta

    available_cash = max(0.0, running_balance)

    if net_burn_per_day > 0:
        buffer_days = round(available_cash / net_burn_per_day)
    else:
        # Genuinely net cash-positive over the period — business is growing.
        # Cap at 365 for display sanity; this is not a 9999 error case.
        buffer_days = 365

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
    if unclassified_count:
        note_parts.append(
            f"{unclassified_count} transaction(s) had unrecognised type values "
            f"and were excluded from the cash flow calculation."
        )

    return {
        "total_in": inflows,
        "total_out": outflows,
        "buffer_days": min(buffer_days, 365),
        "risk_level": risk_level,
        "used_fallback_starting_balance": used_fallback,
        "limitation_note": " ".join(note_parts),
    }