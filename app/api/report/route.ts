// app/api/report/route.ts
// CHANGELOG: previously read mock-data/*.json with ZERO access control -
// any caller who knew or guessed an org slug could pull that business's
// full financial report. Now requires a verified BusinessMember row via
// requireBusinessMember(), and reads transactions from Postgres (the real
// multitenant data store) instead of flat files.

import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { requireBusinessMember, UnauthorizedError } from "../../lib/authz";

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

export async function GET(req: Request) {
  const orgParam = new URL(req.url).searchParams.get("org");
  if (!orgParam) {
    return NextResponse.json({ error: "Missing org parameter." }, { status: 400 });
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

  const [transactions, invoices, bankStatements] = await Promise.all([
    prisma.transaction.findMany({ where: { businessId: business.id } }),
    prisma.invoice.findMany({ where: { businessId: business.id } }),
    prisma.bankStatement.findMany({ where: { businessId: business.id } }),
  ]);

  // Reshape DB rows back into the snake_case shape engine.py expects -
  // the detection engine's contract was built against the original
  // Zoho-style JSON field names and there's no reason to change that
  // contract just because the storage layer changed underneath it.
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
        error: "Detection service unreachable. Is the Python FastAPI service running? " +
          `Tried: ${DETECTION_SERVICE_URL}/analyze`,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  if (!analyzeResponse.ok) {
    const detail = await analyzeResponse.text();
    return NextResponse.json({ error: "Detection engine returned an error.", detail }, { status: analyzeResponse.status });
  }

  const { report } = (await analyzeResponse.json()) as { report: Record<string, unknown> };

  return NextResponse.json({
    meta: {
      company_name: business.companyName,
      period_start: shapedTransactions[0]?.date ?? new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
      branches: Array.from(new Set(shapedTransactions.map((t) => t.branch))),
      currency: business.currency,
    },
    transactions: shapedTransactions,
    report,
  });
}
