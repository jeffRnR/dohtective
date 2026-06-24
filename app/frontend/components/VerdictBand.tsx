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
  const color = improved
    ? "var(--savanna)"
    : worsened
    ? "var(--clay)"
    : "var(--sage)";

  return (
    <div
      className="mt-3 flex items-center gap-2 text-xs font-semibold flex-wrap"
      style={{ color }}
    >
      <span>
        {delta > 0 ? "+" : ""}
        {delta} days vs last month ({trend.priorCashBufferDays} → current)
      </span>
      {trend.mixedFundsCountDelta !== 0 && (
        <span style={{ color: "var(--sage)" }}>
          · mixed funds flags{" "}
          {trend.mixedFundsCountDelta > 0 ? "up" : "down"} from{" "}
          {trend.priorMixedFundsCount}
        </span>
      )}
    </div>
  );
}

export default function VerdictBand({
  report,
  trend,
}: {
  report: ReportData | null;
  trend?: ReportTrend;
}) {
  // buffer_days can be null when the engine cannot compute it honestly
  // (unclassified transactions, no dates, etc.)
  const bufferDays = (report as any)?.cash_buffer_days ?? null;
  const cannotCompute =
    (report as any)?.data_quality?.flags?.used_fallback_starting_balance === true &&
    bufferDays === null ||
    bufferDays === null;
  const limitationNote =
    (report as any)?.data_quality?.limitation_notes?.cash_buffer ??
    undefined;

  return (
    <section
      className="rounded-[var(--radius-lg)] border p-6 sm:p-8"
      style={{ borderColor: "var(--line)", background: "white" }}
    >
      <CashBufferGauge
        days={bufferDays}
        limitationNote={limitationNote}
        cannotCompute={cannotCompute}
      />
      {trend && <TrendLine trend={trend} />}

      {report && report.plain_language.length > 0 && (
        <div
          className="mt-5 space-y-2.5 border-t pt-5"
          style={{ borderColor: "var(--line)" }}
        >
          {report.plain_language.map((sentence, i) => (
            <p
              key={i}
              className="flex gap-2.5 text-sm leading-6"
              style={{ color: "var(--ink)" }}
            >
              <span style={{ color: "var(--savanna)" }}>—</span>
              <span>{sentence}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}