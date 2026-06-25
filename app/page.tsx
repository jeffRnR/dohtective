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

  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    setSandboxError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("document_kind", "mpesa");

    try {
      // Routes through Next.js API to avoid CORS and hardcoded ports.
      // The actual service URL lives in DETECTION_SERVICE_URL env var.
      const response = await fetch("/api/analyze/standalone-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          errBody.detail ?? errBody.error ?? errBody.message
            ?? `Service returned ${response.status} — check that the Python service is running and this PDF is an M-Pesa statement.`
        );
      }

      const data = await response.json();
      setReportData(data.report);
      sessionStorage.setItem("latest_mpesa_report", JSON.stringify(data.report));
    } catch (error) {
      console.error("Sandbox parsing error:", error);
      setSandboxError(
        error instanceof Error
          ? error.message
          : "Couldn't reach the analysis engine. Make sure the Python service is running."
      );
    } finally {
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

        {/* Hero */}
        <section className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
              For growing Kenyan businesses
            </p>
            <h1 className="font-display mt-3 text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl" style={{ color: "var(--ink)" }}>
              Know what's wrong with your books before your accountant does.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 sm:text-lg" style={{ color: "var(--sage)" }}>
              Most financial problems don't appear overnight. They quietly build up in your
              transactions for weeks before anyone notices. Dohtective reads your books every
              month and tells you what needs attention — in plain language, not accountant-speak.
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
              Built for real Kenyan SME books — the kind with M-Pesa exports, mixed accounts, and an accountant who comes once a month.
            </p>
          </div>

          {/* Sandbox */}
          <div className="rounded-[var(--radius-lg)] border p-6 shadow-sm" style={{ borderColor: "var(--line)", background: "white" }}>
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--sage)" }}>
                {reportData ? "Your results" : "Try it now — no sign-up"}
              </p>
              {reportData && (
                <button
                  onClick={clearSandboxCache}
                  className="text-xs font-semibold underline hover:text-[var(--clay)] transition"
                  style={{ color: "var(--sage)" }}
                >
                  Clear
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-center">
                <p className="font-display text-4xl font-bold tracking-tight" style={{ color: "var(--savanna)" }}>
                  Reading...
                </p>
                <p className="text-xs mt-2 max-w-xs mx-auto leading-relaxed" style={{ color: "var(--sage)" }}>
                  Going through your transactions. This takes a few seconds.
                </p>
              </div>
            ) : (
              <>
                <p className="font-display mt-1 text-5xl font-bold" style={{ color: "var(--savanna)" }}>
                  {reportData
                    ? (reportData.cash_buffer?.buffer_days === 9999 ? "∞" : reportData.cash_buffer?.buffer_days ?? "0")
                    : "23"}
                  <span className="text-2xl font-sans font-normal text-slate-500"> days of runway</span>
                </p>

                {sandboxError && (
                  <div
                    className="mt-4 rounded-[var(--radius-md)] border p-3.5 text-xs font-medium"
                    style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
                  >
                    {sandboxError}
                  </div>
                )}

                <div className="mt-5 space-y-2.5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
                  {reportData ? (
                    reportData.flags && reportData.flags.length > 0 ? (
                      reportData.flags.map((flag: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left"
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
                        Nothing flagged — looks clean.
                      </p>
                    )
                  ) : (
                    <>
                      <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left" style={{ background: "var(--marigold-dim)" }}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--marigold)" }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Personal spending mixed with business</p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>Worth a look — might just be an owner draw</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left" style={{ background: "var(--clay-dim)" }}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--clay)" }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Payment sent twice to the same recipient</p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>Same amount, 3 days apart — probably a duplicate</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-dashed flex flex-col gap-2" style={{ borderColor: "var(--line)" }}>
                  <label className="text-xs font-bold uppercase tracking-wider text-left block" style={{ color: "var(--sage)" }}>
                    {reportData ? "Try another statement:" : "Drop an M-Pesa PDF to see what we find:"}
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer w-full"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* What it catches */}
        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            What it looks for
          </p>
          <h2 className="font-display mt-2 max-w-2xl text-3xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            We focused on the four things that actually hurt Kenyan SMEs.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--sage)" }}>
            Not a generic checklist — these are the patterns that consistently show up in businesses
            that hit a financial wall they didn't see coming.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Mixed funds", detail: "Personal money flowing through the business account. Common, quiet, and easy to miss until tax season." },
              { title: "Duplicate payments", detail: "Same supplier, same amount, paid twice. Happens more than anyone admits." },
              { title: "Cash runway", detail: "How many days of spending you can cover without new income coming in. Updated every month." },
              { title: "Unreconciled entries", detail: "What's in your books but not your bank, or the other way around. In plain language." },
            ].map((item) => (
              <div key={item.title} className="rounded-[var(--radius-lg)] border p-5 text-left" style={{ borderColor: "var(--line)", background: "white" }}>
                <p className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            How it works
          </p>
          <h2 className="font-display mt-2 text-3xl font-bold" style={{ color: "var(--ink)" }}>
            Connect once. Get a clear picture every month.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Connect your books",
                detail: "Link Zoho Books via OAuth — we never see your password. Or just upload a CSV or bank PDF if you're not on Zoho yet.",
              },
              {
                step: "02",
                title: "Add documents if you have them",
                detail: "KRA PIN, bank statements, eTIMS receipts — optional. Each one helps us give you a sharper picture.",
              },
              {
                step: "03",
                title: "Get your monthly read",
                detail: "Plain language, a prioritised action list, and a push to Google Sheets your accountant can work from directly.",
              },
            ].map((item) => (
              <div key={item.step} className="text-left">
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--sage)" }}>{item.step}</span>
                <p className="font-display mt-1.5 text-lg font-bold" style={{ color: "var(--ink)" }}>{item.title}</p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section className="border-t py-16 sm:py-20" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
                Honest by design
              </p>
              <h2 className="font-display mt-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
                We tell you how sure we are — and what we can't see.
              </h2>
              <p className="mt-4 text-sm leading-7" style={{ color: "var(--sage)" }}>
                Dohtective doesn't tell you something is fraud. It tells you something is worth
                a look, and how confident it is. Every flag comes with a confidence level so
                you know the difference between "probably fine" and "check this today."
                A tool that cries wolf stops getting used. We'd rather be honest.
              </p>
            </div>
            <AvalancheTrustStrip />
          </div>
        </section>

        {/* CTA */}
        <section className="border-t py-16 text-center sm:py-20" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl font-bold max-w-2xl mx-auto leading-tight" style={{ color: "var(--ink)" }}>
            Your next investor meeting shouldn't be the first time you hear about a problem.
          </h2>
          <a
            href={isSignedIn ? "/businesses" : "/sign-up"}
            className="font-display mt-7 inline-block rounded-[var(--radius-md)] px-7 py-4 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
            style={{ background: "var(--savanna)" }}
          >
            {isSignedIn ? "Go to my businesses" : "Get started free"} &rarr;
          </a>
          <p className="mt-4 text-xs" style={{ color: "var(--sage)" }}>
            No credit card. No setup fee. Cancel whenever.
          </p>
        </section>

      </main>

      <LandingFooter />
    </div>
  );
}