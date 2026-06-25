// app/pricing/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import "../frontend/styles/tokens.css";
import LandingNav from "../frontend/components/LandingNav";
import LandingFooter from "../frontend/components/LandingFooter";
import { ConnectButton, TransactionButton } from "thirdweb/react";
import { client, activeChain, paymentsContract } from "../frontend/lib/thirdweb";
import { prepareContractCall } from "thirdweb";

// ── Credit packages ──────────────────────────────────────────────────
// One credit = one full analysis run. Credits never expire.
// USDC amounts are in base units (6 decimals): $2 = 2_000_000 units.

interface Package {
  id: string;
  name: string;
  credits: number;
  usdcAmount: number;       // display price in USDC
  usdcUnits: bigint;        // contract param (6 decimal base units)
  durationDays: number;     // passed to contract for record-keeping
  tag: string | null;       // badge label
  perCredit: string;        // unit cost label
  description: string;
}

const PACKAGES: Package[] = [
  {
    id: "free",
    name: "Free",
    credits: 3,
    usdcAmount: 0,
    usdcUnits: BigInt(0),
    durationDays: 0,
    tag: "Included on signup",
    perCredit: "Free",
    description:
      "Every new business starts with 3 credits. Enough to run your first three analyses and see exactly what Dohtective finds in your books.",
  },
  {
    id: "starter",
    name: "Starter",
    credits: 10,
    usdcAmount: 2,
    usdcUnits: BigInt("2000000"),
    durationDays: 30,
    tag: null,
    perCredit: "$0.20 / analysis",
    description:
      "10 credits for $2 USDC. Good for a founder running a single business monthly. Buy more whenever you need them — no subscription.",
  },
  {
    id: "growth",
    name: "Growth",
    credits: 50,
    usdcAmount: 7,
    usdcUnits: BigInt("7000000"),
    durationDays: 30,
    tag: "Most popular",
    perCredit: "$0.14 / analysis",
    description:
      "50 credits for $7 USDC. For businesses with multiple branches or founders who run analysis more than once a month.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    credits: 200,
    usdcAmount: 20,
    usdcUnits: BigInt("20000000"),
    durationDays: 90,
    tag: "Best value",
    perCredit: "$0.10 / analysis",
    description:
      "200 credits for $20 USDC. For accountants managing multiple clients or high-volume businesses that run analysis weekly.",
  },
];

export default function PricingPage() {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  const [selected, setSelected] = useState<Package>(PACKAGES[2]); // Growth default
  const [exchangeRate, setExchangeRate] = useState<number>(129.5);
  const [rateLoading, setRateLoading] = useState(true);
  const [paymentDone, setPaymentDone] = useState(false);

  // Business slug from session — used as businessId in the contract call
  // The founder must be signed in for crypto payment to work
  const businessSlug = ""; // TODO: if you have a slug in context, pass it here

  useEffect(() => {
    async function fetchRate() {
      try {
        const res = await fetch("https://api.coinbase.com/v2/prices/USDC-KES/spot");
        if (!res.ok) throw new Error("Rate fetch failed");
        const json = await res.json();
        const rate = parseFloat(json?.data?.amount);
        if (!isNaN(rate) && rate > 0) setExchangeRate(rate);
      } catch {
        // Fallback rate is already set
      } finally {
        setRateLoading(false);
      }
    }
    fetchRate();
    const interval = setInterval(fetchRate, 300_000);
    return () => clearInterval(interval);
  }, []);

  const kesEquivalent = (usdc: number) =>
    usdc === 0 ? "Free" : `≈ KES ${Math.round(usdc * exchangeRate).toLocaleString()}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            Analysis credits
          </p>
          <h1 className="font-display mt-2 text-4xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            Pay for what you use. Nothing more.
          </h1>
          <p className="mt-4 text-sm leading-6" style={{ color: "var(--sage)" }}>
            One credit runs one full analysis — flags, cash buffer, action list, everything.
            Credits never expire. No monthly fee, no subscription to cancel.
          </p>
        </div>

        {/* Package cards */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map((pkg) => {
            const isSelected = selected.id === pkg.id;
            return (
              <button
                key={pkg.id}
                onClick={() => { setSelected(pkg); setPaymentDone(false); }}
                className="relative text-left rounded-[var(--radius-lg)] border p-5 transition hover:shadow-sm"
                style={{
                  borderColor: isSelected ? "var(--savanna)" : "var(--line)",
                  background: isSelected ? "var(--savanna-dim)" : "white",
                  outline: isSelected ? "2px solid var(--savanna)" : "none",
                }}
              >
                {pkg.tag && (
                  <span
                    className="absolute -top-2.5 left-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white"
                    style={{ background: "var(--savanna)" }}
                  >
                    {pkg.tag}
                  </span>
                )}

                <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>
                  {pkg.name}
                </p>

                <p className="mt-2">
                  <span className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>
                    {pkg.usdcAmount === 0 ? "Free" : `$${pkg.usdcAmount} USDC`}
                  </span>
                </p>

                <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>
                  {rateLoading ? "—" : kesEquivalent(pkg.usdcAmount)}
                </p>

                <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--line)" }}>
                  <p className="text-2xl font-bold font-display" style={{ color: "var(--ink)" }}>
                    {pkg.credits}
                    <span className="text-sm font-normal ml-1" style={{ color: "var(--sage)" }}>
                      credits
                    </span>
                  </p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: "var(--savanna)" }}>
                    {pkg.perCredit}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected package detail + payment */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">

          {/* What you get */}
          <div
            className="rounded-[var(--radius-lg)] border p-6 bg-white"
            style={{ borderColor: "var(--line)" }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--sage)" }}>
              {selected.name} package
            </p>
            <p className="font-display mt-1 text-2xl font-bold" style={{ color: "var(--ink)" }}>
              {selected.credits} analysis credits
            </p>
            <p className="mt-3 text-sm leading-6" style={{ color: "var(--sage)" }}>
              {selected.description}
            </p>

            <div className="mt-5 space-y-3">
              {[
                "Full anomaly detection — mixed funds, duplicates, unusual transactions",
                "Cash runway estimate with early warning thresholds",
                "Plain-language action list for founder and accountant",
                "Push to Google Sheets with one click",
                "Report anchored on Avalanche — verifiable by anyone",
              ].map((f) => (
                <div key={f} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--savanna)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--ink)" }}>{f}</p>
                </div>
              ))}
            </div>

            {/* Live rate */}
            {selected.usdcAmount > 0 && (
              <p className="mt-5 text-xs" style={{ color: "var(--sage)" }}>
                {rateLoading
                  ? "Loading live rate…"
                  : `Live rate: 1 USDC = KES ${exchangeRate.toFixed(2)} · ${kesEquivalent(selected.usdcAmount)}`}
              </p>
            )}
          </div>

          {/* Payment panel */}
          <div
            className="rounded-[var(--radius-lg)] border p-6 bg-white flex flex-col"
            style={{ borderColor: "var(--line)" }}
          >
            {selected.usdcAmount === 0 ? (
              // Free tier
              <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 py-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                  style={{ background: "var(--savanna-dim)" }}
                >
                  ✓
                </div>
                <div>
                  <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>
                    Already included
                  </p>
                  <p className="mt-1 text-sm leading-5" style={{ color: "var(--sage)" }}>
                    Every business starts with 3 free credits. No card needed —
                    they're waiting in your dashboard.
                  </p>
                </div>
                <a
                  href={isSignedIn ? "/businesses" : "/sign-up"}
                  className="font-display mt-2 w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90 text-center"
                  style={{ background: "var(--savanna)" }}
                >
                  {isSignedIn ? "Go to my businesses" : "Get started free"} →
                </a>
              </div>
            ) : paymentDone ? (
              // Success state
              <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 py-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                  style={{ background: "var(--savanna-dim)" }}
                >
                  ✓
                </div>
                <div>
                  <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>
                    {selected.credits} credits added
                  </p>
                  <p className="mt-1 text-sm leading-5" style={{ color: "var(--sage)" }}>
                    Your payment is confirmed on Avalanche. Credits are now
                    available in your dashboard.
                  </p>
                </div>
                <a
                  href="/businesses"
                  className="font-display mt-2 w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90 text-center"
                  style={{ background: "var(--savanna)" }}
                >
                  Go to my businesses →
                </a>
              </div>
            ) : (
              // Crypto payment
              <div className="flex flex-col gap-5">
                <div>
                  <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>
                    Pay with USDC on Avalanche
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "var(--sage)" }}>
                    Settles in ~2 seconds. Credits are added automatically once
                    the transaction confirms on-chain. You need USDC on
                    Avalanche Fuji testnet.
                  </p>
                </div>

                {/* How it works */}
                <div className="rounded-[var(--radius-md)] p-4 space-y-2.5" style={{ background: "var(--bone)" }}>
                  {[
                    "Connect your wallet below",
                    `Approve $${selected.usdcAmount} USDC transfer`,
                    "Credits land in your account instantly",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: "var(--savanna-dim)", color: "var(--savanna)" }}
                      >
                        {i + 1}
                      </span>
                      <p className="text-xs" style={{ color: "var(--sage)" }}>{step}</p>
                    </div>
                  ))}
                </div>

                {!isSignedIn && (
                  <div
                    className="rounded-[var(--radius-md)] border p-3 text-xs text-center"
                    style={{ borderColor: "var(--marigold)", background: "var(--marigold-dim)", color: "var(--ink)" }}
                  >
                    Sign in first so we know which account to credit.{" "}
                    <a href="/sign-in" className="font-bold underline">Sign in →</a>
                  </div>
                )}

                <ConnectButton client={client} chain={activeChain} />

                <TransactionButton
                  transaction={() =>
                    prepareContractCall({
                      contract: paymentsContract,
                      method:
                        "function payForPremium(string calldata businessId, uint256 amount, uint256 durationDays) external",
                      params: [
                        businessSlug || session?.user?.email || "unknown",
                        selected.usdcUnits,
                        BigInt(selected.durationDays),
                      ],
                    })
                  }
                  onTransactionSent={(result) => {
                    console.log("[payment] Submitted:", result.transactionHash);
                  }}
                  onTransactionConfirmed={async (receipt) => {
                    try {
                      const res = await fetch('/api/business/topup-credits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          transactionHash: receipt.transactionHash,
                          businessSlug: businessSlug || session?.user?.email || 'unknown',
                          amountUnits: Number(selected.usdcUnits),
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error ?? 'Credit top-up failed.');
                      }
                      setPaymentDone(true);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Payment confirmed but credits could not be added. Contact support with your tx hash.');
                    }
                  }}
                  onError={(err) => {
                    console.error("[payment] Failed:", err.message);
                    alert(`Payment failed: ${err.message}`);
                  }}
                  style={{
                    width: "100%",
                    background: "var(--ink)",
                    color: "white",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 20px",
                    fontSize: "13px",
                    fontWeight: "700",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  Pay ${selected.usdcAmount} USDC → Get {selected.credits} credits
                </TransactionButton>

                <p className="text-[10px] text-center" style={{ color: "var(--sage)" }}>
                  Transaction verified on Avalanche Fuji testnet. Your report
                  history is anchored on-chain and independently verifiable.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Credit explainer */}
        <div
          className="mt-8 rounded-[var(--radius-lg)] border p-6"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--sage)" }}>
            How credits work
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "One credit, one analysis",
                body: "Each time you run a full analysis on a business — upload files, run the engine, get a report — it uses one credit. The report covers everything: flags, cash buffer, action list.",
              },
              {
                title: "Credits never expire",
                body: "Buy 50 credits today and use them over six months. There's no monthly renewal, no 'use it or lose it' pressure. Your credits stay until you need them.",
              },
              {
                title: "Every report is anchored",
                body: "When an analysis runs, the report hash is written to Avalanche automatically. Your financial health reports become independently verifiable — useful when talking to a bank or investor.",
              },
            ].map((item) => (
              <div key={item.title}>
                <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-1.5 text-xs leading-5" style={{ color: "var(--sage)" }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}