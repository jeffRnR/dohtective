// app/pricing/page.tsx
"use client";

import { useState, useEffect } from "react";
import "../frontend/styles/tokens.css";
import LandingNav from "../frontend/components/LandingNav";
import LandingFooter from "../frontend/components/LandingFooter";
import { ConnectButton, TransactionButton } from "thirdweb/react";
import {
  client,
  activeChain,
  paymentsContract,
} from "../frontend/lib/thirdweb";
import { prepareContractCall } from "thirdweb";

type PaymentMethod = "mpesa" | "bank" | "crypto";

interface Tier {
  id: string;
  name: string;
  kesPrice: number; // Single source of truth for pricing
  cadence: string;
  durationDays: number;
  description: string;
  features: string[];
  requiresPayment: boolean;
}

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    kesPrice: 0,
    cadence: "/forever",
    durationDays: 0,
    description: "Essential vulnerability checking for small setups with core on-chain logging.",
    features: [
      "1 Connected Zoho Books account",
      "Manual anomaly screening",
      "Standard vulnerability overview",
      "Immutable Avalanche anchoring trail",
    ],
    requiresPayment: false,
  },
  {
    id: "growth",
    name: "Growth",
    kesPrice: 5000,
    cadence: "/month",
    durationDays: 30,
    description: "For a business ready to add an accountant and sharper automated detection.",
    features: [
      "Up to 3 businesses",
      "Zoho Books connection",
      "Supporting documents workflow",
      "Immutable AI Report Verification",
      "Automated Avalanche anchoring trail",
    ],
    requiresPayment: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    kesPrice: 20000,
    cadence: "/3 months",
    durationDays: 90,
    description: "High-volume structural validation for multi-branch corporations and accounting firms.",
    features: [
      "Unlimited Zoho integrations",
      "Deep cross-entity transaction matching",
      "Prepaid 90-day verification tier",
      "Automated Avalanche anchoring trail",
      "Dedicated high-priority support channel",
    ],
    requiresPayment: true,
  },
];

export default function PricingPage() {
  const [method, setMethod] = useState<PaymentMethod>("mpesa");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedTier, setSelectedTier] = useState<Tier>(TIERS[1]); // Default to Growth Plan
  
  // Real-time exchange rate state (KES per 1 USDC)
  const [exchangeRate, setExchangeRate] = useState<number>(129.50); // Dynamic baseline fallback
  const [isLoadingRate, setIsLoadingRate] = useState<boolean>(true);

  // Fetch real-time spot exchange rate from Coinbase on mount
  useEffect(() => {
    async function fetchLiveSpotRate() {
      try {
        // Coinbase provides direct spot prices for crypto-fiat conversions down to the minute
        const response = await fetch("https://api.coinbase.com/v2/prices/USDC-KES/spot");
        if (!response.ok) throw new Error("Failed to pull live spot rate");
        const json = await response.json();
        
        if (json?.data?.amount) {
          const numericalRate = parseFloat(json.data.amount);
          if (!isNaN(numericalRate) && numericalRate > 0) {
            setExchangeRate(numericalRate);
          }
        }
      } catch (error) {
        console.error("⚠️ Coinbase API unreachable, leveraging safe baseline rate:", error);
      } finally {
        setIsLoadingRate(false);
      }
    }

    fetchLiveSpotRate();
    // Optional: Set up an interval to refresh the exchange rate every 5 minutes while on the page
    const interval = setInterval(fetchLiveSpotRate, 300000);
    return () => clearInterval(interval);
  }, []);

  // Compute live USDC valuation cleanly based on the loaded spot metrics
  const calculateUsdcPrice = (kes: number): string => {
    if (kes === 0) return "0";
    return (kes / exchangeRate).toFixed(2);
  };

  const currentUsdcPrice = calculateUsdcPrice(selectedTier.kesPrice);

  const handleMpesaSubmit = async () => {
    alert(`Triggering M-Pesa KES ${selectedTier.kesPrice.toLocaleString()} STK Push to ${phoneNumber}...`);
  };

  const handleBankSubmit = async () => {
    alert(`Redirecting to Bank Payment Gateway for KES ${selectedTier.kesPrice.toLocaleString()}...`);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav />

      <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="text-center">
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            Upgrade to Premium
          </p>
          <h1
            className="font-display mt-2 text-4xl font-bold leading-tight"
            style={{ color: "var(--ink)" }}
          >
            Secure your financial operations.
          </h1>
        </div>

        {/* Plan Selection Switcher */}
        <div className="mt-10 flex justify-center">
          <div className="flex bg-gray-100 rounded-xl p-1.5 border border-gray-200/60 max-w-md w-full">
            {TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTier(t);
                  if (!t.requiresPayment && method === "crypto") {
                    setMethod("mpesa");
                  }
                }}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                  selectedTier.id === t.id
                    ? "bg-white shadow-sm font-extrabold text-slate-900"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {/* Package Details */}
          <div className="rounded-[var(--radius-lg)] border p-7 bg-white flex flex-col justify-between" style={{ borderColor: "var(--line)" }}>
            <div>
              <p
                className="font-display text-lg font-bold"
                style={{ color: "var(--ink)" }}
              >
                {selectedTier.name} Plan
              </p>
              <p className="mt-2">
                <span
                  className="font-display text-3xl font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {method === "crypto" 
                    ? `$${currentUsdcPrice} USDC` 
                    : `KES ${selectedTier.kesPrice.toLocaleString()}`
                  }
                </span>
                <span className="text-sm" style={{ color: "var(--sage)" }}>
                  {selectedTier.cadence}
                </span>
              </p>
              
              {method === "crypto" && (
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">
                  {isLoadingRate ? "Syncing ticker..." : `Live Rate: 1 USDC = ${exchangeRate.toFixed(2)} KES`}
                </p>
              )}
              
              <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--sage)" }}>
                {selectedTier.description}
              </p>
              
              <ul className="mt-6 space-y-3">
                {selectedTier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: "var(--ink)" }}
                  >
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--savanna)" }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Checkout Controls */}
          <div className="rounded-[var(--radius-lg)] border p-7 bg-white flex flex-col gap-6" style={{ borderColor: "var(--line)" }}>
            <h3 className="font-bold text-lg" style={{ color: "var(--ink)" }}>
              Select Payment Method
            </h3>

            <div className="flex bg-gray-100 rounded-lg p-1">
              {(["mpesa", "bank", "crypto"] as const).map((m) => (
                <button
                  key={m}
                  disabled={!selectedTier.requiresPayment && m === "crypto"}
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${
                    !selectedTier.requiresPayment && m === "crypto" 
                      ? "opacity-40 cursor-not-allowed" 
                      : ""
                  } ${
                    method === m
                      ? "bg-white shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {m === "crypto" ? "USDC (Avalanche)" : m.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="mt-4 flex-1">
              {!selectedTier.requiresPayment ? (
                <div className="space-y-4 text-center py-6">
                  <p className="text-sm" style={{ color: "var(--sage)" }}>
                    The Starter tier includes active on-chain reporting features and does not require manual billing settlement.
                  </p>
                  <button
                    disabled
                    className="w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-gray-400 bg-gray-100 border cursor-not-allowed"
                  >
                    Free Active Access
                  </button>
                </div>
              ) : (
                <>
                  {method === "mpesa" && (
                    <div className="space-y-4">
                      <label
                        className="block text-sm font-medium"
                        style={{ color: "var(--ink)" }}
                      >
                        M-Pesa Number
                      </label>
                      <input
                        type="tel"
                        placeholder="254700000000"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--savanna)]"
                        style={{ borderColor: "var(--line)" }}
                      />
                      <button
                        onClick={handleMpesaSubmit}
                        className="w-full rounded-md px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                        style={{ background: "#4ade80" }}
                      >
                        Pay KES {selectedTier.kesPrice.toLocaleString()}
                      </button>
                    </div>
                  )}

                  {method === "bank" && (
                    <div className="space-y-4">
                      <p className="text-sm" style={{ color: "var(--sage)" }}>
                        You will be redirected to our secure banking partner to
                        complete your KES {selectedTier.kesPrice.toLocaleString()} transfer via EFT or card.
                      </p>
                      <button
                        onClick={handleBankSubmit}
                        className="w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white hover:opacity-90 transition"
                        style={{ background: "var(--ink)" }}
                      >
                        Continue to Bank
                      </button>
                    </div>
                  )}

                  {method === "crypto" && (
                    <div className="space-y-4 flex flex-col items-center">
                      <p
                        className="text-sm text-center"
                        style={{ color: "var(--sage)" }}
                      >
                        Connect your Avalanche wallet to pay using USDC.
                      </p>
                      <div className="flex justify-center scale-95 origin-center border-2 border-black p-1 rounded-lg">
                        <ConnectButton client={client} chain={activeChain} />
                      </div>
                      <TransactionButton
                        transaction={() => {
                          // Secure compilation into base 6-decimal units for USDC contract parameterization
                          const parsedUSDCUnits = Math.round(parseFloat(currentUsdcPrice) * 1e6);
                          
                          return prepareContractCall({
                            contract: paymentsContract,
                            method:
                              "function payForPremium(string businessId, uint256 amount, uint256 durationDays)",
                            params: [
                              "b_placeholder_slug",
                              BigInt(parsedUSDCUnits),
                              BigInt(selectedTier.durationDays),
                            ],
                          });
                        }}
                        onTransactionSent={(result) =>
                          console.log(
                            "Transaction submitted",
                            result.transactionHash
                          )
                        }
                        onTransactionConfirmed={(receipt) =>
                          alert(`Payment of $${currentUsdcPrice} USDC confirmed successfully!`)
                        }
                        onError={(error) =>
                          alert(`Transaction failed: ${error.message}`)
                        }
                        className="w-full !mt-4"
                      >
                        Confirm ${currentUsdcPrice} USDC Payment
                      </TransactionButton>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}