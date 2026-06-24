"""
backend/extract_pdf.py
CLI entrypoint for PDF transaction extraction.
Accepts a PDF file path as argv[1], extracts transaction rows using
pdfplumber, and writes NormalizedTransaction-shaped JSON to stdout.

Supports:
  - M-Pesa statements (table columns: Receipt No., Completion Time,
    Details, Transaction Status, Paid In, Withdrawn, Balance)
  - Kenyan bank statements (varied column names, handled via fuzzy
    column matching)

Same bridge pattern as engine.py — Node.js calls this via child_process,
reads stdout as JSON, cleans up. Never writes to stdout except the final
JSON dump; all logging goes to stderr.
"""

import json
import sys
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
import pdfplumber

# ── Column name normalisation ──────────────────────────────────────────────
# Maps the many ways banks and M-Pesa label their columns to a canonical
# internal name. Matching is case-insensitive and whitespace-collapsed.

COLUMN_MAP = {
    # Date variants
    "date": "date",
    "transaction date": "date",
    "value date": "date",
    "completion time": "date",
    "trans date": "date",
    "posting date": "date",
    "txn date": "date",

    # Amount variants (single signed column)
    "amount": "amount",
    "transaction amount": "amount",
    "txn amount": "amount",
    "debit/credit": "amount",

    # M-Pesa split columns
    "paid in": "paid_in",
    "money in": "paid_in",
    "credit": "paid_in",
    "withdrawn": "withdrawn",
    "money out": "withdrawn",
    "debit": "withdrawn",

    # Description variants
    "details": "description",
    "description": "description",
    "narration": "description",
    "particulars": "description",
    "remarks": "description",
    "transaction details": "description",
    "reference": "description",

    # Reference/ID variants
    "receipt no.": "ref",
    "receipt no": "ref",
    "reference no": "ref",
    "reference no.": "ref",
    "cheque no": "ref",
    "transaction id": "ref",
    "trans id": "ref",
    "trans no": "ref",

    # Type variants
    "type": "type",
    "transaction type": "type",
    "trans type": "type",
    "cr/dr": "type",

    # Balance (not used in calculations, kept for context)
    "balance": "balance",
    "running balance": "balance",
    "available balance": "balance",
}


def _normalise_col(name: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation variants."""
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def _map_columns(headers: List[str]) -> Dict[str, str]:
    """Returns {original_header: canonical_name} for recognised columns."""
    mapping = {}
    for h in headers:
        canonical = COLUMN_MAP.get(_normalise_col(h))
        if canonical:
            mapping[h] = canonical
    return mapping


# ── Amount parsing ─────────────────────────────────────────────────────────

def _parse_amount(value: Any) -> float:
    if value is None:
        return 0.0
    cleaned = re.sub(r"[^\d.\-]", "", str(value).replace(",", ""))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


# ── Date parsing ───────────────────────────────────────────────────────────

DATE_FORMATS = [
    "%d/%m/%Y",
    "%Y-%m-%d",
    "%d-%m-%Y",
    "%m/%d/%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%Y/%m/%d",
    # M-Pesa datetime format
    "%d/%m/%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
]


def _parse_date(value: Any) -> str:
    raw = str(value or "").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Return raw string — engine.py handles unparsable dates gracefully
    return raw


# ── Row extraction ─────────────────────────────────────────────────────────

def _row_to_transaction(
    row: Dict[str, Any],
    col_map: Dict[str, str],
    index: int,
) -> Optional[Dict[str, Any]]:
    """
    Maps a raw PDF table row to a NormalizedTransaction-shaped dict.
    Returns None if the row has no usable amount (header repeat, total
    rows, blank rows).
    """
    canonical: Dict[str, Any] = {}
    for original, value in row.items():
        canon = col_map.get(original)
        if canon:
            canonical[canon] = value

    # Resolve amount — M-Pesa has paid_in/withdrawn, banks may have single amount
    paid_in = _parse_amount(canonical.get("paid_in"))
    withdrawn = _parse_amount(canonical.get("withdrawn"))
    raw_amount = _parse_amount(canonical.get("amount"))

    if paid_in > 0:
        amount = paid_in
        tx_type = "Income"
    elif withdrawn > 0:
        amount = withdrawn
        tx_type = "Expense"
    elif raw_amount != 0:
        amount = abs(raw_amount)
        tx_type = "Income" if raw_amount > 0 else "Expense"
    else:
        return None  # No usable amount — skip (totals row, blank row, etc.)

    # Infer type from cr/dr column if present and amount-based type is ambiguous
    raw_type = str(canonical.get("type") or "").strip().upper()
    if raw_type in ("CR", "CREDIT"):
        tx_type = "Income"
    elif raw_type in ("DR", "DEBIT"):
        tx_type = "Expense"

    ref = str(canonical.get("ref") or f"pdf-{index}").strip()
    date = _parse_date(canonical.get("date"))
    description = str(canonical.get("description") or "").strip()

    if not date and not description and amount == 0:
        return None

    return {
        "id": ref or f"pdf-{index}",
        "date": date,
        "amount": amount,
        "description": description,
        "vendor": description,   # best proxy available from PDF
        "category": "Uncategorized",
        "type": tx_type,
        "source": "PDF",
        "raw": {k: str(v) for k, v in row.items()},
    }


# ── PDF extraction ─────────────────────────────────────────────────────────

def extract_transactions(pdf_path: str) -> List[Dict[str, Any]]:
    transactions = []
    seen_refs: set = set()

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                sys.stderr.write(
                    f"[extract_pdf] Page {page_num + 1}: no tables found, skipping.\n"
                )
                continue

            for table in tables:
                if not table or len(table) < 2:
                    continue

                # First row is the header
                headers = [str(h or "").strip() for h in table[0]]
                col_map = _map_columns(headers)

                if not col_map:
                    sys.stderr.write(
                        f"[extract_pdf] Page {page_num + 1}: no recognised columns "
                        f"in headers {headers} — skipping table.\n"
                    )
                    continue

                for row_index, raw_row in enumerate(table[1:]):
                    row_dict = {
                        headers[i]: raw_row[i] if i < len(raw_row) else None
                        for i in range(len(headers))
                    }
                    tx = _row_to_transaction(row_dict, col_map, row_index)
                    if tx is None:
                        continue

                    # Deduplicate by ref within this extraction run
                    ref = tx["id"]
                    if ref in seen_refs:
                        tx["id"] = f"{ref}-{row_index}"
                    seen_refs.add(tx["id"])

                    transactions.append(tx)

    return transactions


# ── CLI entrypoint ─────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python extract_pdf.py <path_to_pdf>\n")
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        transactions = extract_transactions(pdf_path)
    except Exception as e:
        sys.stderr.write(f"[extract_pdf] Extraction failed: {e}\n")
        sys.exit(1)

    if not transactions:
        sys.stderr.write(
            "[extract_pdf] Warning: no transactions extracted. "
            "The PDF may use a non-tabular layout or an unrecognised column structure.\n"
        )

    json.dump(transactions, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()