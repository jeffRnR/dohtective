"""
documents/extract_receipt.py
Extracts structured data from an uploaded receipt or invoice — image or
PDF. Used to verify a flagged transaction, not to auto-create new ones:
the output is evidence a founder or accountant reviews, not a fact the
system asserts on its own.

PDF/OCR extraction strategy lives in documents/schema.py (shared with
extract_etims.py, which has the same document shape). This file only adds
receipt-specific interpretation on top: guessing a vendor name, deciding
confidence from what was actually recovered.
"""

from __future__ import annotations
from pathlib import Path

from models import ExtractedDocument, ExtractedLineItem
from documents.schema import extract_amount, extract_date, extract_text_with_method


def extract_receipt(file_path: str) -> ExtractedDocument:
    path = Path(file_path)
    raw_text, extraction_method, warnings = extract_text_with_method(path)

    amount = extract_amount(raw_text)
    date = extract_date(raw_text)

    # First non-empty line is usually the vendor/business name on a Kenyan
    # receipt — a weak heuristic, surfaced as metadata for human review,
    # not asserted as fact.
    first_line = next((line.strip() for line in raw_text.splitlines() if line.strip()), "")

    if amount is None:
        warnings.append("Could not confidently extract an amount from this document — review manually.")
    if date is None:
        warnings.append("Could not confidently extract a date from this document — review manually.")

    confidence = "medium" if extraction_method == "text_layer" else "low"
    if amount is not None and date is not None and extraction_method == "text_layer":
        confidence = "high"

    return ExtractedDocument(
        document_kind="receipt",
        source_filename=path.name,
        extraction_method=extraction_method,
        confidence=confidence,
        line_items=[ExtractedLineItem(
            description=first_line or "Unrecognized receipt",
            amount=amount,
            date=date,
            raw_text=raw_text[:2000],
        )],
        metadata={"likely_vendor": first_line} if first_line else {},
        warnings=warnings,
    )