"use client";

import { useRef, useState } from "react";

type DocumentKind = "kra_pin" | "business_registration" | "etims" | "bank_statement" | "mpesa";

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
    unlocks: "Confirms the business is registered with KRA and lets us check the name matches Zoho Books.",
    accept: ".pdf,.png,.jpg,.jpeg",
    status: "empty",
  },
  {
    kind: "business_registration",
    label: "Business registration certificate",
    unlocks: "Confirms the business is a separate legal entity - changes how we read mixed personal/business spending.",
    accept: ".pdf,.png,.jpg,.jpeg",
    status: "empty",
  },
  {
    kind: "etims",
    label: "A sample eTIMS sales receipt",
    unlocks: "Lets us cross-check what KRA's tax system saw against what's recorded in your books.",
    accept: ".pdf,.png,.jpg,.jpeg",
    status: "empty",
  },
  {
    kind: "bank_statement",
    label: "Most recent bank statement",
    unlocks: "Lets us verify reconciliation instead of just trusting the flag Zoho gives us.",
    accept: ".pdf",
    status: "empty",
  },
  {
    kind: "mpesa",
    label: "M-Pesa Statement",
    unlocks: "Allows us to cross-reference mobile money transactions directly with your ledger.",
    accept: ".pdf",
    status: "empty",
  },
];

export default function DocumentUploadStep({ onSkip }: { onSkip?: () => void }) {
  const [slots, setSlots] = useState<DocSlot[]>(INITIAL_SLOTS);
  const inputRefs = useRef<Record<DocumentKind, HTMLInputElement | null>>({
    kra_pin: null,
    business_registration: null,
    etims: null,
    bank_statement: null,
    mpesa: null,
  });

  const completedCount = slots.filter((s) => s.status === "done").length;

  async function handleFileSelected(kind: DocumentKind, file: File) {
    setSlots((prev) => prev.map((s) => (s.kind === kind ? { ...s, status: "uploading" } : s)));

    const formData = new FormData();
    formData.append("document_kind", kind);
    formData.append("file", file);

    try {
      // Note: We do NOT set Content-Type header here. 
      // The browser must set it automatically to include the boundary.
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
            ? { ...s, status: "done", filename: file.name, warnings: result.warnings ?? [] }
            : s
        )
      );
    } catch (err) {
      setSlots((prev) => prev.map((s) => (s.kind === kind ? { ...s, status: "error" } : s)));
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border p-6 sm:p-7" style={{ borderColor: "var(--line)", background: "white" }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--marigold)" }}>
            Optional - Step 2
          </p>
          <h2 className="font-display mt-1.5 text-xl font-bold" style={{ color: "var(--ink)" }}>
            Add documents for sharper, compliance-aware results
          </h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
            Your dashboard already works with just Zoho connected. These documents let the system
            catch things Zoho alone can't see - skip any of them, or all of them, and add them later.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-display text-2xl font-bold" style={{ color: "var(--savanna)" }}>
            {completedCount}/{slots.length}
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--sage)" }}>
            added
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot.kind}
            className="rounded-[var(--radius-md)] border p-4"
            style={{
              borderColor: slot.status === "done" ? "var(--savanna)" : "var(--line)",
              background: slot.status === "done" ? "var(--savanna-dim)" : "var(--bone)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{slot.label}</p>
              {slot.status === "done" ? (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: "var(--savanna)", color: "white" }}>
                  Added
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--sage)" }}>{slot.unlocks}</p>

            {slot.status === "done" ? (
              <div className="mt-2.5">
                <p className="font-mono text-[11px]" style={{ color: "var(--savanna)" }}>{slot.filename}</p>
                {slot.warnings && slot.warnings.length > 0 ? (
                  <p className="mt-1 text-[11px] italic" style={{ color: "var(--marigold)" }}>
                    {slot.warnings[0]}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                onClick={() => inputRefs.current[slot.kind]?.click()}
                disabled={slot.status === "uploading"}
                className="font-display mt-2.5 rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] transition disabled:cursor-not-allowed"
                style={{
                  borderColor: slot.status === "error" ? "var(--clay)" : "var(--line)",
                  color: slot.status === "error" ? "var(--clay)" : "var(--ink)",
                  background: "white",
                }}
              >
                {slot.status === "uploading" ? "Uploading..." : slot.status === "error" ? "Try again" : "Upload"}
              </button>
            )}
            <input
              ref={(el) => { inputRefs.current[slot.kind] = el; }}
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

      {onSkip ? (
        <button
          onClick={onSkip}
          className="mt-5 text-xs font-semibold underline underline-offset-2"
          style={{ color: "var(--sage)" }}
        >
          Skip for now - I'll add these later
        </button>
      ) : null}
    </div>
  );
}