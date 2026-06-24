"""
backend/extract_csv.py
CLI entrypoint for CSV and Excel transaction extraction.
Accepts a file path as argv[1], normalises column names via fuzzy
matching (same approach as extract_pdf.py), and writes
NormalizedTransaction-shaped JSON to stdout.

Supports:
  - Any CSV encoding (UTF-8, UTF-8-BOM, Latin-1 auto-detected)
  - Excel .xlsx and .xls files
  - Zoho Books exports
  - M-Pesa CSV exports
  - Generic bank CSV exports
  - Manual spreadsheets with varied column names

Same bridge pattern as extract_pdf.py — Node.js calls this via
child_process, reads stdout as JSON, cleans up the temp file.
Never writes to stdout except the final JSON dump; all logging to stderr.
"""

from __future__ import annotations
import csv
import json
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

# ── Optional Excel support ─────────────────────────────────────────────────
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

try:
    import xlrd
    HAS_XLRD = True
except ImportError:
    HAS_XLRD = False

# ── Column name map ────────────────────────────────────────────────────────
# Maps the many ways exports label columns to a canonical internal name.
# Matching is case-insensitive, whitespace-collapsed, punctuation-stripped.

COLUMN_MAP = {
    # ── Date ──
    "date": "date",
    "transaction date": "date",
    "trans date": "date",
    "txn date": "date",
    "value date": "date",
    "posting date": "date",
    "completion time": "date",
    "created time": "date",
    "created date": "date",
    "book date": "date",
    "entry date": "date",
    "trade date": "date",

    # ── Amount (signed single column) ──
    "amount": "amount",
    "transaction amount": "amount",
    "txn amount": "amount",
    "net amount": "amount",
    "debit/credit": "amount",
    "value": "amount",
    "total": "amount",
    "total amount": "amount",

    # ── Split debit/credit columns ──
    "debit": "withdrawn",
    "debit amount": "withdrawn",
    "dr": "withdrawn",
    "dr amount": "withdrawn",
    "withdrawal": "withdrawn",
    "withdrawn": "withdrawn",
    "money out": "withdrawn",
    "paid out": "withdrawn",
    "payment": "withdrawn",

    "credit": "paid_in",
    "credit amount": "paid_in",
    "cr": "paid_in",
    "cr amount": "paid_in",
    "deposit": "paid_in",
    "paid in": "paid_in",
    "money in": "paid_in",
    "received": "paid_in",
    "receipt": "paid_in",

    # ── Description / narration ──
    "description": "description",
    "details": "description",
    "narration": "description",
    "particulars": "description",
    "remarks": "description",
    "memo": "description",
    "notes": "description",
    "transaction details": "description",
    "transaction description": "description",
    "trans details": "description",
    "payment details": "description",
    "reference": "description",
    "reference details": "description",

    # ── Vendor / contact ──
    "vendor": "vendor",
    "vendor name": "vendor",
    "payee": "vendor",
    "payee name": "vendor",
    "merchant": "vendor",
    "merchant name": "vendor",
    "contact": "vendor",
    "contact name": "vendor",
    "customer": "vendor",
    "customer name": "vendor",
    "name": "vendor",
    "counterparty": "vendor",
    "beneficiary": "vendor",
    "beneficiary name": "vendor",

    # ── Reference / ID ──
    "reference no": "ref",
    "reference no.": "ref",
    "reference number": "ref",
    "ref no": "ref",
    "ref no.": "ref",
    "ref number": "ref",
    "receipt no": "ref",
    "receipt no.": "ref",
    "receipt number": "ref",
    "transaction id": "ref",
    "transaction no": "ref",
    "transaction no.": "ref",
    "trans id": "ref",
    "trans no": "ref",
    "trans no.": "ref",
    "txn id": "ref",
    "txn no": "ref",
    "cheque no": "ref",
    "cheque number": "ref",
    "check no": "ref",
    "check number": "ref",
    "invoice no": "ref",
    "invoice number": "ref",
    "voucher no": "ref",
    "id": "ref",

    # ── Type / category ──
    "type": "type",
    "transaction type": "type",
    "trans type": "type",
    "txn type": "type",
    "cr/dr": "type",
    "dr/cr": "type",

    "category": "category",
    "category name": "category",
    "account category": "category",
    "expense category": "category",
    "expense type": "category",

    # ── Account ──
    "account": "account",
    "account name": "account",
    "bank account": "account",
    "account number": "account",
    "account no": "account",

    # ── Branch ──
    "branch": "branch",
    "branch name": "branch",
    "location": "branch",
    "store": "branch",
    "outlet": "branch",

    # ── Balance (kept for context, not used in engine) ──
    "balance": "balance",
    "running balance": "balance",
    "available balance": "balance",
    "closing balance": "balance",
    "ledger balance": "balance",
}

# ── Date formats ───────────────────────────────────────────────────────────
DATE_FORMATS = [
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%m/%d/%Y",
    "%m-%d-%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%d/%m/%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%Y-%m-%d %H:%M",
]


def _normalise_col(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def _map_columns(headers: List[str]) -> Dict[str, str]:
    """Returns {original_header: canonical_name} for recognised columns."""
    mapping = {}
    for h in headers:
        canonical = COLUMN_MAP.get(_normalise_col(h))
        if canonical:
            mapping[h] = canonical
    return mapping


def _parse_amount(value: Any) -> float:
    if value is None or str(value).strip() in ("", "-", "N/A", "n/a"):
        return 0.0
    # Remove currency symbols, commas, spaces; keep digits, dot, minus
    cleaned = re.sub(r"[^\d.\-]", "", str(value).replace(",", "").strip())
    if not cleaned or cleaned == "-":
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Return raw — normalizeForEngine's parseDate will handle or fall back
    return raw


def _row_to_transaction(
    row: Dict[str, Any],
    col_map: Dict[str, str],
    index: int,
) -> Optional[Dict[str, Any]]:
    """Maps a raw CSV/Excel row to a NormalizedTransaction-shaped dict.
    Returns None for blank rows, header repeats, and total/summary rows."""
    canonical: Dict[str, Any] = {}
    for original, value in row.items():
        canon = col_map.get(original)
        if canon:
            canonical[canon] = value

    # Resolve amount from whichever column(s) are present
    paid_in = _parse_amount(canonical.get("paid_in"))
    withdrawn = _parse_amount(canonical.get("withdrawn"))
    raw_amount = _parse_amount(canonical.get("amount"))

    if paid_in > 0 and withdrawn > 0:
        # Both columns filled — treat as net (unusual but handle it)
        net = paid_in - withdrawn
        amount = abs(net)
        tx_type = "Income" if net >= 0 else "Expense"
    elif paid_in > 0:
        amount = paid_in
        tx_type = "Income"
    elif withdrawn > 0:
        amount = withdrawn
        tx_type = "Expense"
    elif raw_amount != 0:
        amount = abs(raw_amount)
        tx_type = "Income" if raw_amount > 0 else "Expense"
    else:
        return None  # No usable amount — blank/total/header-repeat row

    # Override type from explicit cr/dr column if present
    raw_type = str(canonical.get("type") or "").strip().upper()
    if raw_type in ("CR", "CREDIT", "C"):
        tx_type = "Income"
    elif raw_type in ("DR", "DEBIT", "D"):
        tx_type = "Expense"

    # Description: prefer dedicated description column, fall back to vendor
    description = str(canonical.get("description") or canonical.get("vendor") or "").strip()

    # Vendor: prefer dedicated vendor column, fall back to description
    vendor = str(canonical.get("vendor") or description or "").strip()

    # Skip rows that look like running totals or summaries
    desc_lower = description.lower()
    if any(kw in desc_lower for kw in ("total", "subtotal", "balance b/f", "opening balance", "closing balance", "brought forward")):
        return None

    ref = str(canonical.get("ref") or f"csv-{index}").strip()
    date = _parse_date(canonical.get("date"))
    category = str(canonical.get("category") or "Uncategorized").strip() or "Uncategorized"
    account = str(canonical.get("account") or "").strip()
    branch = str(canonical.get("branch") or "").strip()

    return {
        "id": ref or f"csv-{index}",
        "date": date,
        "amount": amount,
        "description": description,
        "vendor": vendor,
        "category": category,
        "type": tx_type,
        "account_name": account or "Manual Upload",
        "branch": branch or "Main",
        "source": "CSV",
        "raw": {k: str(v) for k, v in row.items()},
    }


# ── File readers ───────────────────────────────────────────────────────────

def _read_csv(filepath: str) -> List[Dict[str, Any]]:
    """Try common encodings until one works."""
    encodings = ["utf-8-sig", "utf-8", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            with open(filepath, encoding=enc, newline="") as f:
                # Sniff delimiter
                sample = f.read(4096)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                except csv.Error:
                    dialect = csv.excel  # default comma
                reader = csv.DictReader(f, dialect=dialect)
                rows = [dict(r) for r in reader]
                if rows:
                    return rows
        except (UnicodeDecodeError, Exception):
            continue
    return []


def _read_excel(filepath: str) -> List[Dict[str, Any]]:
    """Read first sheet of .xlsx or .xls file."""
    lower = filepath.lower()

    if lower.endswith(".xlsx") and HAS_OPENPYXL:
        wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
        ws = wb.active
        if ws is None:
            wb.close()
            raise RuntimeError("Excel file has no active sheet.")
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
        if not rows:
            return []
        headers = [str(h or "").strip() for h in rows[0]]
        result = []
        for row in rows[1:]:
            d = {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
            result.append(d)
        return result

    if lower.endswith(".xls") and HAS_XLRD:
        wb = xlrd.open_workbook(filepath)
        ws = wb.sheet_by_index(0)
        headers = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
        result = []
        for r in range(1, ws.nrows):
            d = {headers[c]: ws.cell_value(r, c) for c in range(ws.ncols)}
            result.append(d)
        return result

    raise RuntimeError(
        f"Cannot read Excel file: openpyxl (for .xlsx) or xlrd (for .xls) not installed. "
        f"Run: pip install openpyxl xlrd --break-system-packages"
    )


# ── Main extraction ────────────────────────────────────────────────────────

def extract_transactions(filepath: str) -> List[Dict[str, Any]]:
    lower = filepath.lower()

    if lower.endswith((".xlsx", ".xls")):
        raw_rows = _read_excel(filepath)
        source_label = "Excel"
    else:
        raw_rows = _read_csv(filepath)
        source_label = "CSV"

    if not raw_rows:
        sys.stderr.write(f"[extract_csv] No rows read from {source_label} file.\n")
        return []

    # Find the actual header row — some exports have 3-5 preamble rows
    # before the real column headers. We scan the first 10 rows for the
    # one that has the most recognised column names.
    header_row_index = 0
    best_match_count = 0

    # raw_rows uses the first row as headers via DictReader/openpyxl.
    # If the real headers aren't row 0, we need to re-read with offset.
    # Strategy: check if col_map is empty; if so, peek into the raw values
    # of early rows to find a better header row.
    headers = list(raw_rows[0].keys()) if raw_rows else []
    col_map = _map_columns(headers)

    if not col_map and len(raw_rows) > 1:
        sys.stderr.write(
            f"[extract_csv] Row 0 headers not recognised: {headers}. "
            f"Scanning for real header row...\n"
        )
        # Try treating each of the first 10 rows as a header row
        for candidate_index in range(min(10, len(raw_rows))):
            candidate_headers = list(raw_rows[candidate_index].values())
            candidate_headers = [str(h or "").strip() for h in candidate_headers]
            candidate_map = _map_columns(candidate_headers)
            if len(candidate_map) > best_match_count:
                best_match_count = len(candidate_map)
                header_row_index = candidate_index

        if best_match_count > 0:
            sys.stderr.write(
                f"[extract_csv] Found header row at index {header_row_index} "
                f"with {best_match_count} recognised columns.\n"
            )
            # Re-build rows using that row as headers
            new_headers = [str(v or "").strip() for v in raw_rows[header_row_index].values()]
            col_map = _map_columns(new_headers)
            raw_rows = [
                {new_headers[i]: list(r.values())[i] if i < len(r) else None
                 for i in range(len(new_headers))}
                for r in raw_rows[header_row_index + 1:]
            ]
        else:
            sys.stderr.write(
                f"[extract_csv] Could not find any recognised column headers. "
                f"Columns seen: {[list(r.values()) for r in raw_rows[:3]]}\n"
            )
            return []

    transactions = []
    seen_refs: set = set()

    for i, row in enumerate(raw_rows):
        # Skip completely empty rows
        if all(v is None or str(v).strip() == "" for v in row.values()):
            continue

        tx = _row_to_transaction(row, col_map, i)
        if tx is None:
            continue

        ref = tx["id"]
        if ref in seen_refs:
            tx["id"] = f"{ref}-{i}"
        seen_refs.add(tx["id"])

        transactions.append(tx)

    sys.stderr.write(
        f"[extract_csv] Extracted {len(transactions)} transactions "
        f"from {len(raw_rows)} rows.\n"
    )
    return transactions


# ── CLI entrypoint ─────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python extract_csv.py <path_to_file>\n")
        sys.exit(1)

    filepath = sys.argv[1]

    try:
        transactions = extract_transactions(filepath)
    except Exception as e:
        sys.stderr.write(f"[extract_csv] Extraction failed: {e}\n")
        sys.exit(1)

    if not transactions:
        sys.stderr.write(
            "[extract_csv] Warning: no transactions extracted. "
            "The file may use unrecognised column names or an unsupported format.\n"
        )

    json.dump(transactions, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()