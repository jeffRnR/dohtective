// app/business/[slug]/notify/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  fetchReport,
  fetchSheetsStatus,
  pushToSheets,
  sendNotificationEmail,
  type SheetsPushResult,
  type SheetsStatus,
  type ActionItem,
} from "../../../frontend/lib/api";
import type { ZohoPayload, FlagItem } from "../../../frontend/lib/types";
import Loader from "../../../frontend/components/Loader";

// ── Severity constants (mirror sheets route) ─────────────────────────
const SEVERITY_EMOJI: Record<string, string> = { high: "🔴", medium: "🟡", low: "⚪" };
const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const ROLE_BY_FLAG_KEYWORD: Array<[string, string, string]> = [
  ["mixed personal", "Founder", "Check whether this was a genuine personal expense paid from the business account. If so, record it as an owner draw."],
  ["duplicate payment", "Accountant", "Confirm with the supplier whether this was a deliberate re-order or an accidental double payment. Request a refund if duplicate."],
  ["round-number payment", "Accountant", "Verify this payment against a supporting invoice."],
  ["unusually precise", "Accountant", "Confirm this recipient and payment are legitimate."],
  ["unusual transaction", "Accountant", "Review the transaction description and confirm it matches a real, expected business expense."],
  ["unreconciled", "Accountant", "Match this transaction against the bank statement and mark it reconciled."],
  ["reference number sequence", "Accountant", "Check whether the missing reference numbers were voided entries or genuinely missing records."],
  ["supporting documents", "Accountant", "Request the missing receipt or invoice from whoever made this purchase."],
  ["bank statement", "Accountant", "Complete the bank reconciliation for this statement period."],
  ["cash buffer", "Founder", "Review upcoming payments due and confirm there's enough cash to cover them."],
];

function flagToActionItem(flag: FlagItem): ActionItem {
  const lower = flag.title.toLowerCase();
  let role = "Accountant";
  let action = "Review this flag and determine the appropriate next step.";
  for (const [keyword, r, a] of ROLE_BY_FLAG_KEYWORD) {
    if (lower.includes(keyword)) { role = r; action = a; break; }
  }
  return {
    priority: `${SEVERITY_EMOJI[flag.severity] ?? "⚪"} ${flag.severity.toUpperCase()}`,
    flag: flag.title,
    assignedTo: role,
    action,
  };
}

// ── Step indicator ───────────────────────────────────────────────────
type Step = "connect" | "push" | "done";

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all"
        style={{
          background: done ? "var(--savanna)" : active ? "var(--ink)" : "var(--line)",
          color: done || active ? "white" : "var(--sage)",
        }}
      >
        {done ? "✓" : active ? "●" : "○"}
      </div>
      <span className="text-xs font-medium" style={{ color: active || done ? "var(--ink)" : "var(--sage)" }}>
        {label}
      </span>
    </div>
  );
}

function StepBar({ step }: { step: Step }) {
  return (
    <div className="mb-6 flex items-start justify-center gap-0">
      <StepDot active={step === "connect"} done={step === "push" || step === "done"} label="Connect" />
      <div className="mx-2 mt-4 h-px w-12 flex-shrink-0" style={{ background: "var(--line)" }} />
      <StepDot active={step === "push"} done={step === "done"} label="Push" />
      <div className="mx-2 mt-4 h-px w-12 flex-shrink-0" style={{ background: "var(--line)" }} />
      <StepDot active={step === "done"} done={false} label="Done" />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function NotifyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = String(params.slug);

  const [data, setData] = useState<ZohoPayload | null>(null);
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [result, setResult] = useState<SheetsPushResult | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth callback params — Google redirects back here with these.
  const sheetsConnected = searchParams.get("sheets_connected") === "1";
  const sheetsError = searchParams.get("sheets_error");

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

  function handleConnect() {
    // Redirect to our OAuth initiation route, passing the slug so the
    // callback knows where to redirect back to.
    window.location.href = `/api/auth/google-sheets?slug=${encodeURIComponent(slug)}`;
  }

  async function handlePush() {
    if (!data) return;
    setPushing(true);
    setError(null);
    try {
      const pushResult = await pushToSheets(data.report, data.meta.company_name);
      setResult(pushResult);

      // Auto-send email right after a successful push.
      await handleSendEmail(pushResult);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "TOKEN_EXPIRED") {
        // Clear the connected state so the UI drops back to step 1.
        setStatus((s) => s ? { ...s, configured: false, connectedEmail: null } : s);
        setError("Your Google Sheets connection has expired. Please reconnect.");
      } else {
        setError(e.message ?? "Could not push to Google Sheets.");
      }
    } finally {
      setPushing(false);
    }
  }

  async function handleSendEmail(pushResult: SheetsPushResult) {
    if (!data) return;
    setSendingEmail(true);
    try {
      const actionItems = [...data.report.flags]
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2))
        .map(flagToActionItem);

      await sendNotificationEmail({
        slug,
        businessName: data.meta.company_name,
        sheetUrl: pushResult.sheet_url,
        actionItems,
        period: data.meta.period_start
          ? `${data.meta.period_start} – ${data.meta.period_end}`
          : undefined,
      });
      setEmailSent(true);
    } catch (err) {
      // Email failure is non-fatal — the sheet was already created.
      // Surface it as a warning, not a blocking error.
      setError(
        `Sheet created successfully, but the notification email failed: ${err instanceof Error ? err.message : "Unknown error"}. You can still open the sheet below.`
      );
    } finally {
      setSendingEmail(false);
    }
  }

  if (loading) return <Loader fullPage label="Loading..." />;

  // Derive current step.
  const step: Step = result ? "done" : status?.configured ? "push" : "connect";

  return (
    <div className="max-w-2xl space-y-5">
      <div
        className="rounded-[var(--radius-lg)] border p-6 sm:p-7"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--marigold)" }}>
          Follow-up workflow
        </p>
        <h1 className="font-display mt-1.5 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Push this report to Google Sheets
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
          Creates a new Google Sheet in your Drive with an action list sorted by priority,
          each item assigned to the founder or accountant — then emails both with the checklist.
        </p>

        <div className="mt-6">
          <StepBar step={step} />
        </div>

        {/* ── OAuth error from callback ── */}
        {sheetsError && !status?.configured && (
          <div
            className="mb-4 rounded-[var(--radius-md)] border p-4 text-sm"
            style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
          >
            <p className="font-semibold">Could not connect Google Sheets</p>
            <p className="mt-1 text-xs opacity-80">
              {sheetsError === "no_refresh_token"
                ? "Google didn't return a refresh token. Try disconnecting the app at myaccount.google.com/permissions and reconnecting."
                : sheetsError === "token_exchange_failed"
                ? "The authorization code exchange failed. Please try again."
                : `OAuth error: ${sheetsError}`}
            </p>
          </div>
        )}

        {/* ── General error ── */}
        {error && (
          <div
            className="mb-4 rounded-[var(--radius-md)] border p-4 text-sm font-medium"
            style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
          >
            {error}
          </div>
        )}

        {/* ── STEP 1: Connect ── */}
        {step === "connect" && (
          <div className="mt-2 space-y-4">
            <div
              className="rounded-[var(--radius-md)] border p-4"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                Connect your Google account
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--sage)" }}>
                We'll ask Google for permission to create and edit spreadsheets in your Drive.
                The sheet will live in your Google Drive — you own it.
              </p>
            </div>

            <button
              onClick={handleConnect}
              className="font-display flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] border px-5 py-3.5 text-sm font-bold transition hover:opacity-90"
              style={{ borderColor: "var(--line)", background: "white", color: "var(--ink)" }}
            >
              {/* Google "G" icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google Sheets
            </button>
          </div>
        )}

        {/* ── STEP 2: Push ── */}
        {step === "push" && (
          <div className="mt-2 space-y-4">
            {/* Connected badge */}
            <div
              className="flex items-center gap-2.5 rounded-[var(--radius-md)] border p-3"
              style={{ borderColor: "var(--savanna)", background: "var(--savanna-dim)" }}
            >
              <span style={{ color: "var(--savanna)" }}>✓</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--savanna)" }}>
                  Google Sheets connected
                </p>
                {status?.connectedEmail && (
                  <p className="text-xs" style={{ color: "var(--ink)" }}>
                    {status.connectedEmail}
                  </p>
                )}
              </div>
              <button
                onClick={handleConnect}
                className="ml-auto text-xs underline underline-offset-2"
                style={{ color: "var(--sage)" }}
              >
                Switch account
              </button>
            </div>

            {/* Report preview */}
            {data && (
              <div
                className="rounded-[var(--radius-md)] border p-4"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--sage)" }}>
                  What will be written
                </p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-2xl font-bold" style={{ color: "var(--ink)" }}>
                      {data.report.flags.length}
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>action items</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold" style={{ color: "var(--ink)" }}>
                      {data.report.anomaly_transactions?.length ?? 0}
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>transaction rows</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold" style={{ color: "var(--ink)" }}>2</span>
                    <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>sheet tabs</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5" style={{ color: "var(--sage)" }}>
                  A new sheet will be created in your Google Drive. The founder and accountant
                  will be emailed with the checklist after the push.
                </p>
              </div>
            )}

            <button
              onClick={handlePush}
              disabled={pushing || sendingEmail || !data}
              className="font-display flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:cursor-not-allowed"
              style={{ background: pushing || sendingEmail ? "var(--sage)" : "var(--ink)" }}
            >
              {pushing ? (
                <>
                  <Spinner /> Creating sheet…
                </>
              ) : sendingEmail ? (
                <>
                  <Spinner /> Sending emails…
                </>
              ) : (
                "Push to Google Sheets & notify"
              )}
            </button>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === "done" && result && (
          <div className="mt-2 space-y-4">
            <div
              className="rounded-[var(--radius-md)] border p-4"
              style={{ borderColor: "var(--savanna)", background: "var(--savanna-dim)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--savanna)" }}>
                ✓ Sheet created successfully
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink)" }}>
                {result.action_items_written} action items and {result.anomaly_rows_written} transaction rows written.
              </p>
              {emailSent && (
                <p className="mt-1 text-xs" style={{ color: "var(--ink)" }}>
                  ✓ Notification email sent to founder{status?.connectedEmail ? "" : ""} and accountant.
                </p>
              )}
            </div>

            <a
              href={result.sheet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border px-5 py-3.5 text-sm font-bold transition hover:opacity-80"
              style={{ borderColor: "var(--savanna)", color: "var(--savanna)", background: "white" }}
            >
              Open Google Sheet →
            </a>

            <button
              onClick={() => { setResult(null); setEmailSent(false); setError(null); }}
              className="w-full text-center text-xs underline underline-offset-2"
              style={{ color: "var(--sage)" }}
            >
              Push again (creates a new sheet)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline spinner ───────────────────────────────────────────────────
function Spinner() {
  return (
    <>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: "dohtective-spin 0.8s linear infinite" }}
      >
        <circle cx="12" cy="12" r="9.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
        <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <style>{`@keyframes dohtective-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}