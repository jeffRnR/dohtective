"""
python-service/main.py
FastAPI service exposing the canonical detection engine (backend/engine.py)
and the Google Sheets notification workflow over HTTP, for the Next.js
frontend to call.

Run:
    uvicorn main:app --reload --port 8000

Endpoints:
    POST /analyze              -> runs backend/engine.build_report() on the
                                   posted payload, returns the report JSON
    POST /notify/sheets        -> pushes a report to Google Sheets
                                   (raises 412 if Sheets isn't configured —
                                   see backend/notifications/sheets_dashboard.py)
    GET  /notify/sheets/status -> cheap check of whether Sheets is configured
    GET  /health                -> liveness check
"""

from __future__ import annotations
import sys
from pathlib import Path

# backend/engine.py lives one directory up — add it to the path rather than
# duplicating the file. This is intentional: engine.py is canonical, this
# service is a thin HTTP wrapper around it, not a second implementation.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import tempfile
import os

import engine  # backend/engine.py — canonical detection logic
from notifications import sheets_dashboard
from documents.extract_receipt import extract_receipt
from documents.extract_bank_statement import extract_bank_statement
from documents.extract_kra_document import extract_kra_document
from documents.extract_etims import extract_etims_receipt
from documents.extract_mpesa import extract_mpesa_statement

app = FastAPI(title="Dohtective Detection Engine", version="1.0.0")

# Next.js dev server origin — tighten this to the real deployed frontend
# origin before going to production. Wide-open CORS is a fine default for
# a hackathon MVP talking to localhost, not for a public deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3847"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    invoices: List[Dict[str, Any]] = []
    bank_statements: List[Dict[str, Any]] = []
    supporting_documents: List[Dict[str, Any]] = []
    business_billers: List[Dict[str, Any]] = []


class NotifySheetsRequest(BaseModel):
    report: Dict[str, Any]
    business_name: str = "Business"


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze(payload: AnalyzeRequest) -> Dict[str, Any]:
    """Runs the canonical detection engine. Mirrors the shape engine.py's
    CLI already accepts — this endpoint exists so Next.js can call over
    HTTP instead of shelling out to a subprocess."""
    try:
        report = engine.build_report(payload.model_dump())
    except Exception as e:
        # Surface the real error rather than a generic 500 — during a
        # 7-day build, a vague failure costs more debugging time than an
        # honest stack trace does embarrassment.
        raise HTTPException(status_code=400, detail=f"Detection engine error: {e}") from e
    return {"report": report}


@app.get("/notify/sheets/status")
def sheets_status() -> Dict[str, bool]:
    return {"configured": sheets_dashboard.is_configured()}


@app.post("/notify/sheets")
def notify_sheets(payload: NotifySheetsRequest) -> Dict[str, Any]:
    """Pushes a report to Google Sheets. Returns 412 Precondition Failed
    (not 500) when credentials aren't set — this is a configuration state
    the frontend should handle gracefully (e.g. show a 'connect Google
    Sheets' prompt), not treat as a server crash."""
    try:
        result = sheets_dashboard.push_report_to_sheet(payload.report, payload.business_name)
    except sheets_dashboard.NotConfiguredError as e:
        raise HTTPException(status_code=412, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Google Sheets API error: {e}") from e
    return result


# ─────────────────────────────────────────────────────────────────────────
# Document extraction — Step 2 of onboarding (optional, improves accuracy
# and supports Kenyan regulatory compliance checks). Covers all four
# document types: receipts, bank statements, eTIMS receipts, and KRA
# PIN/business registration certificates.
# ─────────────────────────────────────────────────────────────────────────

VALID_DOCUMENT_KINDS = {"receipt", "bank_statement", "etims", "kra_pin", "business_registration", "mpesa"}


@app.post("/documents/extract")
async def extract_document(
    document_kind: str = Form(...),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    """Accepts a single uploaded document and routes it to the correct
    extractor by document_kind. Returns the ExtractedDocument shape
    (models.ExtractedDocument) as JSON — confidence, line items, metadata,
    and warnings, never asserted as fact without warnings if extraction
    was uncertain."""
    if document_kind not in VALID_DOCUMENT_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown document_kind '{document_kind}'. Must be one of: {sorted(VALID_DOCUMENT_KINDS)}",
        )

    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        if document_kind == "receipt":
            result = extract_receipt(tmp_path)
        elif document_kind == "bank_statement":
            result = extract_bank_statement(tmp_path)
        elif document_kind == "etims":
            result = extract_etims_receipt(tmp_path)
        elif document_kind == "mpesa":
            result = extract_mpesa_statement(tmp_path)
        elif document_kind in ("kra_pin", "business_registration"):
            result = extract_kra_document(tmp_path, document_kind)  # type: ignore[arg-type]
        else:
            # Unreachable given the VALID_DOCUMENT_KINDS check above, but
            # keeps the type checker honest about exhaustiveness.
            raise HTTPException(status_code=400, detail=f"No extractor wired for '{document_kind}'.")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not process document: {e}") from e
    finally:
        os.unlink(tmp_path)

    # Use the original uploaded filename in the response, not the temp path.
    result.source_filename = file.filename or result.source_filename
    return result.model_dump()