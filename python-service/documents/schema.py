"""
documents/schema.py
Shared helpers for all document extractors. 
Optimized for speed: Uses pypdf for text-layer extraction to avoid 
unnecessary OCR on digital PDFs.
"""

from __future__ import annotations
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from pypdf import PdfReader  # Faster text extraction
from PIL import Image
import pytesseract

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}

# Matches "KES 12,345.00", "Ksh 12,345", "12,345.00", "12345"
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
    for fmt, pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            try:
                parsed = datetime.strptime(match.group(1), fmt)
                return parsed.date().isoformat()
            except ValueError:
                continue
    return None

# ── Optimized PDF/OCR Extraction ──

def extract_pdf_text_layer(path: Path, max_pages: int = 5) -> Optional[str]:
    """
    Extracts text using pypdf. 
    Optimization: Only reads the first 'max_pages' to ensure fast response times 
    for large bank statements.
    """
    try:
        reader = PdfReader(str(path))
        text_content = []
        
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            content = page.extract_text()
            if content:
                text_content.append(content)
        
        return "\n".join(text_content).strip() or None
    except Exception as e:
        print(f"pypdf extraction failed: {e}")
        return None

def extract_pdf_via_ocr(path: Path) -> str:
    import pdf2image
    images = pdf2image.convert_from_path(str(path))
    return "\n".join(pytesseract.image_to_string(img) for img in images)

def extract_image_via_ocr(path: Path) -> str:
    img = Image.open(path)
    return pytesseract.image_to_string(img)

def extract_text_with_method(path: Path) -> tuple[str, str, list[str]]:
    """Unified entry point: tries text layer first, falls back to OCR."""
    warnings: list[str] = []
    if path.suffix.lower() == ".pdf":
        text_layer = extract_pdf_text_layer(path)
        if text_layer:
            return text_layer, "text_layer", warnings
        
        warnings.append("PDF had no extractable text layer — fell back to OCR.")
        return extract_pdf_via_ocr(path), "ocr", warnings
        
    elif path.suffix.lower() in IMAGE_EXTENSIONS:
        return extract_image_via_ocr(path), "ocr", warnings
    
    else:
        warnings.append(f"Unrecognized file type '{path.suffix}' — attempted OCR anyway.")
        return extract_image_via_ocr(path), "ocr", warnings