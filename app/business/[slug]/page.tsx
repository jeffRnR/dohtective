"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchReport } from "../../frontend/lib/api";
import type { ZohoPayload } from "../../frontend/lib/types";
import Loader from "../../frontend/components/Loader";
import VerdictBand from "../../frontend/components/VerdictBand";
import MixedFundsSpotlight from "../../frontend/components/MixedFundsSpotlight";
import FlagFeed from "../../frontend/components/FlagFeed";
import ActionPlan from "../../frontend/components/ActionPlan";
import EvidencePanel from "./components/EvidencePanel";
import ZohoConnectBanner from "../../frontend/components/ZohoConnectBanner";

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 } as const;

export default function BusinessDashboard() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);

  const [data, setData] = useState<ZohoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [zohoConnected, setZohoConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiNotification, setUiNotification] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [slug]);

  async function load(forceDisconnectState = false) {
    setLoading(true);
    setError(null);
    try {
      const [result, statusRes] = await Promise.all([
        fetchReport(slug),
        fetch(`/api/zoho/oauth/status?slug=${slug}`),
      ]);

      setData(result);

      if (forceDisconnectState) {
        setZohoConnected(false);
      } else {
        const statusData = await statusRes.json();
        setZohoConnected(statusData.connected === true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function executeDisconnect() {
    setDisconnecting(true);
    setUiNotification(null);
    try {
      const res = await fetch("/api/zoho/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error ?? "Failed to disconnect.");

      setShowConfirmDisconnect(false);
      setUiNotification("Zoho Books successfully disconnected.");
      setZohoConnected(false);
      await load(true);
    } catch (err) {
      setUiNotification(
        err instanceof Error
          ? err.message
          : "An error occurred while disconnecting.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <Loader fullPage label="Loading your monthly risk report..." />;
  }

  if (error || !data) {
    return (
      <div
        className="rounded-[var(--radius-lg)] border p-6 text-sm font-medium"
        style={{
          borderColor: "var(--clay)",
          background: "var(--clay-dim)",
          color: "var(--clay)",
        }}
      >
        {error ?? "Could not load this business."}
      </div>
    );
  }

  const isEmpty = !zohoConnected && !data.hasTransactions;

  const sortedFlags = [...(data.report?.flags || [])].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );

  const BackNavigationButton = () => (
    <div className="flex justify-start pt-2">
      <button
        onClick={() => router.push("/businesses")}
        className="group flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] opacity-60 hover:opacity-100 transition duration-150 ease-in-out"
        style={{ color: "var(--ink)" }}
      >
        <span className="transform transition-transform group-hover:-translate-x-1">
          ←
        </span>
        Back to Businesses
      </button>
    </div>
  );

  const IntegrationManagementBlock = () => (
    <div className="space-y-3">
      {uiNotification && (
        <div
          className="rounded-[var(--radius-md)] border p-4 text-sm font-medium flex justify-between items-center animate-in fade-in duration-200"
          style={{
            borderColor: "var(--line)",
            background: "var(--bone)",
            color: "var(--ink)",
          }}
        >
          <span>{uiNotification}</span>
          <button
            onClick={() => setUiNotification(null)}
            className="text-xs uppercase tracking-wider font-bold opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {showConfirmDisconnect ? (
        <div
          className="rounded-[var(--radius-lg)] border p-5 animate-in fade-in slide-in-from-top-2 duration-200 text-left"
          style={{ borderColor: "var(--clay)", background: "var(--clay-dim)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--clay)" }}>
            Disconnect Zoho Books Integration?
          </p>
          <p
            className="mt-1 text-xs leading-5"
            style={{ color: "var(--ink)", opacity: 0.8 }}
          >
            This will sever the live synchronization pipeline. Historical
            transaction records retrieved from Zoho Books will be cleared
            from your ledger metrics view.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={executeDisconnect}
              disabled={disconnecting}
              className="font-display text-xs font-bold uppercase tracking-wider text-white px-4 py-2 rounded-[var(--radius-md)] transition disabled:opacity-50"
              style={{ background: "var(--clay)" }}
            >
              {disconnecting ? "Disconnecting..." : "Yes, Disconnect"}
            </button>
            <button
              onClick={() => setShowConfirmDisconnect(false)}
              disabled={disconnecting}
              className="text-xs font-semibold px-4 py-2 rounded-[var(--radius-md)] border transition"
              style={{
                borderColor: "var(--line)",
                background: "white",
                color: "var(--ink)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        zohoConnected && (
          <div className="flex justify-start">
            <button
              onClick={() => setShowConfirmDisconnect(true)}
              className="font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-5 py-3 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{ background: "var(--clay)" }}
            >
              Disconnect Zoho Account
            </button>
          </div>
        )
      )}
    </div>
  );

  // VIEW STATE A: Empty state — no data yet
  if (isEmpty) {
    return (
      <div className="space-y-5">
        <BackNavigationButton />
        <ZohoConnectBanner slug={slug} />

        <div
          className="rounded-[var(--radius-lg)] border p-8 sm:p-10 text-center"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            No data yet
          </p>
          <h2
            className="font-display mt-2 text-2xl font-bold"
            style={{ color: "var(--ink)" }}
          >
            Upload your first financial statement
          </h2>
          <p
            className="mx-auto mt-3 max-w-md text-sm leading-6"
            style={{ color: "var(--sage)" }}
          >
            Dohtective analyses your M-Pesa statements, bank statements, and
            CSV exports to catch financial risks before they become problems.
            Upload your files, then run analysis — it takes under a minute.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push(`/business/${slug}/documents`)}
              className="font-display w-full sm:w-auto rounded-[var(--radius-md)] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
              style={{ background: "var(--savanna)" }}
            >
              Upload your first statement →
            </button>
            <button
              onClick={() => {
                window.location.href = `/api/zoho/oauth/start?slug=${slug}`;
              }}
              className="font-display w-full sm:w-auto rounded-[var(--radius-md)] border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] transition hover:opacity-80"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
                background: "white",
              }}
            >
              Connect Zoho Books instead
            </button>
          </div>

          <p className="mt-6 text-xs" style={{ color: "var(--sage)" }}>
            You can upload as many files as you want — weekly, daily, or
            whenever you have new data. Each upload is stored and combined
            when you run analysis.
          </p>
        </div>
      </div>
    );
  }

  // VIEW STATE B: Populated dashboard
  return (
    <div className="space-y-5">
      <BackNavigationButton />
      <ZohoConnectBanner slug={slug} />
      <IntegrationManagementBlock />
      <VerdictBand report={data.report} trend={data.trend} />

      {sortedFlags.length > 0 && (
        <>
          <MixedFundsSpotlight report={data.report} />
          <FlagFeed
            flags={sortedFlags}
            slug={slug}
            flagResponses={data.flagResponses ?? {}}
            initialVisibleCount={3}
            title="What needs your eyes"
          />
          <ActionPlan items={data.report.followup_workflow} slug={slug} />
          <EvidencePanel report={data.report} />
        </>
      )}

      {/* Data source information block — explains both paths clearly
          and lets the user act without leaving the dashboard */}
      <div
        className="rounded-[var(--radius-lg)] border p-6"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <p
          className="text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--savanna)" }}
        >
          How Dohtective gets your data
        </p>
        <h3
          className="font-display mt-1.5 text-base font-bold"
          style={{ color: "var(--ink)" }}
        >
          Two ways to keep your analysis current
        </h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Zoho path */}
          <div
            className="rounded-[var(--radius-md)] border p-4"
            style={{ borderColor: "var(--line)", background: "var(--bone)" }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: "var(--savanna)" }}
            >
              Automated — Zoho Books
            </p>
            <p
              className="mt-1.5 text-xs leading-5"
              style={{ color: "var(--sage)" }}
            >
              Connect your Zoho Books account and Dohtective pulls your
              transactions automatically every time you load this dashboard.
              No manual uploads needed.
            </p>
            {zohoConnected ? (
              <p
                className="mt-2 text-xs font-semibold"
                style={{ color: "var(--savanna)" }}
              >
                ✓ Connected
              </p>
            ) : (
              <button
                onClick={() => {
                  window.location.href = `/api/zoho/oauth/start?slug=${slug}`;
                }}
                className="mt-3 font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-3 py-1.5 rounded-[var(--radius-md)] transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                Connect Zoho
              </button>
            )}
          </div>

          {/* Manual path */}
          <div
            className="rounded-[var(--radius-md)] border p-4"
            style={{ borderColor: "var(--line)", background: "var(--bone)" }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: "var(--ink)" }}
            >
              Manual — Statements & Exports
            </p>
            <p
              className="mt-1.5 text-xs leading-5"
              style={{ color: "var(--sage)" }}
            >
              Upload M-Pesa statements, bank statements, or CSV exports
              whenever you have new data — daily, weekly, or monthly. All
              files are stored and combined when you run analysis.
            </p>
            <button
              onClick={() => router.push(`/business/${slug}/documents`)}
              className="mt-3 font-display text-xs font-bold uppercase tracking-[0.06em] px-3 py-1.5 rounded-[var(--radius-md)] border transition hover:opacity-80"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink)",
                background: "white",
              }}
            >
              Manage your files →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}