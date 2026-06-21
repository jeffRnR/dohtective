"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { type ReportData } from "../../../frontend/lib/types";
import MissingInformationChecklist from "../../../frontend/components/MissingInformationChecklist";
import AnomalyExplorer from "./AnomalyExplorer";
import SupportingDocumentsReview from "./SupportingDocumentsReview";

export default function EvidencePanel({ report }: { report: ReportData }) {
  const [open, setOpen] = useState(false);

  const anomalyCount = report.anomaly_transactions.length;
  const missingDocs = report.supporting_document_review.missing_documents + report.supporting_document_review.invoice_documents_missing;

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
          Dig into the evidence
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs" style={{ color: "var(--sage)" }}>
          <span>
            {anomalyCount} transaction{anomalyCount === 1 ? "" : "s"}
            {missingDocs > 0 ? ` - ${missingDocs} document${missingDocs === 1 ? "" : "s"} missing` : ""}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>

      {open ? (
        <div className="mt-5 space-y-5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          <AnomalyExplorer anomalies={report.anomaly_transactions} />
          <SupportingDocumentsReview review={report.supporting_document_review} />
          <MissingInformationChecklist report={report} />
        </div>
      ) : null}
    </div>
  );
}
