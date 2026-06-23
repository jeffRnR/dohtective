// app/business/[slug]/connect-zoho/select-org/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import "../../../../frontend/styles/tokens.css";
import Loader from "../../../../frontend/components/Loader";

type ZohoOrg = { organization_id: string; name: string };

export default function SelectOrgPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);

  const [orgs, setOrgs] = useState<ZohoOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/zoho/oauth/pending-orgs?slug=${slug}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOrgs(data.organizations ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load organizations."))
      .finally(() => setLoading(false));
  }, [slug]);

  async function selectOrg(organizationId: string) {
    setSelecting(organizationId);
    setError(null);
    try {
      const res = await fetch("/api/zoho/oauth/select-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, organization_id: organizationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not connect this organization.");
      router.push(`/business/${slug}?zoho_connected=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSelecting(null);
    }
  }

  // Wipe token states completely if they back out
  async function handleCancelAndDisconnect() {
    if (!confirm("Are you sure you want to cancel setup? This will disconnect your Zoho account connection.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/zoho/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to cleanly disconnect.");
      }
      router.push(`/business/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete disconnection routine.");
      setDisconnecting(false);
    }
  }

  if (loading) return <Loader fullPage label="Loading your Zoho organizations..." />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <main className="mx-auto max-w-xl px-5 py-16 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>
              Which Zoho Books organization?
            </h1>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
              Your Zoho account has more than one Books organization. Pick the one that matches
              this business - you can connect a different one later from settings.
            </p>
          </div>
        </div>

        {error ? (
          <div
            className="mt-5 rounded-[var(--radius-md)] border p-4 text-sm font-medium"
            style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-2.5">
          {orgs.map((org) => (
            <button
              key={org.organization_id}
              onClick={() => selectOrg(org.organization_id)}
              disabled={selecting !== null || disconnecting}
              className="flex w-full items-center justify-between rounded-[var(--radius-md)] border p-4 text-left transition hover:border-[var(--savanna)] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "white" }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{org.name}</p>
                <p className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--sage)" }}>{org.organization_id}</p>
              </div>
              {selecting === org.organization_id ? <Loader size="sm" /> : null}
            </button>
          ))}
        </div>

        <div className="mt-8 border-t pt-5 flex justify-end" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={handleCancelAndDisconnect}
            disabled={selecting !== null || disconnecting}
            className="text-xs font-semibold uppercase tracking-wider transition hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--clay)" }}
          >
            {disconnecting ? "Disconnecting..." : "Disconnect & Cancel Setup"}
          </button>
        </div>
      </main>
    </div>
  );
}