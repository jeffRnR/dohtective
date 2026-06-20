import { type ReportData } from "../lib/types";

export default function HeaderCard({ report }: { report: ReportData | null }) {
  const statusClass = () => {
    if (!report) return "bg-slate-100 text-slate-800";
    if (report.cash_buffer_days < 10) return "bg-red-100 text-red-700";
    if (report.cash_buffer_days < 20) return "bg-amber-100 text-amber-700";
    return "bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Cash buffer</p>
        <p className="mt-3 text-3xl font-semibold text-slate-950">
          {report ? `${report.cash_buffer_days} days` : "—"}
        </p>
        <p className="mt-2 text-sm text-slate-600">Early-warning liquidity score</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Alerts</p>
        <p className="mt-3 text-3xl font-semibold text-slate-950">{report ? report.flags.length : "—"}</p>
        <p className="mt-2 text-sm text-slate-600">Risk flags this month</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Mixed funds</p>
        <p className="mt-3 text-3xl font-semibold text-slate-950">{report ? report.mixed_funds_count : "—"}</p>
        <p className="mt-2 text-sm text-slate-600">Suspected personal/business mix</p>
      </div>
      <div className={`rounded-3xl border border-slate-200 p-5 ${statusClass()}`}>
        <p className="text-sm uppercase tracking-[0.24em]">Liquidity status</p>
        <p className="mt-3 text-3xl font-semibold text-slate-950">{report ? (report.cash_buffer_days < 15 ? "Warning" : "Healthy") : "—"}</p>
        <p className="mt-2 text-sm">Cash runway for the next 30 days</p>
      </div>
    </div>
  );
}
