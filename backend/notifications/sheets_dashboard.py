"""
backend/notifications/sheets_dashboard.py
Google Sheets notification workflow — Deliverable #6: "Automated follow-up
workflow that notifies the founder and accountant with specific items to
fix (suggested to have a dashboard in Google Sheets)."

This pushes the output of engine.build_report() into a Google Sheet
structured as an ACTION LIST, not a data dump — every row is something a
specific person can do something about today, sorted so the most urgent
item is always at the top. This is the deliverable's own framing
("specific items to fix"), not a generic export of the JSON report.

─────────────────────────────────────────────────────────────────────────
SETUP REQUIRED — this module will not silently pretend to work without it.
─────────────────────────────────────────────────────────────────────────
1. Create a Google Cloud project, enable the Google Sheets API and Google
   Drive API.
2. Create a Service Account, download its JSON key file.
3. Share the target Google Sheet with the service account's email address
   (found inside the JSON key file as "client_email") — Editor access.
4. Set the environment variable GOOGLE_SERVICE_ACCOUNT_JSON to the path of
   that key file, and GOOGLE_SHEET_ID to the target sheet's ID (the long
   string in its URL between /d/ and /edit).

Without both of those set, every function in this module raises
NotConfiguredError with an explicit message — it does NOT fall back to a
mock that looks like it worked. That distinction matters specifically
because Section 2 of the build plan draws a hard line between "mocked and
clearly labeled" and "silently claims to be live" — a notification system
that silently no-ops is worse than one that loudly refuses.
─────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
SEVERITY_EMOJI = {"high": "🔴", "medium": "🟡", "low": "⚪"}

HEADER_ROW = [
    "Priority", "Status", "Flag", "What it means", "Assigned to",
    "Amount (KES)", "Date flagged", "Action needed",
]


class NotConfiguredError(RuntimeError):
    """Raised when Sheets credentials aren't set. Deliberately loud — see
    module docstring for why this must never fail silently."""
    pass


def _get_client():
    try:
        import gspread
        from google.oauth2.service_account import Credentials
    except ImportError as e:
        raise NotConfiguredError(
            "gspread and google-auth must be installed: "
            "pip install gspread google-auth --break-system-packages"
        ) from e

    key_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not key_path or not os.path.exists(key_path):
        raise NotConfiguredError(
            "GOOGLE_SERVICE_ACCOUNT_JSON is not set or the file doesn't exist. "
            "See the setup instructions at the top of sheets_dashboard.py. "
            "This system will NOT silently mock a Sheets connection — "
            "the build plan's honesty principle applies to notifications too."
        )

    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = Credentials.from_service_account_file(key_path, scopes=scopes)
    return gspread.authorize(creds)


def _get_sheet_id() -> str:
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise NotConfiguredError(
            "GOOGLE_SHEET_ID is not set. See setup instructions at the top of sheets_dashboard.py."
        )
    return sheet_id


# ─────────────────────────────────────────────────────────────────────────
# Row building — turns a report's flags into specific, assignable actions.
# This is the actual translation work: a flag like "Mixed personal and
# business funds detected, 1 transaction, KES 4,500" becomes a row a real
# person can act on without reading the rest of the report.
# ─────────────────────────────────────────────────────────────────────────

ROLE_BY_FLAG_KEYWORD = [
    # (substring to match in flag title, role to assign, action template)
    ("mixed personal", "Founder",
     "Check whether this was a genuine personal expense paid from the business account. If so, record it as an owner draw."),
    ("duplicate payment", "Accountant",
     "Confirm with the supplier whether this was a deliberate re-order or an accidental double payment. Request a refund if duplicate."),
    ("round-number payment", "Accountant",
     "Verify this payment against a supporting invoice. New, round-number payments to unfamiliar recipients are worth a second look."),
    ("unusually precise", "Accountant",
     "Confirm this recipient and payment are legitimate — no prior history with this exact amount makes it worth a second look."),
    ("unusual transaction", "Accountant",
     "Review the transaction description and confirm it matches a real, expected business expense."),
    ("unreconciled", "Accountant",
     "Match this transaction against the bank statement and mark it reconciled."),
    ("reference number sequence", "Accountant",
     "Check whether the missing reference numbers were voided entries or genuinely missing records."),
    ("supporting documents", "Accountant",
     "Request the missing receipt or invoice from whoever made this purchase."),
    ("bank statement", "Accountant",
     "Complete the bank reconciliation for this statement period."),
    ("cash buffer", "Founder",
     "Review upcoming payments due and confirm there's enough cash to cover them — line up financing or collections if not."),
]


def _assign_action(flag: Dict[str, Any]) -> tuple[str, str]:
    title_lower = flag.get("title", "").lower()
    for keyword, role, action in ROLE_BY_FLAG_KEYWORD:
        if keyword in title_lower:
            return role, action
    return "Accountant", "Review this flag and determine the appropriate next step."


def build_action_rows(report: Dict[str, Any]) -> List[List[str]]:
    """Converts a report's flags into sheet rows, sorted by severity (most
    urgent first). One row per flag — for flags backed by multiple
    transactions, the row still represents the AGGREGATE item to review,
    since that's the actionable unit, not each individual transaction."""
    flags = sorted(
        report.get("flags", []),
        key=lambda f: SEVERITY_ORDER.get(f.get("severity", "low"), 2),
    )

    rows = []
    today = datetime.now().date().isoformat()
    for flag in flags:
        role, action = _assign_action(flag)
        severity = flag.get("severity", "low")
        rows.append([
            f"{SEVERITY_EMOJI.get(severity, '⚪')} {severity.upper()}",
            "Open",
            flag.get("title", ""),
            flag.get("detail", ""),
            role,
            "",  # amount left blank at the flag-aggregate level — see anomaly rows for per-transaction amounts
            today,
            action,
        ])
    return rows


def build_anomaly_detail_rows(report: Dict[str, Any]) -> List[List[str]]:
    """Per-transaction detail rows, for a second sheet tab — lets an
    accountant drill from 'what needs attention' down to the exact
    transaction without leaving the spreadsheet."""
    rows = []
    for tx in report.get("anomaly_transactions", []):
        rows.append([
            tx.get("transaction_id", ""),
            tx.get("date", ""),
            tx.get("branch", ""),
            tx.get("contact_name", ""),
            f"{tx.get('amount', 0):,}",
            tx.get("anomaly_type", ""),
            tx.get("reason", ""),
            tx.get("reference_number", ""),
        ])
    return rows


# ─────────────────────────────────────────────────────────────────────────
# Sheet writing
# ─────────────────────────────────────────────────────────────────────────

def push_report_to_sheet(report: Dict[str, Any], business_name: str = "Business") -> Dict[str, Any]:
    """Writes the report to the configured Google Sheet: one tab for the
    action list (Deliverable #6), one for per-transaction anomaly detail,
    and a summary header with the cash buffer headline. Returns a small
    result dict (not the raw gspread objects) so callers — including the
    FastAPI layer — get a clean, serializable response.

    Raises NotConfiguredError if credentials aren't set up. Does not catch
    and swallow that error — callers must handle it explicitly, so a
    missing-credentials state is never mistaken for a successful push."""
    client = _get_client()
    sheet_id = _get_sheet_id()
    spreadsheet = client.open_by_key(sheet_id)

    # ── Tab 1: Action List ──
    try:
        ws = spreadsheet.worksheet("Action List")
        ws.clear()
    except Exception:
        ws = spreadsheet.add_worksheet(title="Action List", rows=200, cols=10)

    summary_lines = [
        [f"{business_name} — Monthly Financial Review"],
        [f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}"],
        [f"Cash buffer: {report.get('cash_buffer_days', '—')} days ({report.get('cash_buffer_risk_level', 'unknown')} risk)"],
        [f"Items needing attention: {len(report.get('flags', []))}"],
        [],  # spacer row
        HEADER_ROW,
    ]
    action_rows = build_action_rows(report)
    ws.update(values=summary_lines + action_rows, range_name="A1")
    # Bold the header row and freeze it, so it stays visible while scrolling.
    ws.format("A6:H6", {"textFormat": {"bold": True}})
    ws.freeze(rows=6)

    # ── Tab 2: Anomaly Detail ──
    try:
        detail_ws = spreadsheet.worksheet("Transaction Detail")
        detail_ws.clear()
    except Exception:
        detail_ws = spreadsheet.add_worksheet(title="Transaction Detail", rows=500, cols=8)

    detail_header = ["Transaction ID", "Date", "Branch", "Contact", "Amount (KES)", "Anomaly type", "Reason", "Reference"]
    detail_rows = build_anomaly_detail_rows(report)
    detail_ws.update(values=[detail_header] + detail_rows, range_name="A1")
    detail_ws.format("A1:H1", {"textFormat": {"bold": True}})
    detail_ws.freeze(rows=1)

    return {
        "status": "sent",
        "sheet_url": f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit",
        "action_items_written": len(action_rows),
        "anomaly_rows_written": len(detail_rows),
        "pushed_at": datetime.now().isoformat(),
    }


def is_configured() -> bool:
    """Cheap check the FastAPI layer can call to show connection status in
    the UI without triggering a full auth attempt and its exception."""
    return bool(
        os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        and os.path.exists(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", ""))
        and os.environ.get("GOOGLE_SHEET_ID")
    )