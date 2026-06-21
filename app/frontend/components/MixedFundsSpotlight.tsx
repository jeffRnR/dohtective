import { ArrowLeftRight } from "lucide-react";
import { type ReportData } from "../lib/types";

export default function MixedFundsSpotlight({ report }: { report: ReportData | null }) {
  if (!report || report.mixed_funds_count === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] px-5 py-3.5" style={{ background: "var(--marigold-dim)" }}>
      <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--marigold)" }} aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--marigold)" }}>
          Mixed personal and business funds
        </p>
        <p className="mt-0.5 text-sm" style={{ color: "var(--sage)" }}>
          {report.mixed_funds_count} payment{report.mixed_funds_count === 1 ? "" : "s"}, KES{" "}
          {report.mixed_funds_total.toLocaleString()} — worth asking your bookkeeper about.
        </p>
      </div>
    </div>
  );
}