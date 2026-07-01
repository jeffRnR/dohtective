// app/business/[slug]/components/EvidencePanel.tsx
"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type ReportData, type FlagResponseMap } from "../../../frontend/lib/types";
import MissingInformationChecklist from "../../../frontend/components/MissingInformationChecklist";
import AnomalyExplorer from "./AnomalyExplorer";
import SupportingDocumentsReview from "./SupportingDocumentsReview";

// ── Public handle — imported by FlagFeed (via page.tsx) ───────────────────
export interface EvidencePanelHandle {
  openToFlag: (flagTitle: string) => void;
}

interface EvidencePanelProps {
  report: ReportData;
  slug: string;
  flagResponses: FlagResponseMap;
}

const EvidencePanel = forwardRef<EvidencePanelHandle, EvidencePanelProps>(
  function EvidencePanel({ report, slug, flagResponses }, ref) {
    const [open, setOpen] = useState(false);
    const [highlightedFlag, setHighlightedFlag] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Called by FlagFeed when the user clicks "Review transactions →"
    useImperativeHandle(ref, () => ({
      openToFlag(flagTitle: string) {
        // 1. Expand the panel
        setOpen(true);
        // 2. Mark which flag section to highlight and auto-open
        setHighlightedFlag(flagTitle);
        // 3. Scroll the panel into view after the next paint so the DOM
        //    is fully expanded before we measure position
        requestAnimationFrame(() => {
          // Try to scroll directly to the flag's section first
          const sectionId = `flag-section-${flagTitle
            .replace(/\s+/g, "-")
            .toLowerCase()}`;
          const section = document.getElementById(sectionId);
          if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            // Fall back to the panel itself
            panelRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        });
      },
    }));

    const anomalyCount = report.anomaly_transactions.length;
    const missingDocs =
      report.supporting_document_review.missing_documents +
      report.supporting_document_review.invoice_documents_missing;

    return (
      <div
        ref={panelRef}
        className="rounded-[var(--radius-lg)] border p-6"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span
            className="font-display text-lg font-bold"
            style={{ color: "var(--ink)" }}
          >
            Dig into the evidence
          </span>
          <span
            className="flex shrink-0 items-center gap-3 text-xs"
            style={{ color: "var(--sage)" }}
          >
            <span>
              {anomalyCount} transaction{anomalyCount === 1 ? "" : "s"}
              {missingDocs > 0
                ? ` · ${missingDocs} document${missingDocs === 1 ? "" : "s"} missing`
                : ""}
            </span>
            <ChevronDown
              className="h-4 w-4 transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          </span>
        </button>

        {open && (
          <div
            className="mt-5 space-y-5 border-t pt-5"
            style={{ borderColor: "var(--line)" }}
          >
            <AnomalyExplorer
              anomalies={report.anomaly_transactions}
              slug={slug}
              flagResponses={flagResponses}
              highlightedFlag={highlightedFlag}
            />
            <SupportingDocumentsReview
              review={report.supporting_document_review}
            />
            <MissingInformationChecklist report={report} />
          </div>
        )}
      </div>
    );
  }
);

export default EvidencePanel;