import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { requireBusinessMember, UnauthorizedError } from "../../lib/authz";

const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

export async function GET(req: Request) {
  const orgParam = new URL(req.url).searchParams.get("org");
  if (!orgParam) {
    return NextResponse.json(
      { error: "Missing org parameter." },
      { status: 400 },
    );
  }

  let business;
  try {
    ({ business } = await requireBusinessMember(orgParam));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const [transactions, invoices, bankStatements, flagResponses] =
    await Promise.all([
      prisma.transaction.findMany({ where: { businessId: business.id } }),
      prisma.invoice.findMany({ where: { businessId: business.id } }),
      prisma.bankStatement.findMany({ where: { businessId: business.id } }),
      // Load all existing founder responses for this business so the
      // dashboard can render the correct response state per flag without
      // an extra round-trip.
      prisma.flagResponse.findMany({
        where: { businessId: business.id },
        select: { flagTitle: true, response: true, respondedAt: true },
      }),
    ]);

  const shapedTransactions = transactions.map((t) => ({
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

  const shapedInvoices = invoices.map((i) => ({
    invoice_id: i.invoiceId,
    customer_name: i.customerName,
    total: i.total,
    balance: i.balance,
    status: i.status,
    date: i.date.toISOString().slice(0, 10),
    due_date: i.dueDate.toISOString().slice(0, 10),
    reference_number: i.referenceNumber,
    branch: i.branch,
  }));

  const shapedBankStatements = bankStatements.map((b) => ({
    statement_id: b.statementId,
    date_from: b.dateFrom.toISOString().slice(0, 10),
    date_to: b.dateTo.toISOString().slice(0, 10),
    opening_balance: b.openingBalance,
    closing_balance: b.closingBalance,
    reconciled: b.reconciled,
    notes: b.notes,
  }));

  let analyzeResponse: Response;
  try {
    analyzeResponse = await fetch(`${DETECTION_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: shapedTransactions,
        invoices: shapedInvoices,
        bank_statements: shapedBankStatements,
        supporting_documents: [],
        business_billers: [],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Detection service unreachable. Is the Python FastAPI service running? " +
          `Tried: ${DETECTION_SERVICE_URL}/analyze`,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (!analyzeResponse.ok) {
    const detail = await analyzeResponse.text();
    return NextResponse.json(
      { error: "Detection engine returned an error.", detail },
      { status: analyzeResponse.status },
    );
  }

  const { report } = (await analyzeResponse.json()) as {
    report: Record<string, unknown>;
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const existingThisMonth = await prisma.reportSnapshot.findFirst({
    where: { businessId: business.id, generatedAt: { gte: monthStart } },
    orderBy: { generatedAt: "desc" },
  });

  const snapshotData = {
    cashBufferDays: (report.cash_buffer_days as number) ?? 0,
    cashBufferRiskLevel: (report.cash_buffer_risk_level as string) ?? "unknown",
    totalCashInflows: (report.total_cash_inflows as number) ?? 0,
    totalCashOutflows: (report.total_cash_outflows as number) ?? 0,
    mixedFundsCount: (report.mixed_funds_count as number) ?? 0,
    mixedFundsTotal: (report.mixed_funds_total as number) ?? 0,
    flagsJson: (report.flags as object) ?? [],
    plainLanguageJson: (report.plain_language as object) ?? [],
  };

  if (existingThisMonth) {
    await prisma.reportSnapshot.update({
      where: { id: existingThisMonth.id },
      data: snapshotData,
    });
  } else if (
    report.cash_buffer_days !== undefined &&
    report.cash_buffer_days !== null
  ) {
    await prisma.reportSnapshot.create({
      data: { businessId: business.id, ...snapshotData },
    });
  }

  const priorSnapshot = await prisma.reportSnapshot.findFirst({
    where: { businessId: business.id, generatedAt: { lt: monthStart } },
    orderBy: { generatedAt: "desc" },
  });

  const trend = priorSnapshot
    ? {
        available: true,
        priorMonth: priorSnapshot.generatedAt.toISOString().slice(0, 7),
        cashBufferDaysDelta:
          (report.cash_buffer_days as number) - priorSnapshot.cashBufferDays,
        priorCashBufferDays: priorSnapshot.cashBufferDays,
        mixedFundsCountDelta:
          (report.mixed_funds_count as number) - priorSnapshot.mixedFundsCount,
        priorMixedFundsCount: priorSnapshot.mixedFundsCount,
      }
    : {
        available: false,
        reason:
          "Not enough history yet — trends appear after your second month.",
      };

  // Shape flag responses as a lookup map keyed by flagTitle so the
  // frontend can do O(1) lookups per flag without iterating the array.
  const flagResponseMap: {
    [key: string]: { response: string; respondedAt: string };
  } = {};
  for (const fr of flagResponses) {
    flagResponseMap[fr.flagTitle] = {
      response: fr.response,
      respondedAt: fr.respondedAt.toISOString(),
    };
  }

  return NextResponse.json({
    meta: {
      company_name: business.companyName,
      period_start:
        shapedTransactions[0]?.date ?? now.toISOString().slice(0, 10),
      period_end: now.toISOString().slice(0, 10),
      branches: Array.from(new Set(shapedTransactions.map((t) => t.branch))),
      currency: business.currency,
    },
    transactions: shapedTransactions,
    report,
    trend,
    hasTransactions: transactions.length > 0,
    // Keyed by flagTitle — O(1) lookup in FlagFeed per flag card
    flagResponses: flagResponseMap,
  });
}
