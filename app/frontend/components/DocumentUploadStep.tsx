"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DataQuality } from "../lib/types";

type FileKind = "mpesa" | "bank_statement" | "csv";

type UploadedFileRecord = {
  id: string;
  filename: string;
  fileKind: FileKind;
  rowCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  uploadedAt: string;
  dataQuality?: DataQuality;
};

type UploadingEntry = {
  tempId: string;
  filename: string;
  status: "uploading" | "error";
  error?: string;
};

const FILE_KIND_LABELS: Record<FileKind, string> = {
  mpesa: "M-Pesa Statement",
  bank_statement: "Bank Statement",
  csv: "CSV Export",
};

const FILE_KIND_COLORS: Record<FileKind, string> = {
  mpesa: "var(--savanna)",
  bank_statement: "var(--ink)",
  csv: "var(--sage)",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DataQualityBadge({ dq }: { dq: DataQuality }) {
  const color = dq.acceptable
    ? dq.issues.some((i) => i.level === "warning")
      ? "var(--marigold)"
      : "var(--savanna)"
    : "var(--clay)";

  const bgVar = dq.acceptable
    ? dq.issues.some((i) => i.level === "warning")
      ? "var(--marigold-dim)"
      : "var(--savanna-dim)"
    : "var(--clay-dim)";

  const label = dq.acceptable
    ? `${dq.coveragePct}% data quality`
    : `${dq.coveragePct}% — low quality`;

  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
      style={{ background: bgVar, color }}
    >
      {label}
    </span>
  );
}

function DataQualityPanel({ dq }: { dq: DataQuality }) {
  const [open, setOpen] = useState(!dq.acceptable);

  const headerColor = dq.acceptable
    ? dq.issues.some((i) => i.level === "warning")
      ? "var(--marigold)"
      : "var(--savanna)"
    : "var(--clay)";

  const borderColor = dq.acceptable
    ? dq.issues.some((i) => i.level === "warning")
      ? "var(--marigold)"
      : "var(--savanna)"
    : "var(--clay)";

  const LEVEL_ICON: Record<string, string> = {
    info: "ℹ",
    warning: "⚠",
    excluded: "✕",
  };

  const LEVEL_COLOR: Record<string, string> = {
    info: "var(--sage)",
    warning: "var(--marigold)",
    excluded: "var(--clay)",
  };

  return (
    <div
      className="mt-2 rounded-[var(--radius-md)] border p-3"
      style={{ borderColor, background: "white" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div>
          <p className="text-xs font-bold" style={{ color: headerColor }}>
            Data health: {dq.coveragePct}% of transactions usable
          </p>
          {!open && dq.issues.length > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--sage)" }}>
              {dq.issues.length} issue{dq.issues.length === 1 ? "" : "s"} found
              — tap to see details
            </p>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--sage)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div
            className="flex items-center gap-4 text-xs pb-2 border-b"
            style={{ borderColor: "var(--line)", color: "var(--sage)" }}
          >
            <span>
              <strong style={{ color: "var(--ink)" }}>{dq.totalExtracted}</strong>{" "}
              extracted
            </span>
            <span>
              <strong style={{ color: "var(--ink)" }}>{dq.usableRows}</strong>{" "}
              usable
            </span>
            <span>
              <strong style={{ color: headerColor }}>{dq.coveragePct}%</strong>{" "}
              coverage
            </span>
          </div>

          {dq.issues.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--savanna)" }}>
              ✓ No issues found — all transactions are clean.
            </p>
          ) : (
            dq.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="shrink-0 text-xs font-bold mt-0.5"
                  style={{ color: LEVEL_COLOR[issue.level] }}
                >
                  {LEVEL_ICON[issue.level]}
                </span>
                <p
                  className="text-xs leading-5"
                  style={{ color: "var(--sage)" }}
                >
                  {issue.message}
                </p>
              </div>
            ))
          )}

          {!dq.acceptable && (
            <div
              className="mt-2 rounded-[var(--radius-md)] p-3"
              style={{ background: "var(--clay-dim)" }}
            >
              <p className="text-xs font-semibold" style={{ color: "var(--clay)" }}>
                This file has low data quality ({dq.coveragePct}% usable).
              </p>
              <p className="text-xs mt-1 leading-5" style={{ color: "var(--clay)" }}>
                Analysis will still run but results may not reflect your
                actual financial position. Consider downloading a cleaner
                export from your bank or M-Pesa portal and re-uploading.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentUploadStep({
  slug,
  onSkip,
}: {
  slug: string;
  onSkip?: () => void;
}) {
  const router = useRouter();

  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [uploading, setUploading] = useState<UploadingEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    loadFiles();
  }, [slug]);

  async function loadFiles() {
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/business/${slug}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files ?? []);
      }
    } finally {
      setLoadingFiles(false);
    }
  }

  function notify(type: "success" | "error", message: string) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 7000);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;

    const entries: UploadingEntry[] = selected.map((f) => ({
      tempId: `${Date.now()}-${f.name}`,
      filename: f.name,
      status: "uploading",
    }));
    setUploading((prev) => [...prev, ...entries]);

    await Promise.all(
      selected.map(async (file, i) => {
        const tempId = entries[i].tempId;
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch(`/api/business/${slug}/files`, {
            method: "POST",
            body: formData,
          });

          const result = await res.json();

          if (!res.ok) throw new Error(result.error ?? "Upload failed.");

          // Attach dataQuality from the response to the file record
          const fileRecord: UploadedFileRecord = {
            ...result.file,
            dataQuality: result.dataQuality,
          };

          setFiles((prev) => [fileRecord, ...prev]);
          setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Upload failed.";
          setUploading((prev) =>
            prev.map((u) =>
              u.tempId === tempId
                ? { ...u, status: "error", error: message }
                : u
            )
          );
        }
      })
    );
  }

  async function handleDelete(fileId: string, filename: string) {
    setDeletingId(fileId);
    try {
      const res = await fetch(`/api/business/${slug}/files/${fileId}`, {
        method: "DELETE",
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error ?? "Delete failed.");

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      notify(
        "success",
        result.message ??
          `"${filename}" deleted. Analysis updated with remaining files.`
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Could not delete file."
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRunAnalysis() {
    setAnalysing(true);
    try {
      const res = await fetch(`/api/business/${slug}/analyse`, {
        method: "POST",
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error ?? "Analysis failed.");

      router.push(`/business/${slug}`);
      router.refresh();
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Analysis failed."
      );
      setAnalysing(false);
    }
  }

  const hasFiles = files.length > 0;
  const hasUploading = uploading.some((u) => u.status === "uploading");
  const hasLowQualityFiles = files.some(
    (f) => f.dataQuality && !f.dataQuality.acceptable
  );

  return (
    <div className="space-y-5">
      {/* Header + guidance */}
      <div
        className="rounded-[var(--radius-lg)] border p-6 sm:p-8"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <p
          className="text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--savanna)" }}
        >
          Financial Statement Library
        </p>
        <h2
          className="font-display mt-1.5 text-xl font-bold"
          style={{ color: "var(--ink)" }}
        >
          Upload your financial statements
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
          Upload your M-Pesa statements, bank statements, or CSV exports here.
          Upload as many files as you want — weekly, daily, or whenever you
          have new data. Once you're ready, click{" "}
          <strong style={{ color: "var(--ink)" }}>Run Analysis</strong> and
          Dohtective will combine everything into a single risk report.
        </p>

        {/* What to upload */}
        <div
          className="mt-5 rounded-[var(--radius-md)] border p-4 grid gap-4 sm:grid-cols-3"
          style={{ borderColor: "var(--line)", background: "var(--bone)" }}
        >
          {[
            {
              label: "M-Pesa Statement",
              hint: "Download from the Safaricom app or MySafaricom portal. Save as PDF.",
              color: "var(--savanna)",
            },
            {
              label: "Bank Statement",
              hint: "Download from your bank's online portal. PDF or CSV both work.",
              color: "var(--ink)",
            },
            {
              label: "CSV / Excel",
              hint: "Any spreadsheet export with columns for date, amount, and description.",
              color: "var(--sage)",
            },
          ].map((item) => (
            <div key={item.label}>
              <p
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: item.color }}
              >
                {item.label}
              </p>
              <p
                className="mt-1 text-xs leading-5"
                style={{ color: "var(--sage)" }}
              >
                {item.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-4 flex-wrap">
          <label className="cursor-pointer">
            <span
              className="inline-block font-display text-sm font-bold uppercase tracking-[0.06em] text-white px-5 py-3 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{ background: "var(--savanna)" }}
            >
              + Upload files
            </span>
            <input
              type="file"
              accept=".csv,.pdf,.xlsx,.xls"
              multiple
              onChange={handleFileSelected}
              className="sr-only"
            />
          </label>
          <p className="text-xs" style={{ color: "var(--sage)" }}>
            PDF, CSV, and Excel supported · Select multiple files at once
          </p>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className="rounded-[var(--radius-md)] border p-4 text-sm font-medium flex justify-between items-start gap-3 animate-in fade-in duration-200"
          style={{
            borderColor:
              notification.type === "success" ? "var(--savanna)" : "var(--clay)",
            background:
              notification.type === "success"
                ? "var(--savanna-dim)"
                : "var(--clay-dim)",
            color:
              notification.type === "success" ? "var(--savanna)" : "var(--clay)",
          }}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="shrink-0 text-xs font-bold uppercase tracking-wider opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Uploading in progress */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((entry) => (
            <div
              key={entry.tempId}
              className="rounded-[var(--radius-md)] border p-4 flex items-center justify-between gap-3"
              style={{
                borderColor:
                  entry.status === "error" ? "var(--clay)" : "var(--line)",
                background:
                  entry.status === "error" ? "var(--clay-dim)" : "var(--bone)",
              }}
            >
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--ink)" }}
                >
                  {entry.filename}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{
                    color:
                      entry.status === "error" ? "var(--clay)" : "var(--sage)",
                  }}
                >
                  {entry.status === "uploading"
                    ? "Extracting transactions… PDFs may take a moment"
                    : entry.error ?? "Upload failed"}
                </p>
              </div>
              {entry.status === "error" && (
                <button
                  onClick={() =>
                    setUploading((prev) =>
                      prev.filter((u) => u.tempId !== entry.tempId)
                    )
                  }
                  className="shrink-0 text-xs font-bold"
                  style={{ color: "var(--clay)" }}
                >
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* File library */}
      <div
        className="rounded-[var(--radius-lg)] border"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h3
              className="font-display text-base font-bold"
              style={{ color: "var(--ink)" }}
            >
              Your files
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>
              {hasFiles
                ? `${files.length} file${files.length === 1 ? "" : "s"} · Run Analysis to combine them into a report`
                : "No files uploaded yet — add your first statement above"}
            </p>
          </div>
          {hasFiles && (
            <span
              className="font-display text-2xl font-bold"
              style={{ color: "var(--savanna)" }}
            >
              {files.length}
            </span>
          )}
        </div>

        {loadingFiles ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--sage)" }}>
              Loading your files…
            </p>
          </div>
        ) : !hasFiles ? (
          <div className="px-6 py-10 text-center">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--ink)" }}
            >
              No files yet
            </p>
            <p
              className="mt-1 text-xs leading-5 max-w-sm mx-auto"
              style={{ color: "var(--sage)" }}
            >
              Upload your first M-Pesa or bank statement above. Dohtective will
              check the data quality, then you can run analysis whenever you're
              ready.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {files.map((file) => (
              <li key={file.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--ink)" }}
                      >
                        {file.filename}
                      </p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                        style={{
                          background: FILE_KIND_COLORS[file.fileKind],
                          color: "white",
                        }}
                      >
                        {FILE_KIND_LABELS[file.fileKind]}
                      </span>
                      {file.dataQuality && (
                        <DataQualityBadge dq={file.dataQuality} />
                      )}
                    </div>
                    <div
                      className="mt-1 flex items-center gap-3 flex-wrap text-xs"
                      style={{ color: "var(--sage)" }}
                    >
                      <span>{file.rowCount} transactions</span>
                      {file.dateFrom && (
                        <span>
                          {formatDate(file.dateFrom)} →{" "}
                          {formatDate(file.dateTo)}
                        </span>
                      )}
                      <span>Uploaded {formatUploadedAt(file.uploadedAt)}</span>
                    </div>

                    {/* Inline data quality panel */}
                    {file.dataQuality && (
                      <DataQualityPanel dq={file.dataQuality} />
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(file.id, file.filename)}
                    disabled={deletingId === file.id || analysing}
                    className="shrink-0 text-xs font-bold uppercase tracking-wider transition opacity-60 hover:opacity-100 disabled:opacity-30"
                    style={{ color: "var(--clay)" }}
                  >
                    {deletingId === file.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Low quality warning before run analysis */}
      {hasLowQualityFiles && (
        <div
          className="rounded-[var(--radius-md)] border p-4"
          style={{ borderColor: "var(--clay)", background: "var(--clay-dim)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--clay)" }}>
            One or more files have low data quality
          </p>
          <p
            className="mt-1 text-xs leading-5"
            style={{ color: "var(--clay)" }}
          >
            Analysis will still run, but results may not accurately reflect your
            financial position. Consider replacing the low-quality files with
            cleaner exports before proceeding. The data health details are shown
            under each affected file above.
          </p>
        </div>
      )}

      {/* Run analysis CTA */}
      {hasFiles && (
        <div
          className="rounded-[var(--radius-lg)] border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{
            borderColor: hasLowQualityFiles ? "var(--marigold)" : "var(--savanna)",
            background: hasLowQualityFiles
              ? "var(--marigold-dim)"
              : "var(--savanna-dim)",
          }}
        >
          <div>
            <h4
              className="font-display font-bold text-sm"
              style={{ color: "var(--ink)" }}
            >
              {hasLowQualityFiles
                ? "Run analysis with current files?"
                : "Ready to run analysis?"}
            </h4>
            <p
              className="text-xs mt-0.5 leading-5"
              style={{ color: "var(--sage)" }}
            >
              Dohtective will combine all {files.length} file
              {files.length === 1 ? "" : "s"} and generate a complete risk
              report. You can re-run this anytime after uploading new files.
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={analysing || hasUploading}
            className="font-display shrink-0 w-full sm:w-auto rounded-[var(--radius-md)] px-6 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:opacity-50"
            style={{ background: "var(--ink)" }}
          >
            {analysing ? "Running analysis…" : "Run Analysis →"}
          </button>
        </div>
      )}

      {!hasFiles && onSkip && (
        <button
          onClick={onSkip}
          className="text-xs font-semibold underline underline-offset-2"
          style={{ color: "var(--sage)" }}
        >
          Skip for now — I'll upload files later
        </button>
      )}
    </div>
  );
}