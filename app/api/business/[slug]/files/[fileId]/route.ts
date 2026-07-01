import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import {
  requireBusinessMember,
  UnauthorizedError,
} from "../../../../../lib/authz";

const execAsync = promisify(exec);

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; fileId: string }> },
) {
  const { slug, fileId } = await params;

  let business: { id: string };
  try {
    ({ business } = await requireBusinessMember(slug));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Confirm the file belongs to this business
  const uploadedFile = await prisma.uploadedFile.findFirst({
    where: { id: fileId, businessId: business.id },
  });

  if (!uploadedFile) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  // Delete Transaction rows that came from this file
  await prisma.transaction.deleteMany({
    where: { sourceFileId: fileId },
  });

  // Delete the UploadedFile metadata row
  await prisma.uploadedFile.delete({ where: { id: fileId } });

  // Re-run analysis on remaining transactions
  const remainingTransactions = await prisma.transaction.findMany({
    where: { businessId: business.id },
  });

  if (remainingTransactions.length === 0) {
    // No data left — clear the snapshot so dashboard returns to empty state
    await prisma.reportSnapshot.deleteMany({
      where: { businessId: business.id },
    });
    return NextResponse.json({
      success: true,
      report: null,
      message:
        "File deleted. No remaining data — dashboard reset to empty state.",
    });
  }

  // Shape remaining transactions for engine
  const engineTransactions = remainingTransactions.map((t) => ({
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

  const backendDir = path.join(process.cwd(), "backend");
  const tempFile = `temp_data_${slug}.json`;
  const filePath = path.join(backendDir, tempFile);

  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        { businessId: slug, transactions: engineTransactions },
        null,
        2,
      ),
      "utf8",
    );

    const { stdout, stderr } = await execAsync(`python engine.py ${tempFile}`, {
      cwd: backendDir,
    });

    if (!stdout || !stdout.trim()) {
      throw new Error(
        stderr || "Engine produced no output after file deletion.",
      );
    }

    const report = JSON.parse(stdout.trim());

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Update snapshot
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await prisma.reportSnapshot.findFirst({
      where: { businessId: business.id, generatedAt: { gte: monthStart } },
      orderBy: { generatedAt: "desc" },
    });

    const snapshotData = {
      cashBufferDays: (report.cash_buffer_days as number) ?? 0,
      cashBufferRiskLevel:
        (report.cash_buffer_risk_level as string) ?? "unknown",
      totalCashInflows: (report.total_cash_inflows as number) ?? 0,
      totalCashOutflows: (report.total_cash_outflows as number) ?? 0,
      mixedFundsCount: (report.mixed_funds_count as number) ?? 0,
      mixedFundsTotal: (report.mixed_funds_total as number) ?? 0,
      flagsJson: (report.flags as object) ?? [],
      plainLanguageJson: (report.plain_language as object) ?? [],
    };

    if (existing) {
      await prisma.reportSnapshot.update({
        where: { id: existing.id },
        data: snapshotData,
      });
    } else {
      await prisma.reportSnapshot.create({
        data: { businessId: business.id, ...snapshotData },
      });
    }

    return NextResponse.json({
      success: true,
      report,
      message: `File deleted. Dashboard updated — analysis re-ran on your remaining ${remainingTransactions.length} transactions.`,
    });
  } catch (err) {
    if (fs.existsSync(filePath))
      try {
        fs.unlinkSync(filePath);
      } catch {}
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
