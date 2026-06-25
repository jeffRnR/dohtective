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
    """Ships the compiled report to the Next.js on-chain anchor API.
    
    Payload shape matches what /api/anchor expects:
    - flags: list of {title, severity} — used to build the deterministic hash
    - cashBufferDays: int — included in the hash so cash position is anchored too
    
    Non-fatal: if the webhook fails, the report is still returned to the caller.
    The anchor failure is logged and stored in anchorStatus="failed" by the API.
    """
    headers = {
        "Authorization": f"Bearer {DETECTION_ENGINE_SECRET}",
        "Content-Type": "application/json"
    }

    # Extract flags in the shape the anchor route expects
    raw_flags = report.get("flags", [])
    flags = [
        {"title": f.get("title", ""), "severity": f.get("severity", "low")}
        for f in raw_flags
        if f.get("title")
    ]

    payload = {
        "businessId": business_id,
        "anomalySummary": report.get("plain_language", [""])[0] if report.get("plain_language") else "Analysis complete.",
        "severeRiskCount": sum(1 for f in raw_flags if f.get("severity") == "high"),
        "rawLedgerData": {
            "flags": flags,
            "cashBufferDays": report.get("cash_buffer_days", 0),
        }
    }

    try:
        response = requests.post(NEXTJS_WEBHOOK_URL, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            data = response.json()
            sys.stderr.write(
                f"🚀 [Avalanche] Anchored. Tx: {data.get('transactionHash', 'unknown')}\n"
            )
        else:
            sys.stderr.write(
                f"❌ [Avalanche] Anchor failed ({response.status_code}): {response.text}\n"
            )
    except Exception as e:
        sys.stderr.write(f"⚠️ [Avalanche] Webhook unreachable: {str(e)}\n")

        
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