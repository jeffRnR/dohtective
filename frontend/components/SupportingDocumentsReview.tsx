import { type ReportData } from "../lib/types";
import { AlertTriangle, FileX, CheckCircle2 } from "lucide-react";

interface SupportingDocumentsReviewProps {
  review: ReportData["supporting_document_review"];
}

export default function SupportingDocumentsReview({
  review,
}: SupportingDocumentsReviewProps) {
  const totalMissing = review.missing_documents + review.invoice_documents_missing;
  const status = totalMissing === 0 ? "complete" : "incomplete";

  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {status === "incomplete" ? (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            )}
            Supporting Documents
          </h2>
          <p className="text-gray-900/60 text-sm mt-1">{review.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <p className="text-gray-900/60 text-xs uppercase font-semibold">Expected</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{review.expected_documents}</p>
        </div>
        <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
          <p className="text-red-300/80 text-xs uppercase font-semibold">Missing Expenses</p>
          <p className="text-2xl font-bold text-red-300 mt-2">{review.missing_documents}</p>
        </div>
        <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
          <p className="text-red-300/80 text-xs uppercase font-semibold">Missing Invoices</p>
          <p className="text-2xl font-bold text-red-300 mt-2">{review.invoice_documents_missing}</p>
        </div>
      </div>

      {totalMissing > 0 && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-300 text-sm flex items-center gap-2">
            <FileX className="w-4 h-4" />
            {totalMissing} document{totalMissing !== 1 ? "s" : ""} need to be collected and uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
