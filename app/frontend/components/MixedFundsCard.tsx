import { type ReportData } from "../lib/types";

export default function MixedFundsCard({ report }: { report: ReportData | null }) {
  const mixedFlag = report?.flags.find((f) => f.title === "Mixed personal and business funds detected");

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
        Mixed funds
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>
        Personal spending mixed into the business account.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--line)", background: "var(--bone)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "var(--sage)" }}>
            Transactions
          </p>
          <p className="font-display mt-2 text-3xl font-bold" style={{ color: "var(--ink)" }}>
            {report ? report.mixed_funds_count : "—"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--sage)" }}>
            Flagged as personal/business mix
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--line)", background: "var(--bone)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "var(--sage)" }}>
            Amount
          </p>
          <p className="font-display mt-2 text-3xl font-bold" style={{ color: "var(--ink)" }}>
            {report ? `KES ${report.mixed_funds_total.toLocaleString()}` : "—"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--sage)" }}>
            Amount needing review
          </p>
        </div>
      </div>

      {mixedFlag?.confidenceLabel ? (
        <div className="mt-3 rounded-[var(--radius-md)] border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--marigold-dim)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "var(--marigold)" }}>
            How sure are we
          </p>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--ink)" }}>
            {mixedFlag.confidenceLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}