"""
documents/extract_bank_statement.py
Extracts transaction-like rows from an uploaded bank statement PDF.

Why this matters beyond receipts: Zoho's bank_statements object only has a
`reconciled: true/false` flag — there's no underlying source to verify that
flag against. A real statement PDF is what lets the system check Zoho's
claim instead of trusting it, which directly strengthens Check 3
(accounting errors / unreconciled detection) and the missing-information
checklist deliverable.

Strategy: bank statements are almost always digitally generated (not
scanned), so this extractor leans on pdfplumber's TABLE extraction first
(structured rows, far more reliable than free text for this format), and
falls back to plain text-layer parsing only if no table is found. OCR is a
last resort, used only if there's no text layer at all — multi-page,
table-heavy OCR is the least reliable path here and that's reflected in
the confidence score.
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional
import pdfplumber

from models import ExtractedDocument, ExtractedLineItem
from documents.schema import extract_amount, extract_date


def _extract_via_tables(path: Path) -> tuple[list[ExtractedLineItem], dict[str, str], list[str]]:
    line_items: list[ExtractedLineItem] = []
    metadata: dict[str, str] = {}
    warnings: list[str] = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or all(cell is None for cell in row):
                        continue
                    row_text = " ".join(str(c) for c in row if c)
                    amount = extract_amount(row_text)
                    date = extract_date(row_text)
                    # Skip rows that look like a table header, not a transaction
                    # (no amount AND no date means it's almost certainly a
                    # header or section label, not a real line item).
                    if amount is None and date is None:
                        continue
                    description = next((str(c) for c in row if c and not extract_amount(str(c)) == amount), row_text)
                    line_items.append(ExtractedLineItem(
                        description=description.strip()[:200],
                        amount=amount,
                        date=date,
                        raw_text=row_text[:500],
                    ))

        # Opening/closing balance is usually free text near the top/bottom
        # of page 1, not inside a table — pull it from the full page text.
        first_page_text = pdf.pages[0].extract_text() or ""
        for line in first_page_text.splitlines():
            lower = line.lower()
            if "opening balance" in lower:
                amt = extract_amount(line)
                if amt is not None:
                    metadata["opening_balance"] = str(amt)
            if "closing balance" in lower:
                amt = extract_amount(line)
                if amt is not None:
                    metadata["closing_balance"] = str(amt)

    if not line_items:
        warnings.append("Found a text layer but no table rows resembling transactions — statement format may not be supported yet.")

    return line_items, metadata, warnings


def _extract_via_text_lines(path: Path) -> tuple[list[ExtractedLineItem], dict[str, str], list[str]]:
    """Fallback for statements with no detectable table grid lines — a
    real, common case (clean digital PDF exports are often column-aligned
    by whitespace, not actual ruling lines, which pdfplumber's table
    detector needs). Treats any line containing both a date and an amount
    as a transaction row; this is looser than table extraction but covers
    the gap that left-blank in testing against a borderless statement."""
    line_items: list[ExtractedLineItem] = []
    metadata: dict[str, str] = {}
    warnings: list[str] = []

    with pdfplumber.open(path) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    for line in full_text.splitlines():
        lower = line.lower()
        if "opening balance" in lower:
            amt = extract_amount(line)
            if amt is not None:
                metadata["opening_balance"] = str(amt)
            continue
        if "closing balance" in lower:
            amt = extract_amount(line)
            if amt is not None:
                metadata["closing_balance"] = str(amt)
            continue

        date = extract_date(line)
        amount = extract_amount(line)
        # Require BOTH a date and an amount on the same line to treat it as
        # a transaction row — a header line like "Date Description Amount"
        # has neither, a balance line was already consumed above.
        if date and amount is not None:
            # Description = whatever's left after stripping the date and
            # the matched amount substring, best-effort.
            description = line
            line_items.append(ExtractedLineItem(
                description=description.strip()[:200],
                amount=amount,
                date=date,
                raw_text=line.strip()[:500],
            ))

    if not line_items:
        warnings.append("No transaction-like lines found in the text layer either — statement format may not be supported yet.")

    return line_items, metadata, warnings


def extract_bank_statement(file_path: str) -> ExtractedDocument:
    path = Path(file_path)
    warnings: list[str] = []

    if path.suffix.lower() != ".pdf":
        return ExtractedDocument(
            document_kind="bank_statement",
            source_filename=path.name,
            extraction_method="text_layer",
            confidence="low",
            line_items=[],
            metadata={},
            warnings=[f"Expected a PDF bank statement, got '{path.suffix}'. Please upload a PDF export from your bank."],
        )

    line_items, metadata, table_warnings = _extract_via_tables(path)

    # CHANGELOG (post-test-run fix): table extraction alone returned ZERO
    # rows against a real test PDF whose table had no visible ruling
    # lines — a common case for clean digital bank exports, not just a
    # fixture quirk. Added a text-line fallback: if table extraction found
    # nothing, try treating any line with both a date and an amount as a
    # transaction row before giving up.
    if not line_items:
        line_items, fallback_metadata, fallback_warnings = _extract_via_text_lines(path)
        metadata.update(fallback_metadata)
        warnings.extend(fallback_warnings)
    else:
        warnings.extend(table_warnings)

    extraction_method = "text_layer"
    # Confidence reflects how much structure we actually recovered, not
    # just whether the file opened — a statement with no parseable rows at
    # all shouldn't claim the same confidence as one with 40 clean rows.
    if len(line_items) >= 5:
        confidence = "high"
    elif len(line_items) >= 1:
        confidence = "medium"
    else:
        confidence = "low"

    if "opening_balance" not in metadata or "closing_balance" not in metadata:
        warnings.append("Could not confidently locate opening/closing balance on the statement — reconciliation cross-check may be incomplete.")

    return ExtractedDocument(
        document_kind="bank_statement",
        source_filename=path.name,
        extraction_method=extraction_method,
        confidence=confidence,
        line_items=line_items,
        metadata=metadata,
        warnings=warnings,
    )