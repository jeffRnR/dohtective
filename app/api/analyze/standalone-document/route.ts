// app/api/analyze/standalone-document/route.ts
// Public endpoint — no auth required. Called from the landing page sandbox
// so visitors can try the product without signing up. Does not persist
// any data, does not touch the DB. Rate-limited by IP to prevent abuse.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rate-limit";

const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

export async function POST(req: NextRequest) {
  // Rate limit — 5 sandbox analyses per hour per IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(`sandbox:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing or invalid file." },
      { status: 400 }
    );
  }

  const originalName = (file as File).name ?? "upload.pdf";
  const mimeType = file.type ?? "application/octet-stream";

  try {
    // Step 1: Extract transactions via FastAPI
    const extractForm = new FormData();
    extractForm.append(
      "file",
      new Blob([await file.arrayBuffer()], { type: mimeType }),
      originalName
    );
    extractForm.append("document_kind", "mpesa");
    extractForm.append("slug", "sandbox");

    const extractRes = await fetch(
      `${DETECTION_SERVICE_URL}/documents/extract`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DETECTION_ENGINE_SECRET}`,
        },
        body: extractForm,
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!extractRes.ok) {
      const detail = await extractRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            detail.detail ??
            "No transactions could be extracted from this file. " +
              "Make sure it is an M-Pesa statement, bank statement, or CSV export with recognisable columns.",
        },
        { status: extractRes.status }
      );
    }

    const { transactions } = await extractRes.json();

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No transactions found in this file. " +
            "Make sure it is an M-Pesa statement, bank statement, or CSV export with recognisable columns.",
        },
        { status: 422 }
      );
    }

    // Step 2: Run analysis via FastAPI
    const analyzeRes = await fetch(`${DETECTION_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DETECTION_ENGINE_SECRET}`,
      },
      body: JSON.stringify({ businessId: "sandbox", transactions }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!analyzeRes.ok) {
      const detail = await analyzeRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: detail.detail ?? "Analysis failed." },
        { status: 500 }
      );
    }

    const { report } = await analyzeRes.json();
    return NextResponse.json({ success: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[standalone-document] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}