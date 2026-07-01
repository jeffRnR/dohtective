// app/frontend/components/FlagFeed.tsx
"use client";

import { useRef, useState } from "react";
import {
  type FlagItem,
  type FlagResponseMap,
  type FlagResponseType,
} from "../lib/types";

type SeverityStyle = { accent: string; dim: string; fallbackLabel: string };

const SEVERITY_STYLE: { [K in FlagItem["severity"]]: SeverityStyle } = {
  high: {
    accent: "var(--clay)",
    dim: "var(--clay-dim)",
    fallbackLabel: "Needs attention",
  },
  medium: {
    accent: "var(--marigold)",
    dim: "var(--marigold-dim)",
    fallbackLabel: "Worth watching",
  },
  low: {
    accent: "var(--sage)",
    dim: "var(--sage-dim)",
    fallbackLabel: "For your records",
  },
};

// ── helpers ────────────────────────────────────────────────────────────────

// All transaction-level response keys for a given flag look like
// "flagTitle:transactionId". This function counts how many of those
// exist in flagResponses for a given flagTitle.
function countResolved(
  flagTitle: string,
  flagResponses: FlagResponseMap,
): number {
  const prefix = `${flagTitle}:`;
  return Object.keys(flagResponses).filter((k) => k.startsWith(prefix)).length;
}

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

// ── FlagCard ───────────────────────────────────────────────────────────────

function FlagCard({
  flag,
  slug,
  txCount,
  resolvedCount,
  initialResponse,
  onViewTransactions,
}: {
  flag: FlagItem;
  slug: string;
  txCount: number;
  resolvedCount: number;
  initialResponse?: { response: FlagResponseType; respondedAt: string };
  onViewTransactions: () => void;
}) {
  const style = SEVERITY_STYLE[flag.severity];
  const allResolved = txCount > 0 && resolvedCount >= txCount;

  // Per-flag response (independent of per-transaction responses)
  const [flagResponse, setFlagResponse] = useState<FlagResponseType | null>(
    initialResponse?.response ?? null,
  );
  const [showFlagOptions, setShowFlagOptions] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveFlagResponse(value: FlagResponseType) {
    const prev = flagResponse;
    setFlagResponse(value);
    setShowFlagOptions(false);
    setSaving(true);
    try {
      await fetch(`/api/business/${slug}/flag-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagTitle: flag.title, response: value }),
      });
    } catch {
      setFlagResponse(prev);
    } finally {
      setSaving(false);
    }
  }

  async function clearFlagResponse() {
    const prev = flagResponse;
    setFlagResponse(null);
    setShowFlagOptions(false);
    setSaving(true);
    try {
      await fetch(`/api/business/${slug}/flag-response`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagTitle: flag.title }),
      });
    } catch {
      setFlagResponse(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-[var(--radius-md)] border transition-all"
      style={{
        borderColor: "var(--line)",
        background: "var(--bone)",
        opacity: saving ? 0.8 : 1,
      }}
    >
      {/* Flag content */}
      <div className="flex gap-3 py-3.5 pl-3.5 pr-4">
        <span
          className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
          style={{ background: style.accent }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {flag.title}
            </p>

            <span
              className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ background: style.dim, color: style.accent }}
            >
              {flag.confidenceLabel ?? style.fallbackLabel}
            </span>
          </div>

          <div className="mt-1.5">
            <p className="text-sm leading-6" style={{ color: "var(--sage)" }}>
              {flag.detail}
            </p>

            {txCount === 0 && (
              <button
                onClick={onViewTransactions}
                className="mt-2 text-xs font-semibold underline underline-offset-2 transition hover:opacity-70"
                style={{ color: "var(--sage)" }}
              >
                See transactions in evidence ↓
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer row 1 — progress + jump to evidence */}
      {txCount > 0 && (
        <div
          className="border-t px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderColor: "var(--line)" }}
        >
          {/* Left: transaction progress or evidence nudge */}
          <div className="flex items-center gap-2.5">
            {txCount > 0 && (
              <>
                {txCount <= 8 && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: txCount }).map((_, i) => (
                      <span
                        key={i}
                        className="inline-block rounded-full transition-colors"
                        style={{
                          width: 8,
                          height: 8,
                          background:
                            i < resolvedCount
                              ? "var(--savanna)"
                              : "var(--line)",
                        }}
                      />
                    ))}
                  </div>
                )}

                <p
                  className="text-xs font-semibold"
                  style={{
                    color: allResolved ? "var(--savanna)" : "var(--sage)",
                  }}
                >
                  {allResolved
                    ? `All ${txCount} resolved ✓`
                    : resolvedCount === 0
                      ? `${txCount} transaction${txCount === 1 ? "" : "s"} to review`
                      : `${resolvedCount} / ${txCount} resolved`}
                </p>
              </>
            )}
          </div>

          {/* Right: jump to per-transaction evidence */}
          {txCount > 0 && (
            <button
              onClick={onViewTransactions}
              className="shrink-0 font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-3 py-1.5 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{
                background: allResolved ? "var(--savanna)" : "var(--ink)",
              }}
            >
              {allResolved ? "View resolved →" : "Review transactions →"}
            </button>
          )}
        </div>
      )}

      {/* Footer row 2 — per-flag resolve (always shown) */}
      <div
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--line)" }}
      >
        {showFlagOptions ? (
          <div className="space-y-2">
            <p
              className="text-xs font-semibold mb-2"
              style={{ color: "var(--ink)" }}
            >
              How would you describe this flag overall?
            </p>
            {RESPONSE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => saveFlagResponse(opt.value)}
                className="w-full text-left rounded-[var(--radius-md)] border px-3 py-2.5 transition hover:opacity-80"
                style={{ borderColor: "var(--line)", background: "white" }}
              >
                <p className="text-xs font-bold" style={{ color: opt.color }}>
                  {opt.label}
                </p>
                <p
                  className="text-xs mt-0.5 leading-4"
                  style={{ color: "var(--sage)" }}
                >
                  {opt.hint}
                </p>
              </button>
            ))}
            <button
              onClick={() => setShowFlagOptions(false)}
              className="text-xs font-semibold"
              style={{ color: "var(--sage)" }}
            >
              Cancel
            </button>
          </div>
        ) : flagResponse ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: RESPONSE_COLORS[flagResponse] }}
              />
              <p
                className="text-xs font-semibold"
                style={{ color: RESPONSE_COLORS[flagResponse] }}
              >
                {RESPONSE_LABELS[flagResponse]}
              </p>
              <p className="text-xs" style={{ color: "var(--sage)" }}>
                — flag response saved
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFlagOptions(true)}
                className="text-xs font-semibold underline underline-offset-2"
                style={{ color: "var(--sage)" }}
              >
                Change
              </button>
              <button
                onClick={clearFlagResponse}
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
              Resolve this flag as a whole, or review individual transactions
              above.
            </p>
            <button
              onClick={() => setShowFlagOptions(true)}
              className="shrink-0 font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-3 py-1.5 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{ background: "var(--ink)" }}
            >
              Resolve flag
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FlagFeed ───────────────────────────────────────────────────────────────

export interface EvidencePanelHandle {
  openToFlag: (flagTitle: string) => void;
}

interface FlagFeedProps {
  flags: FlagItem[];
  slug: string;
  flagResponses?: FlagResponseMap;
  initialVisibleCount?: number;
  title?: string;
  // Ref to EvidencePanel so FlagFeed can trigger scroll+expand
  evidencePanelRef?: React.RefObject<EvidencePanelHandle | null>;
  // Per-flag transaction counts, keyed by flag title
  txCountByFlag?: Record<string, number>;
}

export default function FlagFeed({
  flags,
  slug,
  flagResponses = {},
  initialVisibleCount,
  title = "What we found",
  evidencePanelRef,
  txCountByFlag = {},
}: FlagFeedProps) {
  const [expanded, setExpanded] = useState(false);

  const showAll = !initialVisibleCount || expanded;
  const visible = showAll ? flags : flags.slice(0, initialVisibleCount);
  const canExpand = Boolean(
    initialVisibleCount && flags.length > initialVisibleCount,
  );

  return (
    <div
      className="rounded-[var(--radius-lg)] border p-6"
      style={{ borderColor: "var(--line)", background: "white" }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          className="font-display text-lg font-bold"
          style={{ color: "var(--ink)" }}
        >
          {title}
        </h2>
        {flags.length > 0 && (
          <p className="text-xs mt-1" style={{ color: "var(--sage)" }}>
            Review and resolve each flag's transactions below.
          </p>
        )}
      </div>

      {flags.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--savanna)" }}>
          Nothing flagged for this period.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {visible.map((flag, i) => {
              const txCount = txCountByFlag[flag.title] ?? 0;
              const resolvedCount = countResolved(flag.title, flagResponses);

              return (
                <FlagCard
                  key={`${flag.title}-${i}`}
                  flag={flag}
                  slug={slug}
                  txCount={txCount}
                  resolvedCount={resolvedCount}
                  onViewTransactions={() => {
                    evidencePanelRef?.current?.openToFlag(flag.title);
                  }}
                />
              );
            })}
          </div>

          {canExpand && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] transition hover:opacity-70"
              style={{ color: "var(--sage)" }}
            >
              {expanded ? "Show fewer flags" : `Show all ${flags.length} flags`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
