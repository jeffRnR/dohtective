// app/business/[slug]/components/SupportingDocumentsReview.tsx
import type { ReportData } from "../../../frontend/lib/types";

export default function SupportingDocumentsReview({ review }: { review: ReportData["supporting_document_review"] }) {
  const totalMissing = review.missing_documents + review.invoice_documents_missing;
  const isComplete = totalMissing === 0;

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Supporting documents</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>{review.summary}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{
            background: isComplete ? "var(--savanna-dim)" : "var(--marigold-dim)",
            color: isComplete ? "var(--savanna)" : "var(--marigold)",
          }}
        >
          {isComplete ? "Complete" : "Incomplete"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Expected" value={review.expected_documents} color="var(--ink)" />
        <Stat label="Missing expenses" value={review.missing_documents} color="var(--clay)" />
        <Stat label="Missing invoices" value={review.invoice_documents_missing} color="var(--clay)" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--line)", background: "var(--bone)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--sage)" }}>{label}</p>
      <p className="font-display mt-1 text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}