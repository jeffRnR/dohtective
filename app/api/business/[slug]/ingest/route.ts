import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { requireBusinessMember, UnauthorizedError } from '../../../../lib/authz';

const execAsync = promisify(exec);

function normalizeForEngine(tx: any, index: number): Record<string, any> {
  const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount ?? '0') || 0;
  return {
    transaction_id: tx.id ?? `manual-${index}`,
    date: tx.date ?? new Date().toISOString().slice(0, 10),
    branch: tx.branch ?? 'Main',
    type: amount >= 0 ? 'Income' : 'Expense',
    account_name: tx.account_name ?? 'Manual Upload',
    category_name: tx.category ?? tx.category_name ?? 'Uncategorized',
    contact_name: tx.vendor ?? tx.contact_name ?? 'Unknown',
    reference_number: tx.id ?? `manual-${index}`,
    payment_method: tx.payment_method ?? 'Manual',
    description: tx.description ?? '',
    amount: Math.abs(amount),
    status: 'Manual',
    bank_account: tx.bank_account ?? 'Manual Upload',
    is_reconciled: false,
    notes: tx.notes ?? '',
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    await requireBusinessMember(slug);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json();
  const rawTransactions: any[] = body.transactions ?? [];

  if (rawTransactions.length === 0) {
    return Response.json({ error: 'No transactions provided.' }, { status: 400 });
  }

  const engineTransactions = rawTransactions.map(normalizeForEngine);

  const backendDir = path.join(process.cwd(), 'backend');
  const tempFile = `temp_data_${slug}.json`;
  const filePath = path.join(backendDir, tempFile);

  try {
    const payload = { businessId: slug, transactions: engineTransactions };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

    const { stdout, stderr } = await execAsync(
      `python engine.py ${tempFile}`,
      { cwd: backendDir }
    );

    if (!stdout || !stdout.trim()) {
      throw new Error(
        stderr
          ? `Engine produced no output. Stderr: ${stderr}`
          : 'Engine produced no output and no error message.'
      );
    }

    const report = JSON.parse(stdout.trim());

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return Response.json({ success: true, report });
  } catch (err) {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Ingest] Error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}