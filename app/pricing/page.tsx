// app/pricing/page.tsx
"use client";

import "../frontend/styles/tokens.css";
import LandingNav from "../frontend/components/LandingNav";
import LandingFooter from "../frontend/components/LandingFooter";

// PLACEHOLDER PRICING - no pricing model has been set for this product
// yet. These tiers and figures are a reasonable starting structure, not
// a real commitment. Replace with actual numbers before this page is
// shown to anyone outside a demo context.
const TIERS = [
  {
    name: "Starter",
    price: "Free",
    cadence: "",
    description: "One business, the core wedge - mixed funds and duplicate detection.",
    features: [
      "1 business",
      "Zoho Books connection",
      "Mixed funds & duplicate detection",
      "Monthly plain-language report",
    ],
    cta: "Get started",
    href: "/sign-up",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "KES -",
    cadence: "/month",
    description: "For a business ready to add an accountant and sharper detection.",
    features: [
      "Up to 3 businesses",
      "Everything in Starter",
      "Supporting documents (KRA PIN, eTIMS, bank statements)",
      "Google Sheets action-list workflow",
      "Add accountant & reviewer access",
    ],
    cta: "Get started",
    href: "/sign-up",
    highlighted: true,
  },
  {
    name: "Multi-business",
    price: "Talk to us",
    cadence: "",
    description: "For accountants or groups managing several SMEs at once.",
    features: [
      "Unlimited businesses",
      "Everything in Growth",
      "Priority support",
    ],
    cta: "Contact us",
    href: "mailto:hello@example.com",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav />

      <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            Pricing
          </p>
          <h1 className="font-display mt-2 text-4xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            Start with one business. Add more when it's worth it.
          </h1>
          <p className="mt-4 text-base leading-7" style={{ color: "var(--sage)" }}>
            Every tier gets the same detection engine - the difference is how many businesses
            and how much document depth you need.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="flex flex-col rounded-[var(--radius-lg)] border p-7"
              style={{
                borderColor: tier.highlighted ? "var(--savanna)" : "var(--line)",
                background: "white",
                boxShadow: tier.highlighted ? "0 0 0 1px var(--savanna)" : "none",
              }}
            >
              {tier.highlighted ? (
                <span
                  className="mb-3 w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{ background: "var(--savanna-dim)", color: "var(--savanna)" }}
                >
                  Most common
                </span>
              ) : null}
              <p className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>{tier.name}</p>
              <p className="mt-2">
                <span className="font-display text-3xl font-bold" style={{ color: "var(--ink)" }}>{tier.price}</span>
                <span className="text-sm" style={{ color: "var(--sage)" }}>{tier.cadence}</span>
              </p>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--sage)" }}>{tier.description}</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "var(--ink)" }}>
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--savanna)" }} />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={tier.href}
                className="font-display mt-6 rounded-[var(--radius-md)] px-5 py-3 text-center text-sm font-bold uppercase tracking-[0.06em] transition"
                style={{
                  background: tier.highlighted ? "var(--savanna)" : "white",
                  color: tier.highlighted ? "white" : "var(--ink)",
                  border: tier.highlighted ? "none" : "1px solid var(--line)",
                }}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs italic" style={{ color: "var(--sage)" }}>
          Pricing shown is a placeholder structure - figures not yet finalized.
        </p>
      </main>

      <LandingFooter />
    </div>
  );
}
