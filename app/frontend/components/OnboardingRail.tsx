"use client";

type Props = {
  connected: boolean;
  loading: boolean;
  onConnect: () => void;
};

// PLACEHOLDER CONTENT — Section 1 of the build plan: this checklist has not
// been validated against a real bookkeeper or SME owner yet. Treat every
// line here as EDITABLE. Replace with the real prerequisites once a
// stakeholder conversation confirms what's actually needed before
// onboarding — do not let this silently become load-bearing truth.
const PREREQUISITES = [
  {
    title: "An active Zoho Books account",
    detail: "With at least 30 days of transaction history so patterns are visible.",
  },
  {
    title: "One person who owns the books",
    detail: "Whoever reconciles transactions today — founder, bookkeeper, or accountant.",
  },
  {
    title: "A sense of your normal month",
    detail: "Rough rent, payroll, and supplier numbers help you sanity-check the first report.",
  },
];

export default function OnboardingRail({ connected, loading, onConnect }: Props) {
  if (connected) {
    return (
      <div
        className="flex items-center justify-between rounded-[var(--radius-md)] border px-5 py-3"
        style={{ borderColor: "var(--line)", background: "var(--savanna-dim)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "var(--savanna)" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--savanna)" }}>
            Books connected — reviewing your transactions
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border p-6 sm:p-7" style={{ borderColor: "var(--line)", background: "white" }}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            Before you connect
          </p>
          <h2 className="font-display mt-1.5 text-2xl font-bold" style={{ color: "var(--ink)" }}>
            Why connect your books, and what you'll need
          </h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
            Dohtective reads your Zoho Books data to catch problems while they're still small —
            mixed personal spending, duplicate payments, a cash crunch before it bites. Nothing is
            shared, and nothing changes in your books. Here's what helps before you start:
          </p>
        </div>
        <button
          disabled={loading}
          onClick={onConnect}
          className="font-display shrink-0 rounded-[var(--radius-md)] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:cursor-not-allowed"
          style={{ background: loading ? "var(--sage)" : "var(--savanna)" }}
        >
          {loading ? "Connecting…" : "Connect Zoho Books"}
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {PREREQUISITES.map((item, i) => (
          <div
            key={item.title}
            className="rounded-[var(--radius-md)] border p-4"
            style={{ borderColor: "var(--line)", background: "var(--bone)" }}
          >
            <span className="font-mono text-xs font-semibold" style={{ color: "var(--sage)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: "var(--ink)" }}>{item.title}</p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--sage)" }}>{item.detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] italic" style={{ color: "var(--sage)" }}>
        Placeholder checklist — to be confirmed with a real bookkeeper or SME owner before launch.
      </p>
    </div>
  );
}
