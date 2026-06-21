// app/frontend/components/ZohoConnectBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "checking" | "not_connected" | "connected" | "pending_org_selection";

export default function ZohoConnectBanner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("checking");
  const [justConnectedMsg, setJustConnectedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("zoho_connected") === "true") {
      setJustConnectedMsg("Zoho Books connected successfully.");
    }
    const zohoError = searchParams.get("zoho_error");
    if (zohoError) {
      setErrorMsg(zohoError);
    }
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function checkStatus() {
    try {
      const res = await fetch(`/api/zoho/oauth/status?slug=${slug}`);
      const data = await res.json();
      if (data.connected) setStatus("connected");
      else if (data.pendingOrgSelection) setStatus("pending_org_selection");
      else setStatus("not_connected");
    } catch {
      setStatus("not_connected");
    }
  }

  if (status === "checking" || status === "connected") {
    // Once connected, this banner gets out of the way entirely — no
    // persistent "you're connected!" chrome cluttering the dashboard
    // every visit. The one-time success message (if just redirected
    // back) is shown below, separately, and self-dismisses.
    return justConnectedMsg ? (
      <div
        className="rounded-[var(--radius-md)] border p-4 text-sm font-medium"
        style={{ borderColor: "var(--savanna)", background: "var(--savanna-dim)", color: "var(--savanna)" }}
      >
        {justConnectedMsg}
      </div>
    ) : null;
  }

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--marigold)" }}>
        Not yet connected
      </p>
      <h2 className="font-display mt-1.5 text-lg font-bold" style={{ color: "var(--ink)" }}>
        Connect this business's real Zoho Books account
      </h2>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
        One click, redirects to Zoho's real sign-in and consent screen — Dohtective never sees
        your Zoho password, only the data you approve sharing.
      </p>

      {errorMsg ? (
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--clay)" }}>
          Couldn't connect: {errorMsg}
        </p>
      ) : null}

      {status === "pending_org_selection" ? (
        <a
          href={`/business/${slug}/connect-zoho/select-org`}
          className="font-display mt-4 inline-block rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
          style={{ background: "var(--savanna)" }}
        >
          Finish choosing an organization →
        </a>
      ) : (
        <a
          href={`/api/zoho/oauth/start?slug=${slug}`}
          className="font-display mt-4 inline-block rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
          style={{ background: "var(--savanna)" }}
        >
          Connect Zoho Books →
        </a>
      )}
    </div>
  );
}