import { type ReportData, type ReportTrend } from "../lib/types";
import CashBufferGauge from "./CashBufferGauge";

function TrendLine({ trend }: { trend: ReportTrend }) {
  if (!trend.available) {
    return (
      <p className="mt-3 text-xs italic" style={{ color: "var(--sage)" }}>
        {trend.reason}
      </p>
    );
  }

  const delta = trend.cashBufferDaysDelta;
  const improved = delta > 0;
  const worsened = delta < 0;
  const color = improved ? "var(--savanna)" : worsened ? "var(--clay)" : "var(--sage)";
  const arrow = improved ? "up" : worsened ? "down" : "flat";

  return (
    <div className="mt-3 flex items-center gap-2 text-xs font-semibold" style={{ color }}>
      <span>
        {arrow === "up" ? "+" : ""}
        {delta} days vs last month ({trend.priorCashBufferDays} -&gt; current)
      </span>
      {trend.mixedFundsCountDelta !== 0 ? (
        <span style={{ color: "var(--sage)" }}>
          - mixed funds flags {trend.mixedFundsCountDelta > 0 ? "up" : "down"} from {trend.priorMixedFundsCount}
        </span>
      ) : null}
    </div>
  );
}

export default function VerdictBand({ report, trend }: { report: ReportData | null; trend?: ReportTrend }) {
  return (
    <section className="rounded-[var(--radius-lg)] border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "white" }}>
      <CashBufferGauge days={report?.cash_buffer_days ?? null} />
      {trend ? <TrendLine trend={trend} /> : null}

      {report && report.plain_language.length > 0 ? (
        <div className="mt-5 space-y-2.5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          {report.plain_language.map((sentence, i) => (
            <p key={i} className="flex gap-2.5 text-sm leading-6" style={{ color: "var(--ink)" }}>
              <span style={{ color: "var(--savanna)" }}>-</span>
              <span>{sentence}</span>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}