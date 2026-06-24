import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireBusinessMember, UnauthorizedError } from '../../../../lib/authz';

const execAsync = promisify(exec);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
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

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: 'No transactions found. Upload at least one file before running analysis.' },
      { status: 400 }
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

  const backendDir = path.join(process.cwd(), 'backend');
  const tempFile = `temp_data_${slug}.json`;
  const filePath = path.join(backendDir, tempFile);

  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ businessId: slug, transactions: engineTransactions }, null, 2),
      'utf8'
    );

    const { stdout, stderr } = await execAsync(
      `python engine.py ${tempFile}`,
      { cwd: backendDir }
    );

    if (!stdout || !stdout.trim()) {
      throw new Error(stderr || 'Engine produced no output.');
    }

    const report = JSON.parse(stdout.trim());

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await prisma.reportSnapshot.findFirst({
      where: { businessId: business.id, generatedAt: { gte: monthStart } },
      orderBy: { generatedAt: 'desc' },
    });

    const snapshotData = {
      cashBufferDays: report.cash_buffer_days as number,
      cashBufferRiskLevel: report.cash_buffer_risk_level as string,
      totalCashInflows: report.total_cash_inflows as number,
      totalCashOutflows: report.total_cash_outflows as number,
      mixedFundsCount: report.mixed_funds_count as number,
      mixedFundsTotal: report.mixed_funds_total as number,
      flagsJson: report.flags as object,
      plainLanguageJson: report.plain_language as object,
    };

    if (existing) {
      await prisma.reportSnapshot.update({ where: { id: existing.id }, data: snapshotData });
    } else {
      await prisma.reportSnapshot.create({ data: { businessId: business.id, ...snapshotData } });
    }

    return NextResponse.json({ success: true, report });
  } catch (err) {
    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}