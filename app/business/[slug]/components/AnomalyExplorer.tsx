// app/business/[slug]/components/AnomalyExplorer.tsx
"use client";

import { useState } from "react";
import type { AnomalyTransaction, FlagResponseMap, FlagResponseType } from "../../../frontend/lib/types";

// ── response config ────────────────────────────────────────────────────────

const RESPONSE_OPTIONS: {
  value: FlagResponseType;
  label: string;
  hint: string;
  color: string;
}[] = [
  {
    value: "already_handled",
    label: "Already handled",
    hint: "I've sorted this — it's in the books correctly.",
    color: "var(--savanna)",
  },
  {
    value: "intentional",
    label: "This is intentional",
    hint: "It looks unusual but it's deliberate — not an issue.",
    color: "var(--sage)",
  },
  {
    value: "need_help",
    label: "I need help with this",
    hint: "I'm not sure what to do — flag this for my accountant.",
    color: "var(--clay)",
  },
];

const RESPONSE_LABELS: Record<FlagResponseType, string> = {
  already_handled: "Already handled",
  intentional: "Intentional",
  need_help: "Needs help",
};

const RESPONSE_COLORS: Record<FlagResponseType, string> = {
  already_handled: "var(--savanna)",
  intentional: "var(--sage)",
  need_help: "var(--clay)",
};

// ── per-transaction response key ───────────────────────────────────────────
// Stored as "flagTitle:transactionId" in FlagResponse.flagTitle column.
// This lets us reuse the existing API and schema with no migration.
function txResponseKey(flagTitle: string, transactionId: string): string {
  return `${flagTitle}:${transactionId}`;
}

// ── TransactionRow ─────────────────────────────────────────────────────────

function TransactionRow({
  anomaly,
  flagTitle,
  slug,
  initialResponse,
  onResponseChange,
}: {
  anomaly: AnomalyTransaction;
  flagTitle: string;
  slug: string;
  initialResponse?: FlagResponseType;
  onResponseChange: (transactionId: string, value: FlagResponseType | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [response, setResponse] = useState<FlagResponseType | null>(initialResponse ?? null);
  const [saving, setSaving] = useState(false);

  const key = txResponseKey(flagTitle, anomaly.transaction_id);

  async function saveResponse(value: FlagResponseType) {
    const prev = response;
    setResponse(value);
    setShowOptions(false);
    setSaving(true);
    try {
      await fetch(`/api/business/${slug}/flag-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagTitle: key, response: value }),
      });
      onResponseChange(anomaly.transaction_id, value);
    } catch {
      setResponse(prev); // revert on network error
    } finally {
      setSaving(false);
    }
  }

  async function clearResponse() {
    const prev = response;
    setResponse(null);
    setShowOptions(false);
    setSaving(true);
    try {
      await fetch(`/api/business/${slug}/flag-response`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagTitle: key }),
      });
      onResponseChange(anomaly.transaction_id, null);
    } catch {
      setResponse(prev);
    } finally {
      setSaving(false);
    }
  }

  const isResolved = response !== null;

  return (
    <div
      className="rounded-[var(--radius-md)] border transition-all"
      style={{
        borderColor: isResolved ? "var(--savanna)" : "var(--line)",
        background: isResolved ? "var(--bone)" : "white",
        opacity: saving ? 0.75 : 1,
      }}
    >
      {/* Row header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isResolved && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ background: "var(--savanna)", color: "white" }}
              >
                ✓ {RESPONSE_LABELS[response]}
              </span>
            )}
            <p className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
              {anomaly.contact_name || anomaly.description || "Unknown"}
            </p>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--sage)" }}>
            KES {anomaly.amount.toLocaleString()} · {anomaly.date}
            {anomaly.category_name ? ` · ${anomaly.category_name}` : ""}
          </p>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          className="mt-1 shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "none" }}
        >
          <path d="M3 5.5L8 10.5L13 5.5" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t" style={{ borderColor: "var(--line)" }}>
          {/* Reason */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--sage)" }}>
              Why it was flagged
            </p>
            <p className="text-sm leading-5" style={{ color: "var(--marigold)" }}>
              {anomaly.reason}
            </p>
          </div>

          {/* Field grid */}
          <div
            className="border-t grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-xs"
            style={{ borderColor: "var(--line)" }}
          >
            <Field label="Branch"     value={anomaly.branch} />
            <Field label="Contact"    value={anomaly.contact_name} />
            <Field label="Category"   value={anomaly.category_name} />
            <Field label="Method"     value={anomaly.payment_method} />
            <Field label="Reference"  value={anomaly.reference_number} />
            <Field label="Status"     value={anomaly.is_reconciled ? "Reconciled" : "Unreconciled"} />
            {anomaly.account_name && (
              <Field label="Account" value={anomaly.account_name} />
            )}
            {anomaly.description && (
              <div className="col-span-2">
                <Field label="Description" value={anomaly.description} />
              </div>
            )}
          </div>

          {/* Per-transaction resolve UI */}
          <div
            className="border-t px-4 py-3"
            style={{ borderColor: "var(--line)" }}
          >
            {showOptions ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--ink)" }}>
                  How would you describe this transaction?
                </p>
                {RESPONSE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => saveResponse(opt.value)}
                    className="w-full text-left rounded-[var(--radius-md)] border px-3 py-2.5 transition hover:opacity-80"
                    style={{ borderColor: "var(--line)", background: "var(--bone)" }}
                  >
                    <p className="text-xs font-bold" style={{ color: opt.color }}>
                      {opt.label}
                    </p>
                    <p className="text-xs mt-0.5 leading-4" style={{ color: "var(--sage)" }}>
                      {opt.hint}
                    </p>
                  </button>
                ))}
                <button
                  onClick={() => setShowOptions(false)}
                  className="text-xs font-semibold"
                  style={{ color: "var(--sage)" }}
                >
                  Cancel
                </button>
              </div>
            ) : response ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: RESPONSE_COLORS[response] }}
                  />
                  <p className="text-xs font-semibold" style={{ color: RESPONSE_COLORS[response] }}>
                    {RESPONSE_LABELS[response]}
                  </p>
                  <p className="text-xs" style={{ color: "var(--sage)" }}>— saved</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowOptions(true)}
                    className="text-xs font-semibold underline underline-offset-2"
                    style={{ color: "var(--sage)" }}
                  >
                    Change
                  </button>
                  <button
                    onClick={clearResponse}
                    className="text-xs font-semibold underline underline-offset-2"
                    style={{ color: "var(--clay)" }}
                  >
                    Undo
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-5" style={{ color: "var(--sage)" }}>
                  Does this transaction belong here?
                </p>
                <button
                  onClick={() => setShowOptions(true)}
                  className="shrink-0 font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-3 py-1.5 rounded-[var(--radius-md)] transition hover:opacity-90"
                  style={{ background: "var(--ink)" }}
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--sage)", fontSize: "10px" }}
      >
        {label}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--ink)" }}>
        {value || "—"}
      </p>
    </div>
  );
}

// ── FlagSection ────────────────────────────────────────────────────────────
// One collapsible group per flag type, with its own progress header.

function FlagSection({
  flagTitle,
  anomalies,
  slug,
  flagResponses,
  highlighted,
}: {
  flagTitle: string;
  anomalies: AnomalyTransaction[];
  slug: string;
  flagResponses: FlagResponseMap;
  highlighted: boolean;
}) {
  const [open, setOpen] = useState(highlighted);
  const [showAll, setShowAll] = useState(false);

  // Local resolved state — starts from flagResponses prop, updated
  // optimistically as the user resolves individual transactions.
  const [resolvedMap, setResolvedMap] = useState<Record<string, FlagResponseType | null>>(() => {
    const m: Record<string, FlagResponseType | null> = {};
    for (const a of anomalies) {
      const key = txResponseKey(flagTitle, a.transaction_id);
      m[a.transaction_id] = (flagResponses[key]?.response as FlagResponseType) ?? null;
    }
    return m;
  });

  const resolvedCount = Object.values(resolvedMap).filter(Boolean).length;
  const total = anomalies.length;
  const allResolved = resolvedCount >= total;

  function handleResponseChange(transactionId: string, value: FlagResponseType | null) {
    setResolvedMap((prev) => ({ ...prev, [transactionId]: value }));
  }

  const visible = showAll ? anomalies : anomalies.slice(0, 5);

  return (
    // Stable id used by EvidencePanel.openToFlag() for scrollIntoView
    <div
      id={`flag-section-${flagTitle.replace(/\s+/g, "-").toLowerCase()}`}
      className="rounded-[var(--radius-lg)] border transition-all"
      style={{
        borderColor: highlighted ? "var(--marigold)" : "var(--line)",
        background: "white",
      }}
    >
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {flagTitle}
          </p>
          <p
            className="mt-0.5 text-xs font-semibold"
            style={{ color: allResolved ? "var(--savanna)" : "var(--sage)" }}
          >
            {allResolved
              ? `All ${total} resolved ✓`
              : resolvedCount === 0
              ? `${total} transaction${total === 1 ? "" : "s"} to review`
              : `${resolvedCount} / ${total} resolved`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Progress dots (up to 8) */}
          {total <= 8 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full transition-colors"
                  style={{
                    width: 7,
                    height: 7,
                    background:
                      i < resolvedCount ? "var(--savanna)" : "var(--line)",
                  }}
                />
              ))}
            </div>
          )}
          <svg
            width="14" height="14" viewBox="0 0 16 16" fill="none"
            className="transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          >
            <path d="M3 5.5L8 10.5L13 5.5" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Transaction rows */}
      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-2" style={{ borderColor: "var(--line)" }}>
          {visible.map((a) => (
            <TransactionRow
              key={a.transaction_id}
              anomaly={a}
              flagTitle={flagTitle}
              slug={slug}
              initialResponse={resolvedMap[a.transaction_id] ?? undefined}
              onResponseChange={handleResponseChange}
            />
          ))}
          {anomalies.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full rounded-[var(--radius-sm)] py-2 text-xs font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--savanna)" }}
            >
              {showAll
                ? "Show fewer"
                : `Show all ${anomalies.length} transactions`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── AnomalyExplorer ────────────────────────────────────────────────────────

interface AnomalyExplorerProps {
  anomalies: AnomalyTransaction[];
  slug: string;
  flagResponses: FlagResponseMap;
  // Which flag title to auto-open and highlight on mount (from FlagFeed jump)
  highlightedFlag: string | null;
}

export default function AnomalyExplorer({
  anomalies,
  slug,
  flagResponses,
  highlightedFlag,
}: AnomalyExplorerProps) {
  // Group anomalies by anomaly_type, preserving insertion order
  const grouped = anomalies.reduce<Record<string, AnomalyTransaction[]>>(
    (acc, a) => {
      const key = a.anomaly_type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(a);
      return acc;
    },
    {}
  );

  const groups = Object.entries(grouped);

  if (groups.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--savanna)" }}>
        Nothing flagged at the transaction level this period.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([flagTitle, txns]) => (
        <FlagSection
          key={flagTitle}
          flagTitle={flagTitle}
          anomalies={txns}
          slug={slug}
          flagResponses={flagResponses}
          highlighted={highlightedFlag === flagTitle}
        />
      ))}
    </div>
  );
}