"use client";

import { useState } from "react";
import Papa from "papaparse";
import type { NormalizedTransaction } from "../lib/types";

function parseAmount(row: any): number {
  if (row["Paid In"] !== undefined || row["Withdrawn"] !== undefined) {
    const paidIn = parseFloat(String(row["Paid In"] ?? "0").replace(/,/g, "")) || 0;
    const withdrawn = parseFloat(String(row["Withdrawn"] ?? "0").replace(/,/g, "")) || 0;
    return paidIn > 0 ? paidIn : -withdrawn;
  }
  const raw = row.Amount ?? row.amount ?? row.Total ?? row.total ?? "0";
  return parseFloat(String(raw).replace(/,/g, "")) || 0;
}

function parseDate(row: any): string {
  const raw =
    row.Date ??
    row.date ??
    row.Transaction_Date ??
    row["Transaction Date"] ??
    row.ValueDate ??
    row["Value Date"] ??
    "";
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? String(raw) : d.toISOString().slice(0, 10);
}

function parseDescription(row: any): string {
  return (
    row.Narration ??
    row.Description ??
    row.Details ??
    row.Particulars ??
    row.Remarks ??
    row.description ??
    ""
  );
}

function parseVendor(row: any): string {
  return (
    row.Vendor ?? row.vendor ?? row.Payee ?? row.payee ?? row["Contact Name"] ?? "Unknown"
  );
}

export default function CsvUploader({
  onDataParsed,
  slug,
}: {
  onDataParsed: (data: NormalizedTransaction[]) => void;
  // slug is needed for the PDF extraction API route.
  // Optional so existing usages without slug don't break — PDF upload
  // will show an error if slug is missing.
  slug?: string;
}) {
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ filename: string; rowCount: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handlePdf(file: File) {
    if (!slug) {
      setParseError('Cannot extract PDF without a business context.');
      setParsing(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/business/${slug}/extract-pdf`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? 'PDF extraction failed.');
      }

      const transactions: NormalizedTransaction[] = result.transactions;
      setParsed({ filename: file.name, rowCount: transactions.length });
      onDataParsed(transactions);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'PDF extraction failed.');
    } finally {
      setParsing(false);
    }
  }

  function handleCsv(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const normalized: NormalizedTransaction[] = (results.data as any[]).map(
            (row, index) => ({
              id: `csv-${index}`,
              date: parseDate(row),
              amount: parseAmount(row),
              description: parseDescription(row),
              vendor: parseVendor(row),
              category: row.Category ?? row.category ?? "Uncategorized",
              source: "MPESA" as const,
              raw: row,
            })
          );
          setParsed({ filename: file.name, rowCount: normalized.length });
          onDataParsed(normalized);
        } catch (err) {
          setParseError(
            err instanceof Error ? err.message : "Failed to parse CSV."
          );
        } finally {
          setParsing(false);
        }
      },
      error: (err) => {
        setParseError(err.message);
        setParsing(false);
      },
    });
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setParseError(null);
    setParsed(null);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      handlePdf(file);
    } else {
      handleCsv(file);
    }

    e.target.value = "";
  };

  return (
    <div
      className="rounded-[var(--radius-lg)] border-2 border-dashed p-5 text-center bg-white"
      style={{ borderColor: "var(--line)" }}
    >
      {parsing ? (
        <p className="text-sm" style={{ color: "var(--sage)" }}>
          {/* Message differs so the user knows PDF takes longer */}
          Extracting transactions... this may take a moment for PDFs.
        </p>
      ) : parsed ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {parsed.rowCount} transactions loaded from{" "}
            <span className="font-mono text-xs">{parsed.filename}</span>
          </p>
          <p className="text-xs" style={{ color: "var(--sage)" }}>
            Analysis running — results will appear above shortly.
          </p>
          <label
            className="mt-2 inline-block text-xs font-semibold underline underline-offset-2 cursor-pointer"
            style={{ color: "var(--sage)" }}
          >
            Upload a different file
            <input
              type="file"
              accept=".csv,.pdf"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>
      ) : (
        <>
          <label className="block cursor-pointer">
            <span
              className="inline-block font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-4 py-2.5 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{ background: "var(--savanna)" }}
            >
              Choose file
            </span>
            <input
              type="file"
              accept=".csv,.pdf"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
          <p className="mt-2 text-xs" style={{ color: "var(--sage)" }}>
            M-Pesa statement, bank statement, or CSV — PDF and CSV supported
          </p>
        </>
      )}

      {parseError && (
        <p className="mt-3 text-xs font-medium" style={{ color: "var(--clay)" }}>
          {parseError}
        </p>
      )}
    </div>
  );
}