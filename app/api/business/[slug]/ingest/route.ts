// /app/api/business/[slug]/ingest/route.ts
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  requireBusinessMember,
  UnauthorizedError,
} from "../../../../lib/authz";
import { prisma } from "../../../../lib/prisma";
import { consumeOneCredit, InsufficientCreditsError } from "../../../../lib/credits";

const execAsync = promisify(exec);

// Inflow type strings from manual CSV exports
const INFLOW_TYPES = new Set([
  "income",
  "revenue",
  "sales",
  "receipt",
  "inflow",
  "credit",
  "initial",
]);

// Outflow type strings from manual CSV exports
const OUTFLOW_TYPES = new Set([
  "expense",
  "supplier",
  "operating",
  "owner",
  "pettycash",
  "petty cash",
  "logistics",
  "services",
  "misc",
  "utility",
  "utilities",
  "bill",
  "cost",
  "payment",
  "stock",
  "rent",
  "salary",
  "salaries",
  "payroll",
  "tax",
  "transfer",
  "withdrawal",
  "draw",
]);

function classifyType(rawType: string, amount: number): string {
  const normalised = rawType.trim().toLowerCase().replace(/-/g, " ");
  if (INFLOW_TYPES.has(normalised)) return "Income";
  if (OUTFLOW_TYPES.has(normalised)) return "Expense";
  return amount >= 0 ? "Income" : "Expense";
}

function parseDate(raw: unknown): string {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return new Date().toISOString().slice(0, 10);
  }

  const cleaned = raw.trim();

  // DD/MM/YYYY or DD-MM-YYYY (most common in KE/African PDF exports)
  const dmy = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return iso;
  }

  // MM/DD/YYYY (US format)
  const mdy = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return iso;
  }

  // YYYY/MM/DD or already ISO YYYY-MM-DD
  const ymd = cleaned.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return iso;
  }

  // Last resort: let Date parse it (handles "15 Mar 2024", "March 15 2024", etc.)
  const fallback = new Date(cleaned);
  if (!isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }

  console.warn(
    `[ingest] Could not parse date "${raw}" — using today as fallback.`,
  );
  return new Date().toISOString().slice(0, 10);
}

function normalizeForEngine(tx: any, index: number): Record<string, any> {
  const amount =
    typeof tx.amount === "number"
      ? tx.amount
      : parseFloat(tx.amount ?? "0") || 0;
  const rawType = tx.type ?? tx.source ?? "";
  return {
    transaction_id: tx.id ?? `manual-${index}`,
    date: parseDate(tx.date),
    branch: tx.branch ?? "Main",
    type: classifyType(rawType, amount),
    account_name: tx.account_name ?? "Manual Upload",
    category_name: tx.category ?? tx.category_name ?? "Uncategorized",
    contact_name: tx.vendor ?? tx.contact_name ?? "Unknown",
    reference_number: tx.id ?? `manual-${index}`,
    payment_method: tx.payment_method ?? "Manual",
    description: tx.description ?? "",
    amount: Math.abs(amount),
    status: "Manual",
    bank_account: tx.bank_account ?? "Manual Upload",
    is_reconciled: false,
    notes: tx.notes ?? "",
  };
}

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
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json();
  const rawTransactions: any[] = body.transactions ?? [];

  if (rawTransactions.length === 0) {
    return Response.json(
      { error: "No transactions provided." },
      { status: 400 },
    );
  }

  // ── Credit gate ────────────────────────────────────────────────────
  // Atomically check and decrement before spending any compute.
  // If credits = 0, returns 402 pointing founder to /pricing.
  let creditsRemaining: number;
  try {
    const result = await consumeOneCredit(business.id);
    creditsRemaining = result.creditsRemaining;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return Response.json(
        {
          error: "No analysis credits remaining.",
          detail:
            "Purchase more credits at /pricing to continue running analyses.",
          creditsRemaining: 0,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  const engineTransactions = rawTransactions.map(normalizeForEngine);

  const backendDir = path.join(process.cwd(), "backend");
  const tempFile = `temp_data_${slug}.json`;
  const filePath = path.join(backendDir, tempFile);

  try {
    const payload = { businessId: slug, transactions: engineTransactions };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

    const { stdout, stderr } = await execAsync(`python engine.py ${tempFile}`, {
      cwd: backendDir,
    });

    if (!stdout || !stdout.trim()) {
      throw new Error(
        stderr
          ? `Engine produced no output. Stderr: ${stderr}`
          : "Engine produced no output and no error message.",
      );
    }

    const report = JSON.parse(stdout.trim());

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // ── Persist transactions ───────────────────────────────────────────
    await Promise.all(
      engineTransactions.map((tx) =>
        prisma.transaction.upsert({
          where: {
            businessId_transactionId: {
              businessId: business.id,
              transactionId: tx.transaction_id,
            },
          },
          create: {
            businessId: business.id,
            transactionId: tx.transaction_id,
            date: new Date(tx.date),
            branch: tx.branch,
            type: tx.type,
            accountName: tx.account_name,
            categoryName: tx.category_name,
            contactName: tx.contact_name,
            referenceNumber: tx.reference_number,
            paymentMethod: tx.payment_method,
            description: tx.description,
            amount: tx.amount,
            status: tx.status,
            bankAccount: tx.bank_account,
            isReconciled: tx.is_reconciled,
            notes: tx.notes,
          },
          update: {
            date: new Date(tx.date),
            branch: tx.branch,
            type: tx.type,
            accountName: tx.account_name,
            categoryName: tx.category_name,
            contactName: tx.contact_name,
            referenceNumber: tx.reference_number,
            paymentMethod: tx.payment_method,
            description: tx.description,
            amount: tx.amount,
            status: tx.status,
            bankAccount: tx.bank_account,
            isReconciled: tx.is_reconciled,
            notes: tx.notes,
          },
        }),
      ),
    );

    // ── Persist report snapshot ────────────────────────────────────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const existingThisMonth = await prisma.reportSnapshot.findFirst({
      where: { businessId: business.id, generatedAt: { gte: monthStart } },
      orderBy: { generatedAt: "desc" },
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

    if (existingThisMonth) {
      await prisma.reportSnapshot.update({
        where: { id: existingThisMonth.id },
        data: snapshotData,
      });
    } else {
      await prisma.reportSnapshot.create({
        data: { businessId: business.id, ...snapshotData },
      });
    }

    return Response.json({ success: true, report, creditsRemaining });
  } catch (err) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    // Engine failed after credit was consumed — refund it so the
    // founder isn't charged for an analysis that didn't complete.
    await prisma.business.update({
      where: { id: business.id },
      data: {
        analysisCredits: { increment: 1 },
        lifetimeCreditsUsed: { decrement: 1 },
      },
    });

    const message = err instanceof Error ? err.message : String(err);
    console.error("[Ingest] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}