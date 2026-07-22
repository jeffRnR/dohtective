"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import "../frontend/styles/tokens.css";
import LandingNav from "../frontend/components/LandingNav";

interface Package {
  id: string;
  name: string;
  credits: number;
  usdcAmount: number;
  durationDays: number;
  tag: string | null;
  description: string;
}

interface BusinessOption {
  slug: string;
  name: string;
}

const PACKAGES: Package[] = [
  {
    id: "free",
    name: "Free",
    credits: 3,
    usdcAmount: 0,
    durationDays: 0,
    tag: "Included on signup",
    description:
      "Every new business starts with 3 free credits. Enough to try the service and run a first few analyses.",
  },
  {
    id: "starter",
    name: "Starter",
    credits: 10,
    usdcAmount: 2,
    durationDays: 30,
    tag: null,
    description:
      "10 credits for a simple top-up. Good for one business that needs a few checks each month.",
  },
  {
    id: "growth",
    name: "Growth",
    credits: 50,
    usdcAmount: 7,
    durationDays: 30,
    tag: "Most popular",
    description:
      "50 credits for a larger top-up. Good for founders who want regular checks without thinking about it.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    credits: 200,
    usdcAmount: 20,
    durationDays: 90,
    tag: "Best value",
    description:
      "200 credits for a bigger top-up. Good for accountants or busy teams managing multiple businesses.",
  },
];

type PaymentState = "idle" | "processing" | "pending" | "success" | "error";

export default function PricingPage() {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  const [selected, setSelected] = useState<Package>(PACKAGES[2]);
  const [exchangeRate, setExchangeRate] = useState<number>(129.5);
  const [rateLoading, setRateLoading] = useState(true);
  const [rateWarning, setRateWarning] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [businessSlug, setBusinessSlug] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function fetchRate() {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(
          "https://api.coinbase.com/v2/prices/USDC-KES/spot",
          {
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          throw new Error(`Rate request failed with ${res.status}`);
        }

        const json = await res.json().catch(() => null);
        const rawAmount = json?.data?.amount ?? json?.amount ?? null;
        const parsed = Number(rawAmount);

        if (!cancelled && Number.isFinite(parsed) && parsed > 0) {
          setExchangeRate(parsed);
          setRateWarning(null);
        } else {
          setRateWarning("Using a fallback estimate for the price.");
        }
      } catch {
        if (!cancelled) {
          setRateWarning("Using a fallback estimate for the price.");
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        if (!cancelled) {
          setRateLoading(false);
        }
      }
    }

    fetchRate();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setBusinesses([]);
      setBusinessSlug("");
      setBusinessesLoading(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    async function loadBusinesses() {
      setBusinessesLoading(true);

      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch("/api/businesses", {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`businesses request failed with ${res.status}`);
        }

        const payload = await res.json().catch(() => null);
        const list = Array.isArray(payload)
          ? payload
          : (payload?.businesses ?? payload?.data ?? []);

        const normalized = (list as any[])
          .map((item) => {
            const slug = item?.slug ?? item?.businessSlug ?? item?.id ?? "";
            const name = item?.name ?? item?.businessName ?? slug ?? "Business";
            if (!slug) return null;
            return { slug, name };
          })
          .filter(Boolean) as BusinessOption[];

        if (!cancelled) {
          setBusinesses(normalized);

          if (normalized.length > 0 && !businessSlug) {
            setBusinessSlug(normalized[0].slug);
          }
        }
      } catch {
        if (!cancelled) {
          setBusinesses([]);
          setBusinessSlug("");
        }
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        if (!cancelled) {
          setBusinessesLoading(false);
        }
      }
    }

    loadBusinesses();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!orderId || paymentState !== "pending") return;

    let cancelled = false;
    let attempts = 0;

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setPaymentState("error");
        setPaymentError(
          "The payment request is taking too long. Please try again in a moment.",
        );
      }
    }, 180_000);

    const poll = async () => {
      attempts += 1;

      const controller = new AbortController();
      const pollTimeout = window.setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch(
          `/api/kotani/status?orderId=${encodeURIComponent(orderId)}`,
          {
            signal: controller.signal,
          },
        );

        const data = await res.json().catch(() => null);

        if (cancelled) return;

        const status = String(
          data?.status ?? data?.order?.status ?? data?.state ?? "",
        ).toLowerCase();

        const success =
          status === "successful" ||
          status === "success" ||
          status === "completed" ||
          status === "paid" ||
          status === "confirmed" ||
          data?.credited === true ||
          data?.creditGranted === true;

        const failed =
          status === "failed" ||
          status === "cancelled" ||
          status === "expired" ||
          status === "error";

        if (success) {
          setPaymentState("success");
          setPaymentMessage(
            "Payment confirmed. Your credits should be available in your business dashboard shortly.",
          );
          return;
        }

        if (failed) {
          setPaymentState("error");
          setPaymentError(
            data?.message ||
              data?.error ||
              "The M-Pesa payment did not complete. Please try again.",
          );
          return;
        }

        if (attempts >= 60) {
          setPaymentState("error");
          setPaymentError(
            "We are still waiting for confirmation. Please check your phone and try again if needed.",
          );
        }
      } catch {
        if (attempts >= 10) {
          setPaymentState("error");
          setPaymentError(
            "We could not confirm the payment right now. Please try again.",
          );
        }
      } finally {
        clearTimeout(pollTimeout);
      }
    };

    poll();
    const interval = window.setInterval(poll, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [orderId, paymentState]);

  const kesEquivalent = (usdc: number) =>
    usdc === 0
      ? "Free"
      : `≈ KES ${Math.round(usdc * exchangeRate).toLocaleString()}`;

  function selectPackage(pkg: Package) {
    setSelected(pkg);
    setPaymentState("idle");
    setPaymentMessage(null);
    setPaymentError(null);
    setOrderId(null);
    setReferenceId(null);
    setExpiresAt(null);
  }

  async function handleInitiatePayment() {
    if (selected.usdcAmount === 0) return;

    if (!isSignedIn) {
      window.location.assign("/sign-in");
      return;
    }

    if (!businessSlug) {
      setPaymentState("error");
      setPaymentError(
        "Please choose the business that should receive the credits.",
      );
      return;
    }

    const normalizedPhone = phoneNumber.trim();

    if (!normalizedPhone) {
      setPaymentState("error");
      setPaymentError("Please enter the phone number for the M-Pesa prompt.");
      return;
    }

    setPaymentState("processing");
    setPaymentError(null);
    setPaymentMessage("Starting the M-Pesa payment…");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch("/api/kotani/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selected.id,
          package: selected.id,
          plan: selected.id,
          businessSlug,
          slug: businessSlug,
          businessId: businessSlug,
          phoneNumber: normalizedPhone,
          amountKes: Math.round(selected.usdcAmount * exchangeRate),
          amount: Math.round(selected.usdcAmount * exchangeRate),
          userEmail: session?.user?.email ?? null,
          userId: session?.user?.id ?? null,
        }),
        signal: controller.signal,
      });

      let data: any = {};

      try {
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text();
          data = { message: text };
        }
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "We could not start the M-Pesa payment.",
        );
      }

      setOrderId(data?.orderId || data?.id || null);
      setReferenceId(data?.referenceId || null);
      setExpiresAt(data?.expiresAt || null);

      setPaymentState("pending");
      setPaymentMessage(
        data?.message ||
          "We have started the M-Pesa payment. Please approve the prompt on your phone.",
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setPaymentState("error");
        setPaymentError("The payment request took too long. Please try again.");
      } else {
        setPaymentState("error");
        setPaymentError(
          err instanceof Error
            ? err.message
            : "We could not start the M-Pesa payment.",
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const canPay =
    selected.usdcAmount > 0 &&
    isSignedIn &&
    !!businessSlug &&
    phoneNumber.trim().length > 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            Analysis credits
          </p>
          <h1
            className="font-display mt-2 text-4xl font-bold leading-tight"
            style={{ color: "var(--ink)" }}
          >
            Buy credits with M-Pesa. No subscriptions. No confusion.
          </h1>
          <p
            className="mt-4 text-sm leading-6"
            style={{ color: "var(--sage)" }}
          >
            One credit runs one full analysis. Buy what you need, when you need
            it. Credits stay with the business you choose.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map((pkg) => {
            const isSelected = selected.id === pkg.id;

            return (
              <button
                key={pkg.id}
                onClick={() => selectPackage(pkg)}
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

                <p
                  className="font-display text-base font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {pkg.name}
                </p>

                <p className="mt-2">
                  <span
                    className="font-display text-xl font-bold"
                    style={{ color: "var(--ink)" }}
                  >
                    {pkg.usdcAmount === 0
                      ? "Free"
                      : `≈ KES ${Math.round(pkg.usdcAmount * exchangeRate).toLocaleString()}`}
                  </span>
                </p>

                <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>
                  {rateLoading ? "Loading…" : kesEquivalent(pkg.usdcAmount)}
                </p>

                <div
                  className="mt-4 border-t pt-4"
                  style={{ borderColor: "var(--line)" }}
                >
                  <p
                    className="font-display text-2xl font-bold"
                    style={{ color: "var(--ink)" }}
                  >
                    {pkg.credits}
                    <span
                      className="ml-1 text-sm font-normal"
                      style={{ color: "var(--sage)" }}
                    >
                      credits
                    </span>
                  </p>
                  <p
                    className="mt-1 text-xs font-semibold"
                    style={{ color: "var(--savanna)" }}
                  >
                    {pkg.usdcAmount === 0
                      ? "Free"
                      : `≈ ${Math.round((pkg.usdcAmount / pkg.credits) * exchangeRate).toLocaleString()} KES per analysis`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div
            className="rounded-[var(--radius-lg)] border bg-white p-6"
            style={{ borderColor: "var(--line)" }}
          >
            <p
              className="text-xs font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--sage)" }}
            >
              {selected.name} package
            </p>
            <p
              className="font-display mt-1 text-2xl font-bold"
              style={{ color: "var(--ink)" }}
            >
              {selected.credits} analysis credits
            </p>
            <p
              className="mt-3 text-sm leading-6"
              style={{ color: "var(--sage)" }}
            >
              {selected.description}
            </p>

            <div className="mt-5 space-y-3">
              {[
                "Run a full analysis in one step",
                "Get a clear action list for your accountant or founder",
                "Use the report for cash planning and follow-up",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--savanna)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--ink)" }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>

            {selected.usdcAmount > 0 && (
              <p className="mt-5 text-xs" style={{ color: "var(--sage)" }}>
                {rateLoading
                  ? "Loading live rate…"
                  : `Approximate price: ${kesEquivalent(selected.usdcAmount)}`}
              </p>
            )}

            {rateWarning && (
              <p className="mt-2 text-xs" style={{ color: "var(--sage)" }}>
                {rateWarning}
              </p>
            )}
          </div>

          <div
            className="flex flex-col rounded-[var(--radius-lg)] border bg-white p-6"
            style={{ borderColor: "var(--line)" }}
          >
            {selected.usdcAmount === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                  style={{ background: "var(--savanna-dim)" }}
                >
                  ✓
                </div>
                <div>
                  <p
                    className="font-display text-base font-bold"
                    style={{ color: "var(--ink)" }}
                  >
                    Included with signup
                  </p>
                  <p
                    className="mt-1 text-sm leading-5"
                    style={{ color: "var(--sage)" }}
                  >
                    Every business starts with 3 free credits. No payment is
                    needed.
                  </p>
                </div>
                <a
                  href={isSignedIn ? "/businesses" : "/sign-up"}
                  className="font-display mt-2 w-full rounded-[var(--radius-md)] px-5 py-3 text-center text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                  style={{ background: "var(--savanna)" }}
                >
                  {isSignedIn ? "Go to my businesses" : "Get started free"} →
                </a>
              </div>
            ) : paymentState === "success" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
                  style={{ background: "var(--savanna-dim)" }}
                >
                  ✓
                </div>
                <div>
                  <p
                    className="font-display text-base font-bold"
                    style={{ color: "var(--ink)" }}
                  >
                    Payment received
                  </p>
                  <p
                    className="mt-1 text-sm leading-5"
                    style={{ color: "var(--sage)" }}
                  >
                    Your credits are being added to the selected business.
                  </p>
                </div>
                <a
                  href="/businesses"
                  className="font-display mt-2 w-full rounded-[var(--radius-md)] px-5 py-3 text-center text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                  style={{ background: "var(--savanna)" }}
                >
                  Go to my businesses →
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p
                    className="font-display text-base font-bold"
                    style={{ color: "var(--ink)" }}
                  >
                    Pay with M-Pesa
                  </p>
                  <p
                    className="mt-1 text-sm leading-5"
                    style={{ color: "var(--sage)" }}
                  >
                    We will send an M-Pesa prompt to the phone number you enter.
                    Once you approve it, your credits are added to the business
                    you choose.
                  </p>
                </div>

                {!isSignedIn && (
                  <div
                    className="rounded-[var(--radius-md)] border p-3 text-center text-xs"
                    style={{
                      borderColor: "var(--marigold)",
                      background: "var(--marigold-dim)",
                      color: "var(--ink)",
                    }}
                  >
                    Sign in first so we know which account to credit.{" "}
                    <a href="/sign-in" className="font-bold underline">
                      Sign in →
                    </a>
                  </div>
                )}

                {!isSignedIn && (
                  <div className="text-xs" style={{ color: "var(--sage)" }}>
                    You can still browse the pricing page, but you will need to
                    sign in before paying.
                  </div>
                )}

                <label
                  className="flex flex-col gap-2 text-sm"
                  style={{ color: "var(--ink)" }}
                >
                  <span className="font-semibold">
                    Which business should get the credits?
                  </span>
                  <select
                    value={businessSlug}
                    onChange={(e) => setBusinessSlug(e.target.value)}
                    className="rounded-[var(--radius-md)] border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--line)",
                      background: "white",
                      color: "var(--ink)",
                    }}
                    disabled={!isSignedIn || businessesLoading}
                  >
                    {businesses.length === 0 ? (
                      <option value="">
                        {businessesLoading
                          ? "Loading businesses…"
                          : "No businesses found yet"}
                      </option>
                    ) : (
                      businesses.map((business) => (
                        <option key={business.slug} value={business.slug}>
                          {business.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label
                  className="flex flex-col gap-2 text-sm"
                  style={{ color: "var(--ink)" }}
                >
                  <span className="font-semibold">
                    Phone number for the M-Pesa prompt
                  </span>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0712 345 678"
                    className="rounded-[var(--radius-md)] border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--line)",
                      background: "white",
                      color: "var(--ink)",
                    }}
                  />
                </label>

                <div
                  className="rounded-[var(--radius-md)] border p-3 text-xs leading-5"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bone)",
                  }}
                >
                  <p className="font-semibold" style={{ color: "var(--ink)" }}>
                    What happens next
                  </p>
                  <ul
                    className="mt-2 list-disc pl-5"
                    style={{ color: "var(--sage)" }}
                  >
                    <li>We start the M-Pesa payment request</li>
                    <li>You approve the prompt on your phone</li>
                    <li>Credits are added to the selected business</li>
                  </ul>
                </div>

                {paymentError && (
                  <div
                    className="rounded-[var(--radius-md)] border p-3 text-sm"
                    style={{
                      borderColor: "var(--clay)",
                      background: "var(--clay-dim)",
                      color: "var(--clay)",
                    }}
                  >
                    {paymentError}
                  </div>
                )}

                {paymentMessage && !paymentError && (
                  <div
                    className="rounded-[var(--radius-md)] border p-3 text-sm"
                    style={{
                      borderColor: "var(--savanna)",
                      background: "var(--savanna-dim)",
                      color: "var(--savanna)",
                    }}
                  >
                    {paymentMessage}
                  </div>
                )}

                <button
                  onClick={handleInitiatePayment}
                  disabled={
                    paymentState === "processing" ||
                    paymentState === "pending" ||
                    !canPay
                  }
                  className="font-display w-full rounded-[var(--radius-md)] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: "var(--ink)" }}
                >
                  {paymentState === "processing"
                    ? "Starting payment…"
                    : paymentState === "pending"
                      ? "Waiting for M-Pesa approval…"
                      : `Pay ${selected.usdcAmount === 0 ? "free" : `KES ${Math.round(selected.usdcAmount * exchangeRate).toLocaleString()}`}`}
                </button>

                {referenceId && (
                  <p
                    className="text-center text-[11px]"
                    style={{ color: "var(--sage)" }}
                  >
                    Reference: {referenceId}
                  </p>
                )}

                {expiresAt && (
                  <p
                    className="text-center text-[11px]"
                    style={{ color: "var(--sage)" }}
                  >
                    This request expires at{" "}
                    {new Date(expiresAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="mt-8 rounded-[var(--radius-lg)] border p-6"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--sage)" }}
          >
            How credits work
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "One credit, one analysis",
                body: "Each time you run a full analysis, it uses one credit. The report gives you flags, cash planning help, and a clear next step.",
              },
              {
                title: "Credits stay with your business",
                body: "Buy credits once and use them later. There is no monthly subscription to cancel.",
              },
              {
                title: "Easy to understand",
                body: "You can see what your business has used and what is still available in the dashboard.",
              },
            ].map((item) => (
              <div key={item.title}>
                <p
                  className="text-sm font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {item.title}
                </p>
                <p
                  className="mt-1.5 text-xs leading-5"
                  style={{ color: "var(--sage)" }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
