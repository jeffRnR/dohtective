# backend/main.py
"""
FastAPI server — the hosted equivalent of the child_process bridge.

Endpoints:
  POST /analyze        — runs build_report() on a transaction payload
  POST /documents/extract — extracts transactions from a PDF or CSV/Excel file
  GET  /health         — liveness check for Render/Docker health checks

All endpoints that previously ran via child_process in Next.js API routes
now call this server via HTTP. DETECTION_SERVICE_URL in Vercel env vars
points here.
"""

import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from engine import build_report
from extract_csv import extract_transactions as extract_csv_transactions
from extract_pdf import extract_transactions as extract_pdf_transactions

app = FastAPI(title="Dohtective Detection Engine", version="1.0.0")

# ── CORS middleware — must be registered BEFORE the auth middleware ────────
# CORSMiddleware handles OPTIONS preflight requests. If auth runs first,
# preflight requests get a 401 before CORS headers are ever set, breaking
# every browser request.
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOW_ORIGINS] if ALLOW_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth middleware — registered AFTER CORS ───────────────────────────────
# Verifies the Bearer token sent by Next.js API routes. /health is exempt
# so Render/Railway health checks work without credentials.
DETECTION_ENGINE_SECRET = os.getenv("DETECTION_ENGINE_SECRET", "")


@app.middleware("http")
async def verify_engine_secret(request: Request, call_next):
    # Health check and CORS preflight are always allowed
    if request.url.path == "/health" or request.method == "OPTIONS":
        return await call_next(request)

    if not DETECTION_ENGINE_SECRET:
        print(
            "[WARNING] DETECTION_ENGINE_SECRET not set — auth disabled",
            file=sys.stderr,
        )
        return await call_next(request)

    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if token != DETECTION_ENGINE_SECRET:
        return JSONResponse({"detail": "Unauthorized."}, status_code=401)

    return await call_next(request)


# ── Request / response models ──────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    transactions: List[Dict[str, Any]] = []
    invoices: List[Dict[str, Any]] = []
    bank_statements: List[Dict[str, Any]] = []
    supporting_documents: List[Dict[str, Any]] = []
    business_billers: List[Dict[str, Any]] = []
    starting_cash_balance: float | None = None
    businessId: str = "unknown"


class AnalyzeResponse(BaseModel):
    report: Dict[str, Any]
    reportHash: str  # SHA-256 of the report JSON for Avalanche anchoring


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Liveness check — Render and Docker use this to confirm the service is up."""
    return {"status": "ok", "service": "dohtective-detection-engine"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    """
    Main analysis endpoint. Accepts a structured payload and returns a
    full report from build_report() plus a SHA-256 hash for anchoring.

    Called by:
      - app/api/business/[slug]/analyse/route.ts (Run Analysis button)
      - app/api/zoho/sync/route.ts (post-sync analysis)
      - app/api/analyze/standalone-document/route.ts (landing page sandbox)
    """
    payload = {
        "transactions": req.transactions,
        "invoices": req.invoices,
        "bank_statements": req.bank_statements,
        "supporting_documents": req.supporting_documents,
        "business_billers": req.business_billers,
        "businessId": req.businessId,
    }
    if req.starting_cash_balance is not None:
        payload["starting_cash_balance"] = req.starting_cash_balance

    try:
        report = build_report(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection engine error: {str(e)}")

    # Deterministic hash of the report for Avalanche anchoring.
    # sort_keys=True ensures the same report always produces the same hash
    # regardless of dict insertion order.
    report_json = json.dumps(report, sort_keys=True, ensure_ascii=False)
    report_hash = hashlib.sha256(report_json.encode()).hexdigest()

    return {"report": report, "reportHash": report_hash}


@app.post("/documents/extract")
async def extract_document(
    file: UploadFile = File(...),
    document_kind: str = Form("bank_statement"),
    slug: str = Form("unknown"),
):
    """
    Extracts NormalizedTransaction[] from an uploaded PDF or CSV/Excel file.

    Called by:
      - app/api/business/[slug]/files/route.ts (POST — upload new file)
      - app/api/analyze/standalone-document/route.ts (landing page sandbox)
    """
    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        if suffix == ".pdf":
            transactions = extract_pdf_transactions(tmp_path)
        elif suffix in (".xlsx", ".xls", ".csv"):
            transactions = extract_csv_transactions(tmp_path)
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type '{suffix}'. Accepted: .pdf, .csv, .xlsx, .xls",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
    finally:
        os.unlink(tmp_path)

    if not transactions:
        raise HTTPException(
            status_code=422,
            detail=(
                "No transactions could be extracted from this file. "
                "Make sure it is a standard M-Pesa statement, bank statement, "
                "or CSV/Excel export with recognisable column headers."
            ),
        )

    return {
        "transactions": transactions,
        "filename": filename,
        "document_kind": document_kind,
        "count": len(transactions),
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8123))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)