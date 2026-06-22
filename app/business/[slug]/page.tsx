// app/business/[slug]/page.tsx
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReport(slug);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loader fullPage label="Loading your monthly risk report..." />;
  }

  if (error || !data) {
    return (
      <div
        className="rounded-[var(--radius-lg)] border p-6 text-sm font-medium"
        style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
      >
        {error ?? "Could not load this business."}
      </div>
    );
  }

  const isEmpty = data.transactions.length === 0;
  const sortedFlags = [...data.report.flags].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  if (isEmpty) {
    return (
      <div className="space-y-5">
        <ZohoConnectBanner slug={slug} />
        <VerdictBand report={data.report} trend={data.trend} />
        <div className="rounded-[var(--radius-lg)] border p-6 sm:p-8 text-center" style={{ borderColor: "var(--line)", background: "white" }}>
          <p className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
            No transactions yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--sage)" }}>
            Connect this business's real Zoho Books account above, or add supporting documents
            to get the system ready while you wait for books to flow in.
          </p>
          <button
            onClick={() => router.push(`/business/${slug}/documents`)}
            className="font-display mt-5 rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
            style={{ background: "var(--savanna)" }}
          >
            Add supporting documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ZohoConnectBanner slug={slug} />
      <VerdictBand report={data.report} trend={data.trend} />
      <MixedFundsSpotlight report={data.report} />
      <FlagFeed flags={sortedFlags} initialVisibleCount={3} title="What needs your eyes" />
      <ActionPlan items={data.report.followup_workflow} slug={slug} />
      <EvidencePanel report={data.report} />

      <div className="rounded-[var(--radius-lg)] border p-5 text-center" style={{ borderColor: "var(--line)", background: "var(--bone-dim)" }}>
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