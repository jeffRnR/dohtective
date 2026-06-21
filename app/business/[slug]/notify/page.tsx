// app/business/[slug]/notify/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchReport, fetchSheetsStatus, pushToSheets, type SheetsPushResult, type SheetsStatus } from "../../../frontend/lib/api";
import type { ZohoPayload } from "../../../frontend/lib/types";
import Loader from "../../../frontend/components/Loader";

export default function NotifyPage() {
  const params = useParams();
  const slug = String(params.slug);

  const [data, setData] = useState<ZohoPayload | null>(null);
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<SheetsPushResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [report, sheetsStatus] = await Promise.all([fetchReport(slug), fetchSheetsStatus()]);
      setData(report);
      setStatus(sheetsStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handlePush() {
    if (!data) return;
    setPushing(true);
    setError(null);
    try {
      const pushResult = await pushToSheets(data.report, data.meta.company_name);
      setResult(pushResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not push to Google Sheets.");
    } finally {
      setPushing(false);
    }
  }

  if (loading) {
    return <Loader fullPage label="Loading..." />;
  }

  const notConfigured = status && (!status.configured || !status.serviceReachable);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-[var(--radius-lg)] border p-6 sm:p-7" style={{ borderColor: "var(--line)", background: "white" }}>
        <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--marigold)" }}>
          Follow-up workflow
        </p>
        <h1 className="font-display mt-1.5 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Push this report to Google Sheets
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
          Writes an action list - sorted by priority, each item assigned to the founder or accountant -
          plus a transaction-detail tab, into your connected Google Sheet.
        </p>

        {notConfigured ? (
          <div className="mt-5 rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--marigold)", background: "var(--marigold-dim)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--marigold)" }}>
              {!status?.serviceReachable ? "Detection service unreachable" : "Google Sheets isn't connected yet"}
            </p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--ink)" }}>
              {!status?.serviceReachable
                ? "Make sure the Python FastAPI service is running."
                : "A service account needs to be configured on the backend before this will work - see sheets_dashboard.py for setup steps. This isn't a bug, it's an honest 'not configured yet' state."}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-[var(--radius-md)] border p-4 text-sm font-medium" style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}>
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-5 rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--savanna)", background: "var(--savanna-dim)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--savanna)" }}>Pushed successfully</p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink)" }}>
              {result.action_items_written} action items, {result.anomaly_rows_written} transaction rows written.
            </p>
            <a
              href={result.sheet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-semibold underline underline-offset-2"
              style={{ color: "var(--savanna)" }}
            >
              Open the sheet &rarr;
            </a>
          </div>
        ) : (
          <>
            <button
              onClick={handlePush}
              disabled={pushing || !!notConfigured || !data}
              className="font-display mt-6 flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:cursor-not-allowed"
              style={{ background: pushing || notConfigured ? "var(--sage)" : "var(--ink)" }}
            >
              {pushing ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "dohtective-spin 0.8s linear infinite" }}>
                    <circle cx="12" cy="12" r="9.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                    <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Pushing...
                </>
              ) : (
                "Push to Google Sheets"
              )}
            </button>
            <style>{`@keyframes dohtective-spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}
