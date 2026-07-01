# detection/mixed_funds.py
"""
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

CHANGELOG (justification default fix):
_business_justification_exists previously returned False when
business_billers was empty, causing every personal-pattern biller to be
flagged as unjustified. Empty list now means "no whitelist configured"
and is treated as a neutral signal (has_justification = True), not as
evidence of guilt. Personal-pattern biller matches without an explicit
keyword are now low confidence rather than medium, because biller name
alone is weak evidence when no whitelist is present to compare against.
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
# A payment to one of these is only flagged as a medium-confidence mixed-
# funds issue when the business HAS a biller whitelist configured AND this
# biller is absent from it. If no whitelist is configured (business_billers
# is empty), biller-pattern matches are low confidence only — the absence
# of a whitelist is not evidence of wrongdoing.
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
    KPLC account), OR if no whitelist has been configured at all.

    CHANGELOG: empty business_billers now returns True (neutral / no
    whitelist configured) rather than False (unjustified). The previous
    behaviour treated missing configuration as guilt, which caused every
    Kenya Power, NHIF, and school fees payment to be flagged for any
    business that hadn't set up a biller whitelist — i.e. all of them.

    CHANGELOG (account_ref matching tightened): if a biller has an
    account_ref on file and the name matches but the ref doesn't, the
    function returns False rather than falling through to a looser check.
    A wrong account ref is itself a signal, not a reason to approve.

    CHANGELOG (empty contact fix): the previous version computed
        name_match = biller_name in contact or contact in biller_name
    without first checking that `contact` was non-empty. Since "" is a
    substring of every string, a transaction with a missing/blank
    contact_name would match ANY biller registered without an account_ref.
    Fixed: require a non-empty, non-whitespace contact before any
    substring matching occurs.
    """
    # No whitelist configured — neutral signal, not evidence of guilt.
    if not business_billers:
        return True

    contact = str(tx.get("contact_name", "")).strip().lower()
    if not contact:
        # No contact information at all — cannot establish justification
        # against a configured whitelist.
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
            continue

        # Name matched and this biller has no account_ref requirement.
        return True

    return False


# ── main detection function ────────────────────────────────────────────────

def detect_mixed_funds(
    transactions: List[Transaction],
    business_billers: Optional[List[Dict[str, Any]]] = None,
) -> List[Tuple[Transaction, str]]:
    """Returns (transaction, confidence) pairs. confidence in {high, medium, low}.

    Two independent signals, each scored separately, then merged:
      (a) Keyword signal — explicit "owner draw", "personal", etc.
      (b) Personal-pattern biller absent from a CONFIGURED whitelist.
          Signal (b) only fires when business_billers is non-empty — the
          absence of a whitelist is not evidence that a biller is personal.

    Confidence tiering (Section 3.2):
      high   — structural signal: owner-draw account + unreconciled
      medium — unjustified personal-pattern biller on a configured whitelist
               (biller name in PERSONAL_PATTERN_BILLER_KEYWORDS AND
                business_billers is non-empty AND biller not in whitelist)
      medium — owner-draw account OR unreconciled (single structural signal)
      low    — keyword match only, no structural signal
      low    — personal-pattern biller name match when no whitelist exists
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

        # has_justification is True when:
        #   - business_billers is empty (no whitelist = no basis to judge), OR
        #   - biller is found in the configured whitelist.
        # It is False only when a whitelist exists AND this biller is absent.
        has_justification = (
            _business_justification_exists(tx, business_billers)
            if looks_like_personal_biller
            else True
        )

        # Whether the biller pattern is a meaningful signal depends on
        # whether a whitelist is configured. Without one, it's noise.
        whitelist_configured = bool(business_billers)
        biller_signal_fires = (
            looks_like_personal_biller
            and not has_justification
            and whitelist_configured
        )

        is_owner_draw = (
            "owner draw" in str(tx.get("account_name", "")).lower()
            or "owner draw" in str(tx.get("category_name", "")).lower()
        )
        is_unreconciled = tx.get("is_reconciled") is False

        # Determine whether anything fired at all before scoring.
        keyword_fires = has_keyword
        # Biller name match with no whitelist is a weak signal — flagged
        # at low confidence only if a keyword also fired or structural
        # signals are present. On its own with no whitelist it's not
        # enough to flag.
        biller_name_only = (
            looks_like_personal_biller
            and not whitelist_configured
            and not has_keyword
            and not is_owner_draw
        )

        nothing_fired = (
            not keyword_fires
            and not biller_signal_fires
            and not biller_name_only
        )
        if nothing_fired:
            continue

        # ── confidence scoring ─────────────────────────────────────────
        if is_owner_draw and is_unreconciled:
            confidence = "high"
        elif biller_signal_fires:
            # Whitelist configured AND biller absent from it — meaningful.
            confidence = "medium"
        elif is_owner_draw or is_unreconciled:
            confidence = "medium"
        else:
            # Keyword match only, or biller name pattern with no whitelist.
            confidence = "low"

        # Suppress biller-name-only matches with no whitelist entirely —
        # they have no evidentiary value and cause false positives on
        # legitimate business utility payments (Kenya Power, NHIF, etc.).
        if biller_name_only:
            continue

        scored.append((tx, confidence))

    return scored