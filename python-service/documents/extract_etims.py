"""
documents/extract_etims.py
Extracts data from KRA eTIMS-generated sales receipts/invoices.

eTIMS (electronic Tax Invoice Management System) receipts carry a few
fields a generic receipt doesn't: a Control Unit Invoice Number (CU
serial), a QR code, and an explicit tax breakdown. The signal this
extractor exists to support: comparing an eTIMS receipt's amount/date
against what Zoho Books recorded as a sale. A mismatch — or a sale in
Zoho with no corresponding eTIMS receipt at all — is one of the closest
things to real fraud/tax-risk detection a 7-day MVP can credibly claim,
since it's cross-checking the business's own books against an
independent, KRA-controlled record.

Reuses the receipt extractor's OCR/text-layer strategy (same document
shape: short, single-page, image-or-PDF) but adds eTIMS-specific field
patterns on top.
"""

from __future__ import annotations
from pathlib import Path
import re

from models import ExtractedDocument, ExtractedLineItem
from documents.schema import extract_amount, extract_date, extract_text_with_method

# eTIMS Control Unit Invoice Number — format varies by device/version, but
# is consistently labeled "CU INVOICE NO" or similar on the printed
# receipt. Looser pattern than the KRA PIN since this isn't standardized
# the way the PIN format is — surfaced for confirmation, not asserted.
CU_INVOICE_PATTERN = re.compile(r"(?:CU\s*INVOICE\s*NO|CONTROL\s*UNIT\s*(?:INVOICE)?)[:\s.]*([A-Z0-9/\-]{4,30})", re.IGNORECASE)
TAX_AMOUNT_PATTERN = re.compile(r"(?:VAT|TAX)[:\s]+(?:KES|Ksh\.?)?\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)


def extract_etims_receipt(file_path: str) -> ExtractedDocument:
    path = Path(file_path)
    raw_text, extraction_method, warnings = extract_text_with_method(path)

    amount = extract_amount(raw_text)
    date = extract_date(raw_text)

    metadata: dict[str, str] = {}
    cu_match = CU_INVOICE_PATTERN.search(raw_text)
    if cu_match:
        metadata["cu_invoice_number"] = cu_match.group(1).strip()
    else:
        warnings.append("Could not find a Control Unit invoice number — confirm this is a genuine eTIMS receipt, not a generic receipt.")

    tax_match = TAX_AMOUNT_PATTERN.search(raw_text)
    if tax_match:
        try:
            metadata["tax_amount"] = str(float(tax_match.group(1).replace(",", "")))
        except ValueError:
            pass

    has_cu_number = "cu_invoice_number" in metadata
    if extraction_method == "text_layer" and has_cu_number and amount is not None:
        confidence = "high"
    elif has_cu_number or (amount is not None and date is not None):
        confidence = "medium"
    else:
        confidence = "low"

    if amount is None:
        warnings.append("Could not confidently extract an amount — manual review needed before cross-checking against Zoho sales.")

    return ExtractedDocument(
        document_kind="etims",
        source_filename=path.name,
        extraction_method=extraction_method,
        confidence=confidence,
        line_items=[ExtractedLineItem(
            description="eTIMS sales receipt",
            amount=amount,
            date=date,
            raw_text=raw_text[:2000],
        )],
        metadata=metadata,
        warnings=warnings,
    )