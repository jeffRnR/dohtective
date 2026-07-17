// app/api/business/[slug]/analyse/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  requireBusinessMember,
  UnauthorizedError,
} from "../../../../lib/authz";
import { analyseRateLimit } from "../../../../lib/rate-limit";

const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

// POST /api/business/[slug]/analyse
//
// The ONLY place that calls the detection service and runs analysis.
// Called by the "Run Analysis" button on the documents page.
// Stores the full report in ReportSnapshot.flagsJson so /api/report
// can serve it instantly on every subsequent dashboard load without
// re-running analysis.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const transactions = await prisma.transaction.findMany({
    where: { businessId: business.id },
  });

  // Rate limit — 10 analysis runs per hour per business
  const rlResult = analyseRateLimit(business.id);
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many analysis requests. Try again later.", retryAfterSeconds: rlResult.retryAfterSeconds },
      { status: 429 }
    );
  }

  if (transactions.length === 0) {
    return NextResponse.json(
      {
        error:
          "No transactions found. Upload at least one file before running analysis.",
      },
      { status: 400 },
    );
  }

  const engineTransactions = transactions.map((t) => ({
    transaction_id: t.transactionId,
    date: t.date.toISOString().slice(0, 10),
    branch: t.branch,
    type: t.type,
    account_name: t.accountName,
    category_name: t.categoryName,
    contact_name: t.contactName,
    reference_number: t.referenceNumber,
    payment_method: t.paymentMethod,
    description: t.description,
    amount: t.amount,
    status: t.status,
    bank_account: t.bankAccount,
    is_reconciled: t.isReconciled,
    notes: t.notes,
  }));

  let report: Record<string, unknown>;
  try {
    const analyzeRes = await fetch(`${DETECTION_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DETECTION_ENGINE_SECRET}`,
      },
      body: JSON.stringify({
        businessId: slug,
        transactions: engineTransactions,
        invoices: [],
        bank_statements: [],
        supporting_documents: [],
        business_billers: [],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!analyzeRes.ok) {
      const detail = await analyzeRes.json().catch(() => ({}));
      throw new Error(detail.detail ?? "Analysis failed.");
    }

    ({ report } = await analyzeRes.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyse] Detection service error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // ── Persist snapshot ───────────────────────────────────────────────
  // flagsJson stores the FULL report object — not just flags.
  // /api/report reads from here to serve the dashboard instantly.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const snapshotData = {
    cashBufferDays:      (report.cash_buffer_days as number)      ?? 0,
    cashBufferRiskLevel: (report.cash_buffer_risk_level as string) ?? "unknown",
    totalCashInflows:    (report.total_cash_inflows as number)    ?? 0,
    totalCashOutflows:   (report.total_cash_outflows as number)   ?? 0,
    mixedFundsCount:     (report.mixed_funds_count as number)     ?? 0,
    mixedFundsTotal:     (report.mixed_funds_total as number)     ?? 0,
    // Store the entire report so /api/report can serve it without re-analysis
    flagsJson:           report as object,
    plainLanguageJson:   (report.plain_language as object) ?? [],
  };

  const existing = await prisma.reportSnapshot.findFirst({
    where: { businessId: business.id, generatedAt: { gte: monthStart } },
    orderBy: { generatedAt: "desc" },
  });

  if (existing) {
    await prisma.reportSnapshot.update({
      where: { id: existing.id },
      data: { ...snapshotData, generatedAt: now },
    });
  } else {
    await prisma.reportSnapshot.create({
      data: { businessId: business.id, ...snapshotData },
    });
  }

  return NextResponse.json({ success: true, report });
}