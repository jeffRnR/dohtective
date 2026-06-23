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
import CsvUploader from "../../frontend/components/CsvUploader";

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
        err instanceof Error ? err.message : "An error occurred while disconnecting."
      );
    } finally {
      setDisconnecting(false);
    }
  }

  const handleCsvParsed = async (csvData: any[]) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/business/${slug}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: csvData }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Ingestion failed.");
      }

      if (result.success) {
        setData((prev: any) => ({
          ...prev,
          report: result.report,
          hasTransactions: true,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process analysis.");
    } finally {
      setLoading(false);
    }
  };

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
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
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
            transaction records retrieved from Zoho Books will be cleared from
            your ledger metrics view.
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

  // VIEW STATE A: Choice screen
  if (isEmpty) {
    return (
      <div className="space-y-5">
        <BackNavigationButton />
        <ZohoConnectBanner slug={slug} />
        <IntegrationManagementBlock />
        <VerdictBand report={data.report} trend={data.trend} />

        <div
          className="rounded-[var(--radius-lg)] border p-6 sm:p-8"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <p
            className="font-display text-lg font-bold text-center"
            style={{ color: "var(--ink)" }}
          >
            No transactions or files evaluated yet
          </p>
          <p
            className="mx-auto mt-2 max-w-md text-sm leading-6 text-center"
            style={{ color: "var(--sage)" }}
          >
            Connect this business's Zoho Books account above, or upload a
            statement below to start the analysis.
          </p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
            {/* Path A — Zoho */}
            <div
              className="rounded-[var(--radius-md)] border p-5 text-center"
              style={{ borderColor: "var(--line)", background: "var(--bone)" }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--savanna)" }}
              >
                Path A — Automated
              </p>
              <p
                className="mt-1 text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Connect Zoho Books
              </p>
              <p
                className="mt-1 text-xs leading-5"
                style={{ color: "var(--sage)" }}
              >
                Real-time sync via OAuth. Transactions pull automatically each
                time you load this dashboard.
              </p>
              <button
                onClick={() => router.push(`/api/zoho/oauth/start?slug=${slug}`)}
                className="mt-4 inline-block font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-4 py-2.5 rounded-[var(--radius-md)] transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                Connect Zoho
              </button>
            </div>

            {/* Path B — Manual */}
            <div
              className="rounded-[var(--radius-md)] border p-5"
              style={{ borderColor: "var(--line)", background: "var(--bone)" }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--savanna)" }}
              >
                Path B — Manual Upload
              </p>
              <p
                className="mt-1 text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Upload a Statement
              </p>
              <p
                className="mt-1 text-xs leading-5"
                style={{ color: "var(--sage)" }}
              >
                M-Pesa, bank statement, or any CSV. The engine runs the same
                analysis either way.
              </p>
              <div className="mt-4">
                <CsvUploader onDataParsed={handleCsvParsed} />
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => router.push(`/business/${slug}/documents`)}
              className="text-xs font-semibold underline underline-offset-2"
              style={{ color: "var(--sage)" }}
            >
              Add supporting documents instead
            </button>
          </div>
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
            initialVisibleCount={3}
            title="What needs your eyes"
          />
          <ActionPlan items={data.report.followup_workflow} slug={slug} />
          <EvidencePanel report={data.report} />
        </>
      )}

      <div
        className="rounded-[var(--radius-lg)] border p-5"
        style={{ borderColor: "var(--line)", background: "var(--bone-dim)" }}
      >
        <p
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--ink)" }}
        >
          Re-run analysis with updated data
        </p>
        <CsvUploader onDataParsed={handleCsvParsed} />
      </div>

      <div
        className="rounded-[var(--radius-lg)] border p-5 text-center"
        style={{ borderColor: "var(--line)", background: "var(--bone-dim)" }}
      >
        <p className="text-sm" style={{ color: "var(--sage)" }}>
          Want sharper, compliance-aware detection?{" "}
          <button
            onClick={() => router.push(`/business/${slug}/documents`)}
            className="font-semibold underline underline-offset-2"
            style={{ color: "var(--savanna)" }}
          >
            Add supporting documents
          </button>
        </p>
      </div>
    </div>
  );
}