// app/frontend/page.tsx
"use client";

import { useEffect, useState } from "react";
import type { Org, ZohoPayload } from "./lib/types";
import LandingPage from "./components/LandingPage";
import AnalysisDashboard from "./components/AnalysisDashboard";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ZohoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    try {
      const res = await fetch("/api/zoho");
      if (!res.ok) throw new Error("Unable to load organizations.");
      const payload = await res.json();
      setOrgs(payload.organizations ?? []);
      if (payload.organizations?.length > 0) {
        setConnected(true);
      }
    } catch (err) {
      console.error("Error loading orgs:", err);
    }
  }

  async function fetchReport(orgSlug: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report?org=${orgSlug}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to load report.");
      }
      const payload = (await res.json()) as ZohoPayload;
      setData(payload);
      setSelectedOrg(orgSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-200">
      {data && connected ? (
        <AnalysisDashboard
          data={data}
          orgs={orgs}
          selectedOrg={selectedOrg}
          onSelectOrg={fetchReport}
          onBack={() => setData(null)}
          loading={loading}
        />
      ) : (
        <LandingPage
          orgs={orgs}
          loading={loading}
          onSelectOrg={fetchReport}
          error={error}
          connected={connected}
          onRefresh={loadOrganizations}
        />
      )}
    </div>
  );
}
