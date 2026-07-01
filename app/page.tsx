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

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    setSandboxError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("document_kind", "mpesa");

    try {
      const response = await fetch("/api/analyze/standalone-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          errBody.detail ??
            errBody.error ??
            errBody.message ??
            `Service returned ${response.status}.`
        );
      }

      const data = await response.json();
      setReportData(data.report);
      sessionStorage.setItem(
        "latest_mpesa_report",
        JSON.stringify(data.report)
      );
    } catch (error) {
      setSandboxError(
        error instanceof Error
          ? error.message
          : "Could not reach the analysis engine."
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

  // Severity colour for sandbox flags
  const flagBg = (severity: string) =>
    severity === "high" ? "var(--clay-dim)" : "var(--marigold-dim)";
  const flagDot = (severity: string) =>
    severity === "high" ? "var(--clay)" : "var(--marigold)";

  const bufferDays =
    reportData?.cash_buffer_days !== null &&
    reportData?.cash_buffer_days !== undefined
      ? reportData.cash_buffer_days
      : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <LandingNav isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-6xl px-5 sm:px-8">

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--savanna)" }}
            >
              AI Financial Controller for Kenyan SMEs
            </p>
            <h1
              className="font-display mt-3 text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl"
              style={{ color: "var(--ink)" }}
            >
              Know what's wrong with your books before real damage is done.
            </h1>
            <p
              className="mt-5 max-w-xl text-base leading-7 sm:text-lg"
              style={{ color: "var(--sage)" }}
            >
              Dohtective automatically reviews your finances every month,
              flags problems before they become crises, and gives you a
              structured action plan in plain language, not accountant-speak.
              Connect Zoho Books or upload your M-Pesa and bank statements.
              That's it.
            </p>

            {/* Trust signals */}
            <div
              className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold"
              style={{ color: "var(--sage)" }}
            >
              {[
                "Connects to Zoho Books",
                "Reads M-Pesa & bank statements",
                "Report anchored on Avalanche",
                "Plain-language output",
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--savanna)" }}
                  />
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={isSignedIn ? "/businesses" : "/sign-up"}
                className="font-display rounded-[var(--radius-md)] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                {isSignedIn ? "Go to my businesses" : "Start for free"}
              </a>
              <a
                href="/pricing"
                className="font-display rounded-[var(--radius-md)] border px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] transition hover:opacity-80"
                style={{
                  borderColor: "var(--line)",
                  color: "var(--ink)",
                  background: "white",
                }}
              >
                See pricing
              </a>
            </div>
            {/* <p className="mt-4 text-xs" style={{ color: "var(--sage)" }}>
              No credit card. Works with your existing Zoho Books setup or
              just a PDF.
            </p> */}
          </div>

          {/* Sandbox */}
          <div
            className="rounded-[var(--radius-lg)] border shadow-sm"
            style={{ borderColor: "var(--line)", background: "white" }}
          >
            {/* Sandbox header */}
            <div
              className="flex items-center justify-between px-6 pt-5 pb-4 border-b"
              style={{ borderColor: "var(--line)" }}
            >
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-[0.14em]"
                  style={{ color: "var(--sage)" }}
                >
                  {reportData ? "Your results" : "Try it — no sign-up needed"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>
                  {reportData
                    ? "Real analysis from your file"
                    : "Upload an M-Pesa PDF and see what we find"}
                </p>
              </div>
              {reportData && (
                <button
                  onClick={clearSandboxCache}
                  className="text-xs font-semibold underline underline-offset-2 transition hover:opacity-70"
                  style={{ color: "var(--sage)" }}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="px-6 py-5">
              {loading ? (
                <div className="py-10 text-center">
                  <p
                    className="font-display text-3xl font-bold"
                    style={{ color: "var(--savanna)" }}
                  >
                    Reading your file...
                  </p>
                  <p
                    className="mt-2 text-xs leading-6 max-w-xs mx-auto"
                    style={{ color: "var(--sage)" }}
                  >
                    We're going through your transactions now. This usually
                    takes under 10 seconds.
                  </p>
                </div>
              ) : (
                <>
                  {/* Cash buffer display */}
                  <div className="flex items-end gap-3">
                    <p
                      className="font-display text-5xl font-bold tabular-nums"
                      style={{ color: "var(--savanna)" }}
                    >
                      {bufferDays === null
                        ? "?"
                        : bufferDays >= 365
                        ? "365+"
                        : bufferDays}
                    </p>
                    <div className="pb-1.5">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--ink)" }}
                      >
                        days of cash runway
                      </p>
                      <p className="text-xs" style={{ color: "var(--sage)" }}>
                        {reportData
                          ? bufferDays === null
                            ? "Could not estimate — see report for details"
                            : bufferDays < 14
                            ? "Needs attention now"
                            : bufferDays < 30
                            ? "Worth watching this month"
                            : "Looking healthy"
                          : "Example — connect your books for the real number"}
                      </p>
                    </div>
                  </div>

                  {sandboxError && (
                    <div
                      className="mt-4 rounded-[var(--radius-md)] border p-3.5 text-xs font-medium"
                      style={{
                        borderColor: "var(--clay)",
                        background: "var(--clay-dim)",
                        color: "var(--clay)",
                      }}
                    >
                      {sandboxError}
                    </div>
                  )}

                  {/* Flags */}
                  <div
                    className="mt-5 space-y-2 border-t pt-4"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <p
                      className="text-xs font-bold uppercase tracking-[0.1em] mb-3"
                      style={{ color: "var(--sage)" }}
                    >
                      {reportData ? "Flags from your file" : "Example flags"}
                    </p>

                    {reportData ? (
                      reportData.flags && reportData.flags.length > 0 ? (
                        reportData.flags.slice(0, 3).map(
                          (flag: any, index: number) => (
                            <div
                              key={index}
                              className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left"
                              style={{
                                background: flagBg(flag.severity),
                              }}
                            >
                              <span
                                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                style={{ background: flagDot(flag.severity) }}
                              />
                              <div>
                                <p
                                  className="text-sm font-semibold"
                                  style={{ color: "var(--ink)" }}
                                >
                                  {flag.title}
                                </p>
                                <p
                                  className="mt-0.5 text-xs leading-5"
                                  style={{ color: "var(--sage)" }}
                                >
                                  {flag.detail}
                                </p>
                              </div>
                            </div>
                          )
                        )
                      ) : (
                        <p
                          className="text-sm py-4 text-center italic"
                          style={{ color: "var(--sage)" }}
                        >
                          Nothing flagged — your books look clean this period.
                        </p>
                      )
                    ) : (
                      <>
                        <div
                          className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left"
                          style={{ background: "var(--marigold-dim)" }}
                        >
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: "var(--marigold)" }}
                          />
                          <div>
                            <p
                              className="text-sm font-semibold"
                              style={{ color: "var(--ink)" }}
                            >
                              Personal spending mixed with business
                            </p>
                            <p
                              className="mt-0.5 text-xs"
                              style={{ color: "var(--sage)" }}
                            >
                              Worth a look — might just be an owner draw
                            </p>
                          </div>
                        </div>
                        <div
                          className="flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left"
                          style={{ background: "var(--clay-dim)" }}
                        >
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: "var(--clay)" }}
                          />
                          <div>
                            <p
                              className="text-sm font-semibold"
                              style={{ color: "var(--ink)" }}
                            >
                              Possible duplicate payment — KES 89,500
                            </p>
                            <p
                              className="mt-0.5 text-xs"
                              style={{ color: "var(--sage)" }}
                            >
                              Same supplier, same amount, 3 days apart
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Upload */}
                  <div
                    className="mt-5 pt-4 border-t border-dashed"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <label
                      className="cursor-pointer block"
                      style={{ color: "var(--sage)" }}
                    >
                      <span
                        className="inline-block font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-4 py-2 rounded-[var(--radius-md)] transition hover:opacity-90"
                        style={{ background: "var(--ink)" }}
                      >
                        {reportData
                          ? "Try another file"
                          : "Upload M-Pesa PDF"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.csv,.xlsx"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="mt-2 text-xs" style={{ color: "var(--sage)" }}>
                      M-Pesa PDF, bank statement, or CSV — no account needed
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── The problem ───────────────────────────────────────────── */}
        <section
          className="border-t py-16 sm:py-20"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="max-w-2xl">
            <p
              className="text-xs font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--savanna)" }}
            >
              The problem
            </p>
            <h2
              className="font-display mt-2 text-3xl font-bold leading-tight"
              style={{ color: "var(--ink)" }}
            >
              Most financial problems don't announce themselves.
            </h2>
            <p
              className="mt-4 text-base leading-7"
              style={{ color: "var(--sage)" }}
            >
              They build quietly in your transactions for weeks. Mixed funds
              here, a duplicate payment there, a cash runway that's tighter
              than you think. Your accountant comes once a month. Your
              investor asks questions quarterly. The problem has been there
              the whole time, you just didn't have a system looking for it.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Mixed funds",
                detail:
                  "Personal money flowing through the business account. Common, quiet, and expensive to fix at tax time.",
                color: "var(--clay)",
              },
              {
                title: "Duplicate payments",
                detail:
                  "Same supplier, same amount, paid twice within days. Happens in every business. Almost never caught early.",
                color: "var(--marigold)",
              },
              {
                title: "Cash runway",
                detail:
                  "How many days you can cover expenses without new income. The number most founders don't know until it's urgent.",
                color: "var(--clay)",
              },
              {
                title: "Unreconciled entries",
                detail:
                  "What's recorded in your books but missing from your bank, or the other way around. In plain language.",
                color: "var(--marigold)",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[var(--radius-lg)] border p-5 text-left"
                style={{ borderColor: "var(--line)", background: "white" }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full mb-3"
                  style={{ background: item.color }}
                />
                <p
                  className="font-display text-base font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {item.title}
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "var(--sage)" }}
                >
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────── */}
        <section
          id="how-it-works"
          className="border-t py-16 sm:py-20"
          style={{ borderColor: "var(--line)" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            How it works
          </p>
          <h2
            className="font-display mt-2 text-3xl font-bold"
            style={{ color: "var(--ink)" }}
          >
            Automatic monthly review. No new habits required.
          </h2>
          <p
            className="mt-3 max-w-xl text-base leading-7"
            style={{ color: "var(--sage)" }}
          >
            Two ways to get your data in. One structured risk report out.
            A follow-up workflow your accountant can act on directly.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                step: "01",
                title: "Connect your data source",
                detail:
                  "Link Zoho Books via OAuth for automatic syncing, we never see your password. Or upload M-Pesa statements, bank exports, or Excel files directly. Both paths produce identical analysis.",
              },
              {
                step: "02",
                title: "Add supporting documents",
                detail:
                  "Bank statements, mpesa statements, financial Excel records, optional but each one sharpens the picture. Dohtective reads them alongside your transaction data.",
              },
              {
                step: "03",
                title: "Get your monthly risk report",
                detail:
                  "Plain-language flags, a cash runway estimate, a prioritised action list, and a push to Google Sheets your accountant can work from directly.",
              },
            ].map((item) => (
              <div key={item.step} className="text-left">
                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: "var(--sage)" }}
                >
                  {item.step}
                </span>
                <p
                  className="font-display mt-1.5 text-lg font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {item.title}
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "var(--sage)" }}
                >
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Financial credential (new section) ───────────────────── */}
        <section
          className="border-t py-16 sm:py-20"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--savanna)" }}
              >
                More than a report
              </p>
              <h2
                className="font-display mt-2 text-3xl font-bold leading-tight"
                style={{ color: "var(--ink)" }}
              >
                Your Dohtective report is a verified financial credential.
              </h2>
              <p
                className="mt-4 text-base leading-7"
                style={{ color: "var(--sage)" }}
              >
                Every report is cryptographically anchored on Avalanche the
                moment it's generated. The blockchain timestamp proves it was
                created before your loan application, not for it. The hash
                proves it hasn't been altered. A bank, lender, or investor
                can verify it themselves, they don't need to trust us.
              </p>
              <p
                className="mt-3 text-base leading-7"
                style={{ color: "var(--sage)" }}
              >
                A formal audit costs KES 80,000–150,000 and takes 6 weeks.
                Your anchored Dohtective report costs a fraction of that and
                is ready the same day.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Download a verification certificate to hand to a bank officer",
                  "Share a verification link via WhatsApp or email",
                  "Every report hash is permanently recorded on-chain",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
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
            </div>

            <div className="space-y-4">
              {/* Credential preview card */}
              <div
                className="rounded-[var(--radius-lg)] border p-6"
                style={{ borderColor: "var(--line)", background: "white" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-xs font-bold uppercase tracking-[0.1em]"
                      style={{ color: "var(--savanna)" }}
                    >
                      Financial Health Report
                    </p>
                    <p
                      className="font-display mt-1 text-base font-bold"
                      style={{ color: "var(--ink)" }}
                    >
                      GearNova Electronics
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>
                      June 2026 {"\u00B7"} Verified on Avalanche
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
                    style={{
                      background: "var(--savanna-dim)",
                      color: "var(--savanna)",
                    }}
                  >
                    Anchored
                  </span>
                </div>
                <div
                  className="mt-4 pt-4 border-t space-y-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--sage)" }}>Cash runway</span>
                    <span
                      className="font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      34 days
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--sage)" }}>Flags raised</span>
                    <span
                      className="font-semibold"
                      style={{ color: "var(--clay)" }}
                    >
                      3 (1 high priority)
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--sage)" }}>
                      On-chain hash
                    </span>
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: "var(--sage)" }}
                    >
                      0x4a2f...9c8e
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    className="flex-1 font-display text-xs font-bold uppercase tracking-[0.06em] text-white py-2 rounded-[var(--radius-md)] transition hover:opacity-90"
                    style={{ background: "var(--ink)" }}
                    onClick={() => {}}
                  >
                    Download certificate
                  </button>
                  <button
                    className="font-display text-xs font-bold uppercase tracking-[0.06em] py-2 px-3 rounded-[var(--radius-md)] border transition hover:opacity-80"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--ink)",
                      background: "white",
                    }}
                    onClick={() => {}}
                  >
                    Share link
                  </button>
                </div>
              </div>

              <p className="text-xs text-center" style={{ color: "var(--sage)" }}>
                Example only — your real report generates automatically after
                connecting your data.
              </p>
            </div>
          </div>
        </section>

        {/* ── Who it's for ──────────────────────────────────────────── */}
        <section
          className="border-t py-16 sm:py-20"
          style={{ borderColor: "var(--line)" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            Built for
          </p>
          <h2
            className="font-display mt-2 text-3xl font-bold"
            style={{ color: "var(--ink)" }}
          >
            The business that's past survival but not yet at scale.
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[
              {
                title: "You're doing KES 400k+ a month",
                detail:
                  "Enough transactions that things get missed. Not enough to afford a full-time finance person. This is exactly the gap Dohtective fills.",
              },
              {
                title: "Your accountant comes monthly",
                detail:
                  "They're good at what they do. But by the time they arrive, the problem is three weeks old. Dohtective catches it when it happens.",
              },
              {
                title: "You're on Zoho Books or have statements",
                detail:
                  "Connect Zoho Books for automatic syncing, or upload your M-Pesa and bank statements directly. No migration, no new software to learn.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[var(--radius-lg)] border p-6"
                style={{ borderColor: "var(--line)", background: "white" }}
              >
                <p
                  className="font-display text-base font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {item.title}
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "var(--sage)" }}
                >
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust ─────────────────────────────────────────────────── */}
        <section
          className="border-t py-16 sm:py-20"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--savanna)" }}
              >
                Honest by design
              </p>
              <h2
                className="font-display mt-2 text-2xl font-bold"
                style={{ color: "var(--ink)" }}
              >
                We tell you what we found, how sure we are, and what we
                couldn't see.
              </h2>
              <p
                className="mt-4 text-sm leading-7"
                style={{ color: "var(--sage)" }}
              >
                Dohtective doesn't say "fraud detected." It says "this
                transaction is worth a look, and here's why." Every flag has
                a confidence level. Every report tells you what data it was
                built on and what it couldn't reach. A tool that cries wolf
                gets ignored. We'd rather be accurate and honest.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Confidence level on every flag — high, medium, or low",
                  "Plain-language explanation of what triggered each flag",
                  "Data quality report before every analysis — you know what we had to work with",
                  "Structured follow-up workflow for your accountant",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
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
            </div>
            <AvalancheTrustStrip />
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────── */}
        <section
          className="border-t py-16 sm:py-20"
          style={{ borderColor: "var(--line)" }}
        >
          <div
            className="rounded-[var(--radius-lg)] border p-8 sm:p-12 text-center"
            style={{ borderColor: "var(--savanna)", background: "var(--savanna-dim)" }}
          >
            <p
              className="text-xs font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--savanna)" }}
            >
              Get started today
            </p>
            <h2
              className="font-display mt-2 text-3xl font-bold max-w-2xl mx-auto leading-tight"
              style={{ color: "var(--ink)" }}
            >
              Your next investor meeting shouldn't be the first time you
              hear about a problem.
            </h2>
            <p
              className="mt-4 max-w-lg mx-auto text-sm leading-6"
              style={{ color: "var(--sage)" }}
            >
              Connect your books or upload a statement today. Dohtective
              runs the analysis and gives you a structured report with a
              follow-up workflow — ready to share with your accountant or
              hand to a lender.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={isSignedIn ? "/businesses" : "/sign-up"}
                className="font-display w-full sm:w-auto rounded-[var(--radius-md)] px-8 py-4 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                {isSignedIn ? "Go to my businesses" : "Start for free"}
              </a>
              <a
                href="/pricing"
                className="font-display w-full sm:w-auto rounded-[var(--radius-md)] border px-8 py-4 text-sm font-bold uppercase tracking-[0.06em] transition hover:opacity-80"
                style={{
                  borderColor: "var(--savanna)",
                  color: "var(--ink)",
                  background: "white",
                }}
              >
                See pricing
              </a>
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--sage)" }}>
              No credit card. Works with Zoho Books, M-Pesa PDFs, bank
              statements, and Excel exports.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}