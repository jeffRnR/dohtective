// app/verify/page.tsx
// Public-facing verification page. Anyone — a bank, investor, or
// accountant — can come here with a business slug and month to
// confirm a Dohtective report is genuine and unaltered.
// No sign-in required. The answer comes from the blockchain, not our DB.

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import "../frontend/styles/tokens.css";
import LandingNav from "../frontend/components/LandingNav";
import LandingFooter from "../frontend/components/LandingFooter";
import { useSession } from "next-auth/react";

type VerifyResult = {
  verified: boolean;
  businessId?: string;
  monthYear?: string;
  onChainHash?: string | null;
  anchoredAt?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
  message?: string;
  reason?: string;
  match?: boolean;
  providedHash?: string;
};

export default function VerifyPage() {
  const searchParams = useSearchParams();

  const { status } = useSession();
  const isSignedIn = status === "authenticated";

  const [businessSlug, setBusinessSlug] = useState(
    searchParams.get("business") ?? "",
  );
  const [monthYear, setMonthYear] = useState(searchParams.get("month") ?? "");
  const [reportHash, setReportHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    if (!businessSlug || !monthYear) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const url = new URL(
        `/api/verify/${encodeURIComponent(businessSlug)}/${encodeURIComponent(monthYear)}`,
        window.location.origin,
      );
      if (reportHash) url.searchParams.set("reportHash", reportHash);

      const res = await fetch(url.toString());
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("Could not reach the verification service. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const isVerified = result?.verified === true;
  const isMatch = result?.match === true;
  const hasHashCheck = result?.providedHash != null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-20">
        {/* Header */}
        <div>
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            Report verification
          </p>
          <h1
            className="font-display mt-2 text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--ink)" }}
          >
            Verify a Dohtective report
          </h1>
          <p
            className="mt-3 text-sm leading-6"
            style={{ color: "var(--sage)" }}
          >
            Every Dohtective report is anchored on the Avalanche blockchain the
            moment it's generated. Enter a business name and month below to
            confirm a report exists and hasn't been altered. No account needed.
          </p>
        </div>

        {/* Form */}
        <div
          className="mt-8 rounded-[var(--radius-lg)] border p-6 bg-white space-y-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--sage)" }}
              >
                Business ID
              </label>
              <input
                type="text"
                placeholder="e.g. gearnova"
                value={businessSlug}
                onChange={(e) => setBusinessSlug(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </div>
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--sage)" }}
              >
                Month (YYYY-MM)
              </label>
              <input
                type="text"
                placeholder="e.g. 2026-06"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </div>
          </div>

          {/* Optional hash comparison */}
          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--sage)" }}
            >
              Report hash (optional — paste to confirm a specific report)
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={reportHash}
              onChange={(e) => setReportHash(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-mono outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--sage)" }}>
              Leave blank to just check if a report exists for this period.
            </p>
          </div>

          <button
            onClick={handleVerify}
            disabled={loading || !businessSlug || !monthYear}
            className="font-display w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--ink)" }}
          >
            {loading ? "Checking blockchain…" : "Verify report"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mt-4 rounded-[var(--radius-md)] border p-4 text-sm"
            style={{
              borderColor: "var(--clay)",
              background: "var(--clay-dim)",
              color: "var(--clay)",
            }}
          >
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div
            className="mt-4 rounded-[var(--radius-lg)] border p-6 bg-white space-y-4"
            style={{
              borderColor: isVerified ? "var(--savanna)" : "var(--clay)",
            }}
          >
            {/* Status banner */}
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                style={{
                  background: isVerified
                    ? "var(--savanna-dim)"
                    : "var(--clay-dim)",
                  color: isVerified ? "var(--savanna)" : "var(--clay)",
                }}
              >
                {isVerified ? "✓" : "✗"}
              </div>
              <div>
                <p
                  className="font-display text-base font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {hasHashCheck
                    ? isMatch
                      ? "Report verified — hash matches"
                      : "Hash mismatch — report may have been altered"
                    : isVerified
                      ? "Report found on Avalanche"
                      : "No report found for this period"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>
                  {result.message ?? result.reason ?? ""}
                </p>
              </div>
            </div>

            {/* Details */}
            {isVerified && (
              <div
                className="rounded-[var(--radius-md)] p-4 space-y-2.5"
                style={{ background: "var(--bone)" }}
              >
                {[
                  { label: "Business", value: result.businessId },
                  { label: "Period", value: result.monthYear },
                  {
                    label: "Anchored",
                    value: result.anchoredAt
                      ? new Date(result.anchoredAt).toLocaleString("en-KE", {
                          timeZone: "Africa/Nairobi",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—",
                  },
                  {
                    label: "On-chain hash",
                    value: result.onChainHash
                      ? `${result.onChainHash.slice(0, 20)}…${result.onChainHash.slice(-8)}`
                      : "—",
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4"
                  >
                    <span
                      className="text-xs font-semibold shrink-0"
                      style={{ color: "var(--sage)" }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-xs font-mono text-right"
                      style={{ color: "var(--ink)" }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Explorer link */}
            {result.explorerUrl && (
              <a
                href={result.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-semibold transition hover:opacity-70"
                style={{ color: "var(--savanna)" }}
              >
                <span>View on Snowtrace (Avalanche explorer)</span>
                <span>→</span>
              </a>
            )}

            {/* Hash comparison detail */}
            {hasHashCheck && (
              <div
                className="space-y-2 pt-2 border-t"
                style={{ borderColor: "var(--line)" }}
              >
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: "var(--sage)" }}
                  >
                    On-chain hash
                  </p>
                  <p
                    className="text-xs font-mono break-all"
                    style={{ color: "var(--ink)" }}
                  >
                    {result.onChainHash}
                  </p>
                </div>
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: "var(--sage)" }}
                  >
                    Provided hash
                  </p>
                  <p
                    className="text-xs font-mono break-all"
                    style={{
                      color: isMatch ? "var(--savanna)" : "var(--clay)",
                    }}
                  >
                    {result.providedHash}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* What this means */}
        <div
          className="mt-6 rounded-[var(--radius-lg)] border p-5"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--sage)" }}
          >
            How this works
          </p>
          <div className="mt-3 space-y-3">
            {[
              "When a Dohtective report is generated, a unique fingerprint of that report is written to the Avalanche blockchain permanently.",
              "Nobody — not Dohtective, not the founder — can alter what was recorded. The blockchain is the source of truth.",
              "Paste the report hash you received to confirm the report you're looking at matches exactly what was anchored on-chain.",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
                  style={{ background: "var(--bone-dim)", color: "var(--ink)" }}
                >
                  {i + 1}
                </span>
                <p
                  className="text-xs leading-5"
                  style={{ color: "var(--sage)" }}
                >
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
