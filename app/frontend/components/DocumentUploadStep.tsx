// /app/frontend/components/DocumentUploadStep.tsx
"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type DocumentKind =
  | "kra_pin"
  | "business_registration"
  | "etims"
  | "bank_statement"
  | "mpesa";
type DocStatus = "empty" | "uploading" | "done" | "error";

type DocSlot = {
  kind: DocumentKind;
  label: string;
  unlocks: string;
  accept: string;
  status: DocStatus;
  filename?: string;
  warnings?: string[];
};

const INITIAL_SLOTS: DocSlot[] = [
  {
    kind: "kra_pin",
    label: "KRA PIN certificate",
    unlocks:
      "Confirms the business is registered with KRA and lets us check the name matches Zoho Books.",
    accept: ".pdf,.png,.jpg,.jpeg",
    status: "empty",
  },
  {
    kind: "business_registration",
    label: "Business registration certificate",
    unlocks:
      "Confirms the business is a separate legal entity - changes how we read mixed personal/business spending.",
    accept: ".pdf,.png,.jpg,.jpeg",
    status: "empty",
  },
  {
    kind: "etims",
    label: "A sample eTIMS sales receipt",
    unlocks:
      "Lets us cross-check what KRA's tax system saw against what's recorded in your books.",
    accept: ".pdf,.png,.jpg,.jpeg",
    status: "empty",
  },
  {
    kind: "bank_statement",
    label: "Most recent bank statement",
    unlocks:
      "Lets us verify reconciliation instead of just trusting the flag Zoho gives us.",
    accept: ".pdf",
    status: "empty",
  },
  {
    kind: "mpesa",
    label: "M-Pesa Statement",
    unlocks:
      "Allows us to cross-reference mobile money transactions directly with your ledger.",
    accept: ".pdf",
    status: "empty",
  },
];

export default function DocumentUploadStep({
  onSkip,
}: {
  onSkip?: () => void;
}) {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);

  const [slots, setSlots] = useState<DocSlot[]>(INITIAL_SLOTS);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);

  const inputRefs = useRef<Record<DocumentKind, HTMLInputElement | null>>({
    kra_pin: null,
    business_registration: null,
    etims: null,
    bank_statement: null,
    mpesa: null,
  });

  const completedCount = slots.filter((s) => s.status === "done").length;
  const hasStagedFiles = completedCount > 0;

  // Staging action only — saves files without auto-triggering the AI block
  async function handleFileSelected(kind: DocumentKind, file: File) {
    setSlots((prev) =>
      prev.map((s) => (s.kind === kind ? { ...s, status: "uploading" } : s)),
    );

    const formData = new FormData();
    formData.append("document_kind", kind);
    formData.append("file", file);
    formData.append("slug", slug);

    try {
      const res = await fetch(`/api/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || "Extraction failed");
      }

      const result = await res.json();

      setSlots((prev) =>
        prev.map((s) =>
          s.kind === kind
            ? {
                ...s,
                status: "done",
                filename: file.name,
                warnings: result.warnings ?? [],
              }
            : s,
        ),
      );
    } catch (err) {
      console.error("Staging item upload failed:", err);
      setSlots((prev) =>
        prev.map((s) => (s.kind === kind ? { ...s, status: "error" } : s)),
      );
    }
  }

  // Explicit processing button callback
  async function handleExecuteAnalysis() {
    setIsProcessingPipeline(true);
    try {
      const evalRes = await fetch(`/api/businesses/${slug}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (evalRes.ok) {
        // Force Next router context clean refresh, then jump back to dashboard view
        router.push(`/business/${slug}`);
        router.refresh();
      } else {
        // Capture the actual error text returned by the server route
        const errorText = await evalRes.text();
        let structuralError = `Error ${evalRes.status}: Unknown pipeline issue.`;

        try {
          const parsed = JSON.parse(errorText);
          structuralError = `Error ${evalRes.status}: ${parsed.error || parsed.detail || errorText}`;
        } catch {
          if (errorText)
            structuralError = `Error ${evalRes.status}: ${errorText}`;
        }

        alert(structuralError);
      }
    } catch (err) {
      console.error("Pipeline evaluation execution breakdown:", err);
      alert(
        "Network failure: Could not reach evaluation cluster processing routines.",
      );
    } finally {
      setIsProcessingPipeline(false);
    }
  }

  return (
    <div
      className="rounded-[var(--radius-lg)] border p-6 sm:p-7 bg-white"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--marigold)" }}
          >
            {isProcessingPipeline ? "Analyzing Files..." : "Document Ingestion"}
          </p>
          <h2
            className="font-display mt-1.5 text-xl font-bold"
            style={{ color: "var(--ink)" }}
          >
            {isProcessingPipeline
              ? "Running complete compliance read..."
              : "Add documents for sharper, compliance-aware results"}
          </h2>
          <p
            className="mt-2 text-sm leading-6"
            style={{ color: "var(--sage)" }}
          >
            Upload your statements and certificates below. You can stage
            multiple documents before processing them as a unified batch.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className="font-display text-2xl font-bold"
            style={{ color: "var(--savanna)" }}
          >
            {completedCount}/{slots.length}
          </span>
          <p
            className="text-xs font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--sage)" }}
          >
            staged
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot.kind}
            className="rounded-[var(--radius-md)] border p-4 transition-all"
            style={{
              borderColor:
                slot.status === "done" ? "var(--savanna)" : "var(--line)",
              background:
                slot.status === "done" ? "var(--savanna-dim)" : "var(--bone)",
              opacity: isProcessingPipeline ? 0.5 : 1,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                {slot.label}
              </p>
              {slot.status === "done" ? (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{ background: "var(--savanna)", color: "white" }}
                >
                  Staged
                </span>
              ) : null}
            </div>
            <p
              className="mt-1 text-xs leading-5"
              style={{ color: "var(--sage)" }}
            >
              {slot.unlocks}
            </p>

            {slot.status === "done" ? (
              <div className="mt-2.5">
                <p className="font-mono text-[11px] truncate text-gray-600 bg-white/60 p-1 rounded border border-dashed border-gray-200">
                  {slot.filename}
                </p>
                {slot.warnings && slot.warnings.length > 0 ? (
                  <p
                    className="mt-1 text-[11px] italic"
                    style={{ color: "var(--marigold)" }}
                  >
                    {slot.warnings[0]}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                onClick={() => inputRefs.current[slot.kind]?.click()}
                disabled={slot.status === "uploading" || isProcessingPipeline}
                className="font-display mt-2.5 rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] transition disabled:cursor-not-allowed"
                style={{
                  borderColor:
                    slot.status === "error" ? "var(--clay)" : "var(--line)",
                  color: slot.status === "error" ? "var(--clay)" : "var(--ink)",
                  background: "white",
                }}
              >
                {slot.status === "uploading"
                  ? "Uploading..."
                  : slot.status === "error"
                    ? "Try Again"
                    : "Upload"}
              </button>
            )}
            <input
              ref={(el) => {
                inputRefs.current[slot.kind] = el;
              }}
              type="file"
              accept={slot.accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(slot.kind, file);
                e.target.value = "";
              }}
            />
          </div>
        ))}
      </div>

      {/* Confirmation Tray Prompt Component */}
      {hasStagedFiles && (
        <div className="mt-8 border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
          <div>
            <h4
              className="font-display font-bold text-sm"
              style={{ color: "var(--ink)" }}
            >
              Documents uploaded successfully
            </h4>
            <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>
              Ready to analyze these records and rebuild your risk assessment
              dashboard?
            </p>
          </div>
          <button
            onClick={handleExecuteAnalysis}
            disabled={isProcessingPipeline}
            className="font-display w-full sm:w-auto rounded-[var(--radius-md)] px-6 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:opacity-50"
            style={{ background: "var(--ink)" }}
          >
            {isProcessingPipeline
              ? "Analyzing Records..."
              : "Proceed to Analysis →"}
          </button>
        </div>
      )}

      {!hasStagedFiles && onSkip ? (
        <button
          onClick={onSkip}
          disabled={isProcessingPipeline}
          className="mt-5 text-xs font-semibold underline underline-offset-2 disabled:no-underline"
          style={{ color: "var(--sage)" }}
        >
          Skip for now - I'll add these later
        </button>
      ) : null}
    </div>
  );
}
