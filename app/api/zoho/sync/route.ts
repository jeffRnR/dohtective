// app/api/zoho/sync/route.ts
import { NextResponse } from "next/server";
import { requireBusinessMember, UnauthorizedError } from "../../../lib/authz";
import { syncZohoTransactions } from "../../../lib/zoho-sync";
import { prisma } from "../../../lib/prisma";

const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

// POST /api/zoho/sync
// Body: { slug: string }
//
// 1. Syncs Zoho transactions into the Transaction table.
// 2. Runs analysis and writes ReportSnapshot ONLY if new transactions
//    were upserted. If nothing changed, skips analysis entirely — this
//    prevents hammering the detection service on every dashboard load.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = body.slug as string | undefined;

  if (!slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const connection = await prisma.zohoConnection.findUnique({
    where: { businessId: business.id },
    select: { organizationId: true },
  });

  if (!connection?.organizationId) {
    return NextResponse.json(
      {
        error: "No Zoho connection found or organization not selected.",
        pendingOrgSelection: !!connection && !connection.organizationId,
      },
      { status: 422 }
    );
  }

  // ── Step 1: Sync Zoho transactions ───────────────────────────────────
  let syncResult: { upserted: number; errors: string[] };
  try {
    syncResult = await syncZohoTransactions(slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    if (message.includes("refresh") || message.includes("token")) {
      return NextResponse.json(
        { error: "Zoho token expired. Please reconnect your Zoho account.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // ── Step 2: Run analysis only if data changed ─────────────────────────
  // upserted > 0 means Zoho returned transactions that differed from what
  // was already in the DB (new rows or updated amounts/types). If nothing
  // changed, skip analysis — the existing snapshot is still accurate.
  if (syncResult.upserted === 0) {
    return NextResponse.json({
      ok: true,
      upserted: 0,
      analysisRun: false,
      reason: "No new or changed transactions — snapshot unchanged.",
    });
  }

  // ── Step 3: Run analysis and update snapshot ──────────────────────────
  try {
    const transactions = await prisma.transaction.findMany({
      where: { businessId: business.id },
    });

    if (transactions.length === 0) {
      return NextResponse.json({ ok: true, upserted: syncResult.upserted, analysisRun: false });
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

    const analyzeRes = await fetch(`${DETECTION_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      console.error("[zoho-sync] Analysis HTTP error:", analyzeRes.status);
      return NextResponse.json({
        ok: true,
        upserted: syncResult.upserted,
        analysisRun: false,
        reason: "Analysis service returned an error — snapshot not updated.",
      });
    }

    const { report } = await analyzeRes.json();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const snapshotData = {
      cashBufferDays:      (report.cash_buffer_days as number)      ?? 0,
      cashBufferRiskLevel: (report.cash_buffer_risk_level as string) ?? "unknown",
      totalCashInflows:    (report.total_cash_inflows as number)    ?? 0,
      totalCashOutflows:   (report.total_cash_outflows as number)   ?? 0,
      mixedFundsCount:     (report.mixed_funds_count as number)     ?? 0,
      mixedFundsTotal:     (report.mixed_funds_total as number)     ?? 0,
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

    return NextResponse.json({
      ok: true,
      upserted: syncResult.upserted,
      analysisRun: true,
    });
  } catch (err) {
    console.error("[zoho-sync] Post-sync analysis error:", err);
    return NextResponse.json({
      ok: true,
      upserted: syncResult.upserted,
      analysisRun: false,
      reason: "Analysis failed — transactions synced but snapshot not updated.",
    });
  }
}