// app/page.tsx
"use client";

import { useSession } from "next-auth/react";
import "./frontend/styles/tokens.css";
import LandingNav from "./frontend/components/LandingNav";
import LandingFooter from "./frontend/components/LandingFooter";
import AvalancheTrustStrip from "./frontend/components/AvalancheTrustStrip";

export default function Home() {
  // CHANGELOG: this page used to force-redirect any authenticated visitor
  // straight to /businesses, with no way back to the landing page short
  // of signing out. That's a real dead end -- a signed-in person should
  // still be able to see pricing, the "how it works" section, or just
  // get back to a stable home URL. Fix: render normally for everyone;
  // only the CTAs and nav adapt based on session state (see
  // LandingNav / the hero buttons below). The actual post-login
  // destination is now set directly in sign-in/sign-up (both push to
  // /businesses on success), not enforced here.
  const { status } = useSession();
  const isSignedIn = status === "authenticated";

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
              AI Financial Controller for Kenyan SMEs
            </p>
            <h1 className="font-display mt-3 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl" style={{ color: "var(--ink)" }}>
              Catch the problem a month before the investor update does.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 sm:text-lg" style={{ color: "var(--sage)" }}>
              By the time a financial problem shows up in a monthly report, the damage is already
              done. Dohtective connects to your Zoho Books and reviews your finances automatically
              every month - flagging mixed funds, duplicate payments, and cash flow risk while
              there's still time to fix them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={isSignedIn ? "/businesses" : "/sign-up"}
                className="font-display rounded-[var(--radius-md)] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
                style={{ background: "var(--savanna)" }}
              >
                {isSignedIn ? "Go to my businesses" : "Get started free"} &rarr;
              </a>
              <a
                href="/pricing"
                className="font-display rounded-[var(--radius-md)] border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] transition hover:border-[var(--savanna)]"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "white" }}
              >
                See pricing
              </a>
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--sage)" }}>
              Built for the messy books of a growing Kenyan SME - not a Fortune 500 audit tool.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border p-6 shadow-sm" style={{ borderColor: "var(--line)", background: "white" }}>
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--sage)" }}>Cash buffer</p>
            <p className="font-display mt-1 text-5xl font-bold" style={{ color: "var(--savanna)" }}>23<span className="text-2xl"> days</span></p>
            <div className="mt-5 space-y-2.5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--marigold-dim)" }}>
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--marigold)" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Possible mixed personal and business funds</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>Worth a look when you get a chance</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--clay-dim)" }}>
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--clay)" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Possible duplicate payment</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>We're quite sure - act on this now</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            What it actually catches
          </p>
          <h2 className="font-display mt-2 max-w-2xl text-3xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            We started with one problem and made it genuinely good - not five problems done badly.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--sage)" }}>
            Mixed personal and business funds is the most common, least-watched risk in a growing
            Kenyan SME. Dohtective flags it with a confidence level, not a verdict - "worth a look"
            versus "act on this now" - so you know what actually needs your attention today.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Mixed funds", detail: "Personal spending flowing through the business account, flagged by confidence." },
              { title: "Duplicate payments", detail: "The same amount, same recipient, paid twice within days." },
              { title: "Cash flow risk", detail: "An honest days-of-buffer estimate, with early-warning thresholds." },
              { title: "Unreconciled entries", detail: "What's missing or unmatched, in plain language." },
            ].map((item) => (
              <div key={item.title} className="rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--line)", background: "white" }}>
                <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            How it works
          </p>
          <h2 className="font-display mt-2 text-3xl font-bold" style={{ color: "var(--ink)" }}>
            One real connection. Optional documents. A plain-language answer.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { step: "01", title: "Connect Zoho Books", detail: "A real OAuth connection - Dohtective never sees your password, only what you approve sharing." },
              { step: "02", title: "Add documents, if you want", detail: "KRA PIN, bank statement, eTIMS receipts - optional, and each one sharpens detection in a specific way." },
              { step: "03", title: "Get a monthly answer", detail: "Plain language, a specific action plan, and a push to Google Sheets your accountant can act on." },
            ].map((item) => (
              <div key={item.step}>
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--sage)" }}>{item.step}</span>
                <p className="font-display mt-1.5 text-lg font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
                Built to be trusted, not just used
              </p>
              <h2 className="font-display mt-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
                Every flag says how sure we are - and what we still can't see.
              </h2>
              <p className="mt-4 text-sm leading-7" style={{ color: "var(--sage)" }}>
                Dohtective never tells you something is fraud. It tells you what's worth a look,
                and how confident it is - because a tool a founder can't trust is a tool nobody
                actually uses.
              </p>
            </div>
            <AvalancheTrustStrip />
          </div>
        </section>

        <section className="border-t py-16 text-center sm:py-20" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl font-bold" style={{ color: "var(--ink)" }}>
            Never surprise your investor with a problem this could have caught.
          </h2>
          <a
            href={isSignedIn ? "/businesses" : "/sign-up"}
            className="font-display mt-7 inline-block rounded-[var(--radius-md)] px-7 py-4 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
            style={{ background: "var(--savanna)" }}
          >
            {isSignedIn ? "Go to my businesses" : "Get started free"} &rarr;
          </a>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}