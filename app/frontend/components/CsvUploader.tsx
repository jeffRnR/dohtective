"use client";

import { useState } from "react";
import Papa from "papaparse";
import type { NormalizedTransaction } from "../lib/types";

// M-Pesa exports use "Paid In" for credits and "Withdrawn" for debits
// instead of a single signed "Amount" column. Detect and handle both.
function parseAmount(row: any): number {
  if (row["Paid In"] !== undefined || row["Withdrawn"] !== undefined) {
    const paidIn = parseFloat(String(row["Paid In"] ?? "0").replace(/,/g, "")) || 0;
    const withdrawn = parseFloat(String(row["Withdrawn"] ?? "0").replace(/,/g, "")) || 0;
    // Withdrawals are outflows — represent as negative so normalizeForEngine
    // can infer type from sign
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
  // Try to parse; fall back to raw string if it's already YYYY-MM-DD
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
  return row.Vendor ?? row.vendor ?? row.Payee ?? row.payee ?? row["Contact Name"] ?? "Unknown";
}

export default function CsvUploader({
  onDataParsed,
}: {
  onDataParsed: (data: NormalizedTransaction[]) => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ filename: string; rowCount: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setParseError(null);
    setParsed(null);

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
            err instanceof Error ? err.message : "Failed to parse file."
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

    // Reset input so the same file can be re-uploaded if needed
    e.target.value = "";
  };

  return (
    <div
      className="rounded-[var(--radius-lg)] border-2 border-dashed p-5 text-center bg-white"
      style={{ borderColor: "var(--line)" }}
    >
      {parsing ? (
        <p className="text-sm" style={{ color: "var(--sage)" }}>
          Parsing file...
        </p>
      ) : parsed ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {parsed.rowCount} rows loaded from{" "}
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
              accept=".csv"
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
              accept=".csv"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
          <p className="mt-2 text-xs" style={{ color: "var(--sage)" }}>
            M-Pesa statement, bank CSV, or any transaction export
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