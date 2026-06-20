import { type ReportData } from "../lib/types";

export default function MixedFundsCard({ report }: { report: ReportData | null }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">Mixed funds</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-amber-50 p-5">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Transactions</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{report ? report.mixed_funds_count : "—"}</p>
          <p className="mt-2 text-sm text-slate-600">Flagged as personal/business mix</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-amber-50 p-5">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Amount</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{report ? `KES ${report.mixed_funds_total.toLocaleString()}` : "—"}</p>
          <p className="mt-2 text-sm text-slate-600">Amount needing review</p>
        </div>
      </div>
    </div>
  );
}
