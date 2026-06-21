"""
documents/schema.py
Shared helpers for all four document extractors (receipt, bank statement,
eTIMS, KRA/registration). Keeping amount/date parsing AND the core
PDF-text/OCR extraction primitives in one place means a Kenyan-format fix,
or a bug in how we fall back to OCR, only needs fixing once — not three or
four times with three or four chances to drift.
"""

from __future__ import annotations
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import pdfplumber
from PIL import Image
import pytesseract

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}

# Matches "KES 12,345.00", "Ksh 12,345", "12,345.00", "12345" — common
# formats seen across Kenyan receipts, bank statements, and eTIMS records.
AMOUNT_PATTERN = re.compile(
    r"(?:KES|Ksh\.?|KSH)?\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{1,2})?)",
    re.IGNORECASE,
)

DATE_PATTERNS = [
    ("%d/%m/%Y", re.compile(r"\b(\d{1,2}/\d{1,2}/\d{4})\b")),
    ("%d-%m-%Y", re.compile(r"\b(\d{1,2}-\d{1,2}-\d{4})\b")),
    ("%Y-%m-%d", re.compile(r"\b(\d{4}-\d{1,2}-\d{1,2})\b")),
    ("%d %b %Y", re.compile(r"\b(\d{1,2} [A-Za-z]{3} \d{4})\b")),
]


def extract_amount(text: str) -> Optional[float]:
    """Best-effort amount extraction. Returns the LARGEST plausible amount
    found, on the heuristic that a receipt/statement line's total is
    usually the biggest number on the line (line-item quantities and unit
    prices tend to be smaller than the line total)."""
    matches = AMOUNT_PATTERN.findall(text)
    if not matches:
        return None
    candidates = []
    for m in matches:
        try:
            candidates.append(float(m.replace(",", "")))
        except ValueError:
            continue
    return max(candidates) if candidates else None


def extract_date(text: str) -> Optional[str]:
    """Returns ISO format (YYYY-MM-DD) if a recognizable date is found."""
    for fmt, pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            try:
                parsed = datetime.strptime(match.group(1), fmt)
                return parsed.date().isoformat()
            except ValueError:
                continue
    return None


# ── Shared PDF/OCR extraction primitives ──
# Used by extract_receipt.py and extract_etims.py, which share the same
# document shape (short, single/few-page, image-or-PDF). Bank statements
# and KRA/registration docs have different enough needs (table extraction;
# label-pattern matching on official certs) that they implement their own
# variants rather than forcing a one-size-fits-all abstraction here.

def extract_pdf_text_layer(path: Path) -> Optional[str]:
    try:
        with pdfplumber.open(path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            return text.strip() or None
    except Exception:
        return None


def extract_pdf_via_ocr(path: Path) -> str:
    import pdf2image
    images = pdf2image.convert_from_path(str(path))
    return "\n".join(pytesseract.image_to_string(img) for img in images)


def extract_image_via_ocr(path: Path) -> str:
    img = Image.open(path)
    return pytesseract.image_to_string(img)


def extract_text_with_method(path: Path) -> tuple[str, str, list[str]]:
    """Unified entry point: tries PDF text layer, falls back to OCR for
    PDFs without one, or runs OCR directly for images. Returns
    (raw_text, extraction_method, warnings)."""
    warnings: list[str] = []
    if path.suffix.lower() == ".pdf":
        text_layer = extract_pdf_text_layer(path)
        if text_layer:
            return text_layer, "text_layer", warnings
        warnings.append("PDF had no extractable text layer — fell back to OCR. Scanned documents are more error-prone.")
        return extract_pdf_via_ocr(path), "ocr", warnings
    elif path.suffix.lower() in IMAGE_EXTENSIONS:
        return extract_image_via_ocr(path), "ocr", warnings
    else:
        warnings.append(f"Unrecognized file type '{path.suffix}' — attempted OCR anyway, results may be unreliable.")
        return extract_image_via_ocr(path), "ocr", warnings