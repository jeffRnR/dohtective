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
    "expense", "supplier", "operating", "owner", "owner draw", "pettycash",
    "petty cash", "logistics", "services", "misc", "utility", "utilities",
    "bill", "cost", "payment", "stock", "rent", "salary", "salaries",
    "payroll", "tax", "transfer", "withdrawal", "draw",
    "non-reimbursable", "reimbursable", "fuel", "purchase", "inventory",
    "equipment", "maintenance", "repairs", "insurance", "subscription",
    "software", "hardware", "shipping", "freight", "customs", "duty",
}



def _classify_transaction(tx: Transaction) -> str:
    """Returns 'income', 'expense', or 'unknown'."""
    raw_type = str(tx.get("type") or "").strip()

    # Trust the extractor's canonical classification first
    if raw_type == "Income":
        return "income"
    if raw_type == "Expense":
        return "expense"

    normalised = raw_type.lower().replace("-", " ")
    if normalised in _INFLOW_TYPES:
        return "income"
    if normalised in _OUTFLOW_TYPES:
        return "expense"

    # Substring inference for unstructured category values
    if any(kw in normalised for kw in ("sale", "revenue", "receipt", "income", "payment received")):
        return "income"
    if any(kw in normalised for kw in ("draw", "withdrawal", "expense", "cost", "purchase",
                                        "supply", "stock", "rent", "salary", "wage", "fee",
                                        "utility", "loan", "repay")):
        return "expense"

    amount = _safe_amount(tx)
    if amount < 0:
        return "expense"

    return "unknown"


def calculate_cash_buffer(
    transactions: List[Transaction],
    starting_balance: Optional[float] = None,
) -> Dict[str, Any]:
    """Estimates cash runway in days from the trailing period's net burn rate."""
    valid_transactions = transactions_with_valid_dates(transactions)

    if not valid_transactions:
        return {
            "total_in": 0,
            "total_out": 0,
            "buffer_days": None,
            "risk_level": "unknown",
            "used_fallback_starting_balance": starting_balance is None,
            "cannot_compute": True,
            "limitation_note": (
                "We could not estimate your cash buffer because no transactions "
                "with readable dates were found. This usually means the date "
                "column in your file uses an unrecognised format. Try exporting "
                "your file with dates in DD/MM/YYYY or YYYY-MM-DD format."
            ),
        }

    inflows = 0.0
    outflows = 0.0
    unclassified_count = 0

    for tx in valid_transactions:
        classification = _classify_transaction(tx)
        amount = _safe_amount(tx)
        if classification == "income":
            inflows += amount
        elif classification == "expense":
            outflows += amount
        else:
            unclassified_count += 1

    # If everything is unclassified, be honest rather than returning nonsense
    if inflows == 0 and outflows == 0:
        return {
            "total_in": 0,
            "total_out": 0,
            "buffer_days": None,
            "risk_level": "unknown",
            "used_fallback_starting_balance": starting_balance is None,
            "cannot_compute": True,
            "limitation_note": (
                f"We could not separate income from expenses in your file "
                f"({len(valid_transactions)} transactions were found but none "
                f"could be classified as income or expense). This usually happens "
                f"when the file has no 'type', 'category', 'debit', or 'credit' "
                f"column. Add a column to your spreadsheet indicating whether "
                f"each row is income or an expense and re-upload."
            ),
        }

    dated = sorted(
        valid_transactions,
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
    elif net_burn_per_day < 0:
        # Net cash-positive — genuinely growing, not a bug
        buffer_days = 365
    else:
        # Net burn is exactly zero — unusual, be honest
        buffer_days = None
        return {
            "total_in": inflows,
            "total_out": outflows,
            "buffer_days": None,
            "risk_level": "unknown",
            "used_fallback_starting_balance": used_fallback,
            "cannot_compute": True,
            "limitation_note": (
                "Income and expenses are exactly equal over this period — "
                "the cash buffer cannot be meaningfully estimated. "
                "Upload more data or a longer period for a useful reading."
            ),
        }

    risk_level = (
        "high" if buffer_days < 14
        else "medium" if buffer_days < 30
        else "low"
    )

    note_parts = [
        f"Based on the last {period_days} days of data. "
        "This is a trailing estimate — it cannot predict a large payment "
        "due next week that hasn't happened yet."
    ]
    if used_fallback:
        note_parts.append(
            f"No opening balance was found in your file — "
            f"KES {DEFAULT_STARTING_BALANCE:,} was assumed as a starting point. "
            f"For a more accurate reading, add your opening cash balance to your file."
        )
    if unclassified_count:
        note_parts.append(
            f"{unclassified_count} transaction(s) could not be classified as "
            f"income or expense and were excluded from this calculation."
        )

    return {
        "total_in": inflows,
        "total_out": outflows,
        "buffer_days": min(buffer_days, 365),
        "risk_level": risk_level,
        "used_fallback_starting_balance": used_fallback,
        "cannot_compute": False,
        "limitation_note": " ".join(note_parts),
    }