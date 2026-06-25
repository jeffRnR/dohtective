import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  requireBusinessMember,
  UnauthorizedError,
} from "../../../../lib/authz";
import { normalizeForEngine } from "../../../../lib/normalize-transaction";

const DETECTION_SERVICE_URL =
  process.env.DETECTION_SERVICE_URL ?? "http://localhost:8123";

function detectFileKind(filename: string, mimetype: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("mpesa") || lower.includes("m-pesa")) return "mpesa";
  if (lower.includes("bank") || lower.includes("statement"))
    return "bank_statement";
  if (mimetype === "application/pdf") return "bank_statement";
  return "csv";
}

type IssueLevel = "info" | "warning" | "excluded";

type DataQualityIssue = {
  level: IssueLevel;
  message: string;
};

type DataQualityReport = {
  totalExtracted: number;
  usableRows: number;
  coveragePct: number;
  issues: DataQualityIssue[];
  acceptable: boolean;
};

function runDataQualityGate(rawTransactions: any[]): DataQualityReport {
  const total = rawTransactions.length;
  const issues: DataQualityIssue[] = [];

  const noAmount = rawTransactions.filter((tx) => {
    const raw =
      tx.amount ?? tx["Paid In"] ?? tx["Withdrawn"] ?? tx.Amount ?? null;
    if (raw === null || raw === undefined || raw === "") return true;
    const parsed = parseFloat(String(raw).replace(/,/g, ""));
    return isNaN(parsed) || parsed === 0;
  });

  if (noAmount.length > 0) {
    issues.push({
      level: "excluded",
      message: `${noAmount.length} transaction${noAmount.length === 1 ? "" : "s"} had no amount and will be excluded from analysis.`,
    });
  }

  const DATE_FORMATS = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{1,2}\s+\w+\s+\d{4}$/,
  ];
  const badDate = rawTransactions.filter((tx) => {
    const raw =
      tx.date ??
      tx.Date ??
      tx["Transaction Date"] ??
      tx["Completion Time"] ??
      "";
    if (!raw) return true;
    const d = new Date(raw);
    return (
      isNaN(d.getTime()) &&
      !DATE_FORMATS.some((r) => r.test(String(raw).trim()))
    );
  });

  if (badDate.length > 0) {
    issues.push({
      level: "warning",
      message: `${badDate.length} transaction${badDate.length === 1 ? "" : "s"} had unreadable dates — today's date was used as a fallback. Consider fixing the source file for more accurate analysis.`,
    });
  }

  const noDesc = rawTransactions.filter((tx) => {
    const desc =
      tx.description ??
      tx.Description ??
      tx.Narration ??
      tx.Details ??
      tx.Particulars ??
      tx.Remarks ??
      "";
    return !String(desc).trim();
  });

  if (noDesc.length > 0) {
    issues.push({
      level: "info",
      message: `${noDesc.length} transaction${noDesc.length === 1 ? "" : "s"} had no description — mixed-funds detection may be less accurate for these rows.`,
    });
  }

  const refs = rawTransactions
    .map(
      (tx) =>
        tx.id ??
        tx["Receipt No."] ??
        tx["Receipt No"] ??
        tx["Reference No"] ??
        null,
    )
    .filter(Boolean);
  const uniqueRefs = new Set(refs);
  const dupCount = refs.length - uniqueRefs.size;

  if (dupCount > 0) {
    issues.push({
      level: "warning",
      message: `${dupCount} duplicate reference number${dupCount === 1 ? "" : "s"} found within this file — these rows will be deduplicated and only the latest version kept.`,
    });
  }

  const usableRows = total - noAmount.length;
  const coveragePct = total > 0 ? Math.round((usableRows / total) * 100) : 0;
  const acceptable = coveragePct >= 70;

  return {
    totalExtracted: total,
    usableRows,
    coveragePct,
    issues,
    acceptable,
  };
}

// ── GET — list all uploaded files ─────────────────────────────────────────
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    await requireBusinessMember(slug);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  const files = await prisma.uploadedFile.findMany({
    where: { businessId: business.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      filename: true,
      fileKind: true,
      rowCount: true,
      dateFrom: true,
      dateTo: true,
      uploadedAt: true,
    },
  });

  return NextResponse.json({ files });
}

// ── POST — upload, extract, quality gate, persist ─────────────────────────
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing or invalid file." },
      { status: 400 },
    );
  }

  const originalName = (file as File).name ?? "upload";
  const mimeType = file.type ?? "";
  const fileKind = detectFileKind(originalName, mimeType);

  let rawTransactions: any[] = [];

  const extractForm = new FormData();
  extractForm.append(
    "file",
    new Blob([await file.arrayBuffer()], { type: mimeType }),
    originalName,
  );
  extractForm.append("document_kind", fileKind);
  extractForm.append("slug", slug);

  const extractRes = await fetch(
    `${DETECTION_SERVICE_URL}/documents/extract`,
    {
      method: "POST",
      body: extractForm,
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!extractRes.ok) {
    const detail = await extractRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: detail.detail ?? "Extraction failed." },
      { status: extractRes.status },
    );
  }

  const extractData = await extractRes.json();
  rawTransactions = extractData.transactions ?? [];

  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    return NextResponse.json(
      {
        error:
          "No transactions could be extracted from this file. " +
          "Make sure it has recognisable column headers and at least one data row.",
      },
      { status: 422 },
    );
  }

  const dataQuality = runDataQualityGate(rawTransactions);
  const engineTransactions = rawTransactions.map(normalizeForEngine);

  const dates = engineTransactions.map((tx) => tx.date).sort();
  const dateFrom = dates[0] ?? null;
  const dateTo = dates[dates.length - 1] ?? null;

  const uploadedFile = await prisma.uploadedFile.create({
    data: {
      businessId: business.id,
      filename: originalName,
      fileKind,
      rowCount: engineTransactions.length,
      dateFrom,
      dateTo,
    },
  });

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
          sourceFileId: uploadedFile.id,
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
          sourceFileId: uploadedFile.id,
        },
      }),
    ),
  );

  return NextResponse.json({
    success: true,
    file: {
      id: uploadedFile.id,
      filename: uploadedFile.filename,
      fileKind: uploadedFile.fileKind,
      rowCount: uploadedFile.rowCount,
      dateFrom: uploadedFile.dateFrom,
      dateTo: uploadedFile.dateTo,
      uploadedAt: uploadedFile.uploadedAt,
    },
    dataQuality,
  });
}