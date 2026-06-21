// app/frontend/components/PlainLanguageReport.tsx
import { type ReportData } from "../lib/types";

export default function PlainLanguageReport({ report }: { report: ReportData | null }) {
  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Monthly summary</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>
        In plain language — no accounting jargon.
      </p>

      <div className="mt-4 space-y-3">
        {report && report.plain_language.length > 0 ? (
          report.plain_language.map((sentence, i) => (
            <p key={i} className="flex gap-2.5 text-sm leading-6" style={{ color: "var(--ink)" }}>
              <span style={{ color: "var(--savanna)" }}>—</span>
              <span>{sentence}</span>
            </p>
          ))
        ) : (
          <p className="text-sm" style={{ color: "var(--sage)" }}>
            Connect your books to see a founder-friendly summary.
          </p>
        )}
      </div>
    </div>
  );
}
