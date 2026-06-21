import { type ReportData } from "../lib/types";
import CashBufferGauge from "./CashBufferGauge";

export default function VerdictBand({ report }: { report: ReportData | null }) {
  return (
    <section className="rounded-[var(--radius-lg)] border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "white" }}>
      <CashBufferGauge days={report?.cash_buffer_days ?? null} />

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
