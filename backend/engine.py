"""
backend/engine.py
CLI entrypoint — reads a payload from a file argument or stdin,
runs build_report, sends the output to the Next.js Avalanche anchoring webhook,
and writes the result to stdout as JSON.

Backward compatibility for `from engine import build_report` remains intact.
"""

import json
import os
import sys
import requests

from detection.report_builder import build_report  # noqa: F401

# Webhook configuration - configure these locally or in your host environment
NEXTJS_WEBHOOK_URL = os.getenv("NEXTJS_ANCHOR_URL", "http://localhost:3000/api/anchor")
DETECTION_ENGINE_SECRET = os.getenv("DETECTION_ENGINE_SECRET", "YOUR_GENERATED_DETECTION_ENGINE_SECRET")

def send_to_avalanche_webhook(business_id: str, report: dict) -> None:
    """Ships the compiled report details to the Next.js on-chain anchor API."""
    headers = {
        "Authorization": f"Bearer {DETECTION_ENGINE_SECRET}",
        "Content-Type": "application/json"
    }
    
    # Safely extract dynamic values from your engine's standardized report layout
    # Adjust the dictionary lookups if your report schema uses different keys
    payload = {
        "businessId": business_id,
        "anomalySummary": report.get("summary", "Automated anomaly evaluation complete."),
        "severeRiskCount": report.get("severe_risk_count", len(report.get("anomalies", []))),
        "rawLedgerData": {
            "items": report.get("flagged_items", report.get("anomalies", []))
        }
    }
    
    try:
        response = requests.post(NEXTJS_WEBHOOK_URL, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            sys.stderr.write(f"🚀 [Avalanche Sync] Success! Tx Hash: {response.json().get('transactionHash')}\n")
        else:
            sys.stderr.write(f"❌ [Avalanche Sync] API Error ({response.status_code}): {response.text}\n")
    except Exception as e:
        sys.stderr.write(f"⚠️ [Avalanche Sync] Failed connecting to webhook: {str(e)}\n")

def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as fd:
            payload = json.load(fd)
    else:
        payload = json.load(sys.stdin)

    # 1. Generate the core anomaly report using the detection package
    report = build_report(payload)
    
    # 2. Extract business target token and dispatch webhook asynchronously/sequentially 
    # Assumes your payload root contains a clear structural identifier for the client entity
    business_id = payload.get("businessId", "unknown_biz_fallback")
    send_to_avalanche_webhook(business_id, report)

    # 3. Keep original standard output design operational for piping commands
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()