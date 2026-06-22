"""
detection/mixed_funds.py
Check 1 — Mixed personal / business funds.

DESIGN NOTE — why keyword matching alone isn't enough:
The seeded anomaly the brief is built around is a recurring utility
payment (e.g. "KPLC", KES 4,500) that hides BECAUSE it looks like a
normal business bill — no "personal" keyword anywhere in it.
Keyword-only logic misses this entirely. The real spec (Section 3.2)
requires two independent signals:
  (a) explicit keyword signal — "owner draw", "personal", etc.
  (b) personal-pattern biller with no business justification on file.
Both are scored separately and merged into one confidence tier per
transaction.

KNOWN LIMITATION — language coverage:
PERSONAL_PATTERN_BILLER_KEYWORDS is English-only. Kenyan SME bookkeeping
entries frequently mix English and Swahili (e.g. "maji" for water,
"umeme" for electricity). This is a real gap for production use; treat
these lists as a starting point, not a complete ruleset.

KNOWN LIMITATION — duplicate-detection key:
The None-sentinel comment in duplicates_and_amounts.py applies here too:
a missing contact_name becomes the empty string in the haystack join,
which is harmless for keyword matching (empty string never contains a
keyword) but worth keeping in mind if the logic ever changes.
"""

from typing import Any, Dict, List, Optional, Tuple

from .helpers import Transaction

# ── keyword signals ────────────────────────────────────────────────────────

PERSONAL_KEYWORD_PATTERNS = [
    "personal",
    "owner draw",
    "owner",
    "personal wallet",
]

# Billers whose name pattern is "personal-shaped" even on a business till.
# A payment to one of these is only legitimate if the business has an
# on-file reason for it (a registered branch account reference, a known
# business line). See _business_justification_exists() below.
PERSONAL_PATTERN_BILLER_KEYWORDS = [
    "kplc",
    "kenya power",
    "nairobi water",
    "water co",
    "dstv",
    "gotv",
    "school",
    "academy",
    "fees",
    "nhif",
    "insurance",
    "safaricom postpaid",
]


# ── justification check ────────────────────────────────────────────────────

def _business_justification_exists(
    tx: Transaction,
    business_billers: List[Dict[str, Any]],
) -> bool:
    """True if this transaction's recipient matches a biller the business
    has explicitly registered as legitimate (e.g. the CBD branch's own
    KPLC account).

    CHANGELOG (bug fix from engineering review): the previous version
    computed
        name_match = biller_name in contact or contact in biller_name
    without first checking that `contact` was non-empty. Since "" is a
    substring of every string, a transaction with a missing/blank
    contact_name would match ANY biller registered without an account_ref
    — transactions with the LEAST information were being treated as the
    most "justified". That inverted the intended conservative default.
    Fixed: require a non-empty, non-whitespace contact before any
    substring matching occurs.

    CHANGELOG (account_ref matching tightened): if a biller has an
    account_ref on file and the name matches but the ref doesn't, the
    function returns False rather than falling through to a looser check.
    A wrong account ref is itself a signal, not a reason to approve.
    """
    if not business_billers:
        return False

    contact = str(tx.get("contact_name", "")).strip().lower()
    if not contact:
        # No contact information at all — cannot establish justification.
        # Must not default to "justified" (was the bug: "" in any string
        # is True, so empty contact silently passed every biller check).
        return False

    account_ref = (
        str(tx.get("reference_number", "")) + str(tx.get("notes", ""))
    ).lower()

    for biller in business_billers:
        biller_name = str(biller.get("name", "")).strip().lower()
        if not biller_name:
            continue

        name_match = biller_name in contact or contact in biller_name
        if not name_match:
            continue

        account_ref_value = biller.get("account_ref")
        if account_ref_value:
            if str(account_ref_value).lower() in account_ref:
                return True
            # Name matched but account ref didn't — treat as unjustified.
            # Don't fall through to the name-only approval below.
            continue

        # Name matched and this biller has no account_ref requirement.
        return True

    return False


# ── main detection function ────────────────────────────────────────────────

def detect_mixed_funds(
    transactions: List[Transaction],
    business_billers: Optional[List[Dict[str, Any]]] = None,
) -> List[Tuple[Transaction, str]]:
    """Returns (transaction, confidence) pairs. confidence ∈ {high, medium, low}.

    Two independent signals, each scored separately, then merged:
      (a) Keyword signal — explicit "owner draw", "personal", etc.
      (b) Personal-pattern biller with no business justification on file.

    Confidence tiering (Section 3.2):
      high   — structural signal: owner-draw account + unreconciled
      medium — unjustified personal-pattern biller (no keyword needed)
      medium — owner-draw account OR unreconciled (single structural signal)
      low    — keyword match only, no structural signal
    """
    business_billers = business_billers or []
    scored: List[Tuple[Transaction, str]] = []

    for tx in transactions:
        haystack = " ".join(
            str(tx.get(key, "")).lower()
            for key in ["description", "account_name", "category_name", "contact_name"]
        )

        has_keyword = any(p in haystack for p in PERSONAL_KEYWORD_PATTERNS)
        looks_like_personal_biller = any(kw in haystack for kw in PERSONAL_PATTERN_BILLER_KEYWORDS)
        has_justification = (
            _business_justification_exists(tx, business_billers)
            if looks_like_personal_biller
            else True
        )

        is_owner_draw = (
            "owner draw" in str(tx.get("account_name", "")).lower()
            or "owner draw" in str(tx.get("category_name", "")).lower()
        )
        is_unreconciled = tx.get("is_reconciled") is False

        # Neither signal fired — not flagged.
        if not has_keyword and not (looks_like_personal_biller and not has_justification):
            continue

        if is_owner_draw and is_unreconciled:
            confidence = "high"
        elif looks_like_personal_biller and not has_justification:
            confidence = "medium"
        elif is_owner_draw or is_unreconciled:
            confidence = "medium"
        else:
            confidence = "low"

        scored.append((tx, confidence))

    return scored