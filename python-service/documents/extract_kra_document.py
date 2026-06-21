"""
documents/extract_kra_document.py
Extracts identity/compliance fields from KRA PIN certificates and business
registration certificates (BRS Certificate of Incorporation / Business
Name registration).

These are NOT transaction documents — there are no line items to extract.
The goal is a small number of identifier fields (PIN number, registered
business name, registration number, registration date) that let the system
answer two questions Zoho Books structurally cannot:
  1. Is this business legally registered at all, or is it pre-registration
     (which changes how "mixed personal/business funds" should be framed —
     see the build plan's onboarding checklist discussion)?
  2. Does the registered business name match the name Zoho Books has on
     file? A mismatch is itself a worthwhile flag.

Both document types are typically clean, single-page, text-based PDFs
(government-issued certificates) or clear photos/scans of the same — so
this extractor is simpler than the receipt/bank-statement ones: mostly
pattern-matching known label formats, with OCR fallback for photographed
certificates.
"""

from __future__ import annotations
from pathlib import Path
import re

from models import ExtractedDocument, ExtractedLineItem, DocumentKind
from documents.schema import extract_text_with_method

# KRA PIN format: A001234567Z (1 letter, 9 digits, 1 letter) — distinctive
# enough to extract with high confidence wherever it appears in the text.
KRA_PIN_PATTERN = re.compile(r"\b([A-Z]\d{9}[A-Z])\b")

# BRS registration numbers vary in format (e.g. "PVT-AbCdEfG" for private
# companies, "BN/2024/123456" for business names) — kept as a looser
# pattern, surfaced for human confirmation rather than asserted as
# definitely correct, since format variance here is real and unresolved
# without seeing actual sample certificates.
REGISTRATION_NUMBER_PATTERN = re.compile(r"\b(BN/\d{4}/\d+|PVT-[A-Za-z0-9]+|C\.\d+/\d+)\b")


def _extract_business_name(text: str) -> str | None:
    """Looks for a line following common label patterns on KRA/BRS
    certificates. Anchored to the START of a line (re.MULTILINE + ^) —
    without that anchor, a heading like 'Certificate of Business Name
    Registration' gets matched as if 'Registration' were the captured
    name, since the unanchored pattern grabs the first 'Business Name'
    occurrence anywhere in the text, not just where it's actually used as
    a field label. This is a heuristic, not a guarantee — surfaced as
    metadata for human confirmation, same as the receipt extractor's
    vendor-name guess."""
    patterns = [
        r"^(?:Taxpayer Name|Business Name|Registered Name|Name of (?:Business|Company))[:\s]+([A-Z][A-Za-z0-9 &\.\-]{2,80})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).strip()
    return None


def extract_kra_document(file_path: str, document_kind: DocumentKind) -> ExtractedDocument:
    """document_kind should be 'kra_pin' or 'business_registration' — both
    routed through this one function since the extraction approach (label
    pattern matching on a short official document) is the same for both;
    only the patterns checked differ."""
    path = Path(file_path)
    raw_text, extraction_method, warnings = extract_text_with_method(path)
    metadata: dict[str, str] = {}

    if document_kind == "kra_pin":
        pin_match = KRA_PIN_PATTERN.search(raw_text)
        if pin_match:
            metadata["kra_pin"] = pin_match.group(1)
        else:
            warnings.append("Could not find a KRA PIN matching the expected format (e.g. A001234567Z) — please confirm this is a PIN certificate.")
    elif document_kind == "business_registration":
        reg_match = REGISTRATION_NUMBER_PATTERN.search(raw_text)
        if reg_match:
            metadata["registration_number"] = reg_match.group(1)
        else:
            warnings.append("Could not find a recognizable registration number — format may differ from what this extractor expects. Treat as unverified.")

    business_name = _extract_business_name(raw_text)
    if business_name:
        metadata["registered_business_name"] = business_name
    else:
        warnings.append("Could not confidently extract the registered business name — please confirm manually against Zoho Books' company name.")

    has_identifier = "kra_pin" in metadata or "registration_number" in metadata
    if extraction_method == "text_layer" and has_identifier:
        confidence = "high"
    elif has_identifier:
        confidence = "medium"  # OCR found something, but OCR is less trustworthy
    else:
        confidence = "low"

    return ExtractedDocument(
        document_kind=document_kind,
        source_filename=path.name,
        extraction_method=extraction_method,
        confidence=confidence,
        line_items=[ExtractedLineItem(
            description=f"{document_kind.replace('_', ' ').title()} document",
            amount=None,
            date=None,
            raw_text=raw_text[:2000],
        )],
        metadata=metadata,
        warnings=warnings,
    )