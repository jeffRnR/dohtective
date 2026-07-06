// app/api/report/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { requireBusinessMember, UnauthorizedError } from "../../lib/authz";

// GET /api/report?org=slug
//
// FAST PATH — serves the last saved ReportSnapshot from the DB.
// Analysis is NOT re-run on every load. It only runs when explicitly
// triggered via POST /api/business/[slug]/analyse (the Run Analysis button).
//
// This drops dashboard load time from ~10s to ~300ms.
//
// What changed from the old version:
//   - No fetch to DETECTION_SERVICE_URL on every GET
//   - Report data comes from ReportSnapshot.flagsJson + ReportSnapshot fields
//   - anomaly_transactions, plain_language, followup_workflow etc. are stored
//     in flagsJson (which actually stores the full report object — the field
//     name is a historical misnomer in the schema)
//   - Trend is computed from the two most recent snapshots as before
//   - flagResponses lookup map is unchanged
//   - hasTransactions is a DB count — no need to load all rows

export async function GET(req: Request) {
  const orgParam = new URL(req.url).searchParams.get("org");
  if (!orgParam) {
    return NextResponse.json({ error: "Missing org parameter." }, { status: 400 });
  }

  let business: {
    id: string;
    companyName: string;
    currency: string;
    slug: string;
  };
  try {
    ({ business } = await requireBusinessMember(orgParam));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // All DB reads in parallel — no external HTTP call
  const [snapshot, priorSnapshot, flagResponses, txCount, latestTxDate] =
    await Promise.all([
      // Most recent snapshot this month (written by /analyse)
      prisma.reportSnapshot.findFirst({
        where: { businessId: business.id, generatedAt: { gte: monthStart } },
        orderBy: { generatedAt: "desc" },
      }),
      // Most recent snapshot from a prior month (for trend)
      prisma.reportSnapshot.findFirst({
        where: { businessId: business.id, generatedAt: { lt: monthStart } },
        orderBy: { generatedAt: "desc" },
      }),
      // Flag responses for this business
      prisma.flagResponse.findMany({
        where: { businessId: business.id },
        select: { flagTitle: true, response: true, respondedAt: true },
      }),
      // Transaction count — O(1) index scan, no row loading
      prisma.transaction.count({ where: { businessId: business.id } }),
      // Earliest and latest transaction dates for period metadata
      prisma.transaction.findFirst({
        where: { businessId: business.id },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
    ]);

  // ── Flag response map ─────────────────────────────────────────────────
  const flagResponseMap: Record<string, { response: string; respondedAt: string }> = {};
  for (const fr of flagResponses) {
    flagResponseMap[fr.flagTitle] = {
      response: fr.response,
      respondedAt: fr.respondedAt.toISOString(),
    };
  }

  // ── No snapshot yet — return empty state ─────────────────────────────
  // The dashboard will show the empty state and prompt the user to run
  // analysis or upload files. This is correct — we have nothing to show.
  if (!snapshot) {
    return NextResponse.json({
      meta: {
        company_name: business.companyName,
        period_start: now.toISOString().slice(0, 10),
        period_end: now.toISOString().slice(0, 10),
        branches: [],
        currency: business.currency,
      },
      transactions: [],
      // Empty report shape — dashboard checks hasTransactions to decide
      // whether to show the empty state or the report.
      report: {
        cash_buffer_days: null,
        cash_buffer_risk_level: "unknown",
        total_cash_inflows: 0,
        total_cash_outflows: 0,
        flags: [],
        mixed_funds_count: 0,
        mixed_funds_total: 0,
        plain_language: [],
        followup_workflow: [],
        missing_information_checklist: [],
        anomaly_transactions: [],
        supporting_document_review: {
          expected_documents: 0,
          missing_documents: 0,
          invoice_documents_missing: 0,
          summary: "",
        },
        accounting_errors: {
          sequence_gaps_found: 0,
          gap_details: [],
          limitation_note: "",
        },
        skipped_malformed_transaction_count: 0,
        lastAnalysedAt: null,
      },
      trend: {
        available: false,
        reason: "Run your first analysis to see your financial health report.",
      },
      hasTransactions: txCount > 0,
      flagResponses: flagResponseMap,
    });
  }

  // ── Serve from snapshot ───────────────────────────────────────────────
  // flagsJson stores the full report object (historical naming — it was
  // originally just flags but expanded to hold the full report).
  const fullReport = snapshot.flagsJson as Record<string, unknown>;

  const trend = priorSnapshot
    ? {
        available: true,
        priorMonth: priorSnapshot.generatedAt.toISOString().slice(0, 7),
        cashBufferDaysDelta: snapshot.cashBufferDays - priorSnapshot.cashBufferDays,
        priorCashBufferDays: priorSnapshot.cashBufferDays,
        mixedFundsCountDelta: snapshot.mixedFundsCount - priorSnapshot.mixedFundsCount,
        priorMixedFundsCount: priorSnapshot.mixedFundsCount,
      }
    : {
        available: false,
        reason: "Not enough history yet — trends appear after your second month.",
      };

  return NextResponse.json({
    meta: {
      company_name: business.companyName,
      period_start: latestTxDate?.date.toISOString().slice(0, 10)
        ?? snapshot.generatedAt.toISOString().slice(0, 10),
      period_end: now.toISOString().slice(0, 10),
      branches: [],
      currency: business.currency,
    },
    transactions: [],  // dashboard doesn't need raw rows — report has everything
    report: {
      // Scalar fields from snapshot columns (fast indexed reads)
      cash_buffer_days: snapshot.cashBufferDays,
      cash_buffer_risk_level: snapshot.cashBufferRiskLevel,
      total_cash_inflows: snapshot.totalCashInflows,
      total_cash_outflows: snapshot.totalCashOutflows,
      mixed_funds_count: snapshot.mixedFundsCount,
      mixed_funds_total: snapshot.mixedFundsTotal,
      // Full report fields from flagsJson — the full report object is
      // stored here by /analyse and /api/business/[slug]/analyse
      flags:                        fullReport.flags ?? [],
      plain_language:               fullReport.plain_language ?? [],
      followup_workflow:            fullReport.followup_workflow ?? [],
      missing_information_checklist: fullReport.missing_information_checklist ?? [],
      anomaly_transactions:         fullReport.anomaly_transactions ?? [],
      supporting_document_review:   fullReport.supporting_document_review ?? {
        expected_documents: 0,
        missing_documents: 0,
        invoice_documents_missing: 0,
        summary: "",
      },
      accounting_errors: fullReport.accounting_errors ?? {
        sequence_gaps_found: 0,
        gap_details: [],
        limitation_note: "",
      },
      skipped_malformed_transaction_count:
        fullReport.skipped_malformed_transaction_count ?? 0,
      // Surface when this report was last generated so the UI can show
      // "Last analysed 2 hours ago" instead of always looking stale.
      lastAnalysedAt: snapshot.generatedAt.toISOString(),
    },
    trend,
    hasTransactions: txCount > 0,
    flagResponses: flagResponseMap,
  });
}