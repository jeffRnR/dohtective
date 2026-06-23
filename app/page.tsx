// /app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import "./frontend/styles/tokens.css";
import LandingNav from "./frontend/components/LandingNav";
import LandingFooter from "./frontend/components/LandingFooter";
import AvalancheTrustStrip from "./frontend/components/AvalancheTrustStrip";

export default function Home() {
  const { status } = useSession();
  const isSignedIn = status === "authenticated";

  // State handles for standalone document sandbox parsing
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Hydrate processed report state from browser cache on layout mount
  useEffect(() => {
    const savedReport = sessionStorage.getItem("latest_mpesa_report");
    if (savedReport) {
      try {
        setReportData(JSON.parse(savedReport));
      } catch (e) {
        console.error("Failed to parse cached sandbox session:", e);
      }
    }
  }, []);

  // Direct asynchronous boundary upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    setSandboxError(null);
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("document_kind", "mpesa");

    try {
      const response = await fetch("http://localhost:8000/analyze/standalone-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("The extraction engine encountered an error parsing this structure.");
      }
      
      const data = await response.json();
      
      setReportData(data.report);
      sessionStorage.setItem("latest_mpesa_report", JSON.stringify(data.report));
    } catch (error) {
      console.error("Sandbox parsing error:", error);
      setSandboxError(
        error instanceof Error 
          ? error.message 
          : "Could not connect to the statement engine. Please verify the python-service is active on port 8000."
      );
    } finally { // <-- Changed from 'finaly' to 'finally'
      setLoading(false);
    }
  };

  const clearSandboxCache = () => {
    setReportData(null);
    setSandboxError(null);
    sessionStorage.removeItem("latest_mpesa_report");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Hero Section */}
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
              every month – flagging mixed funds, duplicate payments, and cash flow risk while
              there's still time to fix them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={isSignedIn ? "/businesses" : "/sign-up"}
                className="font-display rounded-[var(--radius-md)] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
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
              Built for the messy books of a growing Kenyan SME – not a Fortune 500 audit tool.
            </p>
          </div>

          {/* Interactive Document Engine Sandbox Box Component */}
          <div className="rounded-[var(--radius-lg)] border p-6 shadow-sm transition-all" style={{ borderColor: "var(--line)", background: "white" }}>
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--sage)" }}>
                {reportData ? "Live Extracted Cash Buffer" : "Cash buffer (Demo Sandbox)"}
              </p>
              {reportData && (
                <button 
                  onClick={clearSandboxCache} 
                  className="text-xs font-semibold underline hover:text-[var(--clay)] transition"
                  style={{ color: "var(--sage)" }}
                >
                  Reset Analysis
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-8 animate-pulse text-center">
                <p className="font-display text-4xl font-bold tracking-tight" style={{ color: "var(--savanna)" }}>Parsing...</p>
                <p className="text-xs mt-2 max-w-xs mx-auto leading-relaxed" style={{ color: "var(--sage)" }}>
                  Running validation routines and matching structural anomalies...
                </p>
              </div>
            ) : (
              <>
                <p className="font-display mt-1 text-5xl font-bold" style={{ color: "var(--savanna)" }}>
                  {reportData 
                    ? (reportData.cash_buffer?.buffer_days === 9999 ? "∞" : reportData.cash_buffer?.buffer_days ?? "0")
                    : "23"}
                  <span className="text-2xl font-sans font-normal text-slate-500"> days</span>
                </p>

                {/* Secure Sandbox Failure Warning Display */}
                {sandboxError && (
                  <div 
                    className="mt-4 rounded-[var(--radius-md)] border p-3.5 text-xs font-medium animate-in fade-in duration-200"
                    style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
                  >
                    {sandboxError}
                  </div>
                )}

                <div className="mt-5 space-y-2.5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
                  {/* Dynamic Flag List Output Block */}
                  {reportData ? (
                    reportData.flags && reportData.flags.length > 0 ? (
                      reportData.flags.map((flag: any, index: number) => (
                        <div 
                          key={index} 
                          className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left animate-in fade-in slide-in-from-bottom-1 duration-200" 
                          style={{ background: flag.risk_score > 50 ? "var(--clay-dim)" : "var(--marigold-dim)" }}
                        >
                          <span 
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full" 
                            style={{ background: flag.risk_score > 50 ? "var(--clay)" : "var(--marigold)" }} 
                          />
                          <div>
                            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{flag.title}</p>
                            <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>{flag.detail}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm py-4 text-center italic" style={{ color: "var(--sage)" }}>
                        No anomalies detected in this document stream. Clean pass!
                      </p>
                    )
                  ) : (
                    /* Default Mock Landing Fallback Data View Elements */
                    <>
                      <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left" style={{ background: "var(--marigold-dim)" }}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--marigold)" }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Possible mixed personal and business funds</p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>Worth a look when you get a chance</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left" style={{ background: "var(--clay-dim)" }}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--clay)" }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Possible duplicate payment</p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>We're quite sure – act on this now</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Inline Sandbox File Submission Interactor */}
                <div className="mt-5 pt-4 border-t border-dashed flex flex-col gap-2" style={{ borderColor: "var(--line)" }}>
                  <label className="text-xs font-bold uppercase tracking-wider text-left block" style={{ color: "var(--sage)" }}>
                    {reportData ? "Test another statement:" : "Test the engine with an M-Pesa Statement PDF:"}
                  </label>
                  <input 
                    type="file" 
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer w-full transition-all"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Feature Breakdown Section */}
        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            What it actually catches
          </p>
          <h2 className="font-display mt-2 max-w-2xl text-3xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            We started with one problem and made it genuinely good – not five problems done badly.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--sage)" }}>
            Mixed personal and business funds is the most common, least-watched risk in a growing
            Kenyan SME. Dohtective flags it with a confidence level, not a verdict – "worth a look"
            versus "act on this now" – so you know what actually needs your attention today.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Mixed funds", detail: "Personal spending flowing through the business account, flagged by confidence." },
              { title: "Duplicate payments", detail: "The same amount, same recipient, paid twice within days." },
              { title: "Cash flow risk", detail: "An honest days-of-buffer estimate, with early-warning thresholds." },
              { title: "Unreconciled entries", detail: "What's missing or unmatched, in plain language." },
            ].map((item) => (
              <div key={item.title} className="rounded-[var(--radius-lg)] border p-5 text-left" style={{ borderColor: "var(--line)", background: "white" }}>
                <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Chronological How it Works Section */}
        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            How it works
          </p>
          <h2 className="font-display mt-2 text-3xl font-bold" style={{ color: "var(--ink)" }}>
            One real connection. Optional documents. A plain-language answer.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { step: "01", title: "Connect Zoho Books", detail: "A real OAuth connection – Dohtective never sees your password, only what you approve sharing." },
              { step: "02", title: "Add documents, if you want", detail: "KRA PIN, bank statement, eTIMS receipts – optional, and each one sharpens detection in a specific way." },
              { step: "03", title: "Get a monthly answer", detail: "Plain language, a specific action plan, and a push to Google Sheets your accountant can act on." },
            ].map((item) => (
              <div key={item.step} className="text-left">
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--sage)" }}>{item.step}</span>
                <p className="font-display mt-1.5 text-lg font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust Metric Highlight */}
        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
                Built to be trusted, not just used
              </p>
              <h2 className="font-display mt-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
                Every flag says how sure we are – and what we still can't see.
              </h2>
              <p className="mt-4 text-sm leading-7" style={{ color: "var(--sage)" }}>
                Dohtective never tells you something is fraud. It tells you what's worth a look,
                and how confident it is – because a tool a founder can't trust is a tool nobody
                actually uses.
              </p>
            </div>
            <AvalancheTrustStrip />
          </div>
        </section>

        {/* Final CTA Strip */}
        <section className="border-t py-16 text-center sm:py-20" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl font-bold max-w-2xl mx-auto leading-tight" style={{ color: "var(--ink)" }}>
            Never surprise your investor with a problem this could have caught.
          </h2>
          <a
            href={isSignedIn ? "/businesses" : "/sign-up"}
            className="font-display mt-7 inline-block rounded-[var(--radius-md)] px-7 py-4 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
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