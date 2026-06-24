"use client";

import { useState } from "react";
import { type FlagItem, type FlagResponseMap, type FlagResponseType } from "../lib/types";

type SeverityStyle = { accent: string; dim: string; fallbackLabel: string };

const SEVERITY_STYLE: { [K in FlagItem["severity"]]: SeverityStyle } = {
  high: { accent: "var(--clay)", dim: "var(--clay-dim)", fallbackLabel: "Needs attention" },
  medium: { accent: "var(--marigold)", dim: "var(--marigold-dim)", fallbackLabel: "Worth watching" },
  low: { accent: "var(--sage)", dim: "var(--sage-dim)", fallbackLabel: "For your records" },
};

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

const RESPONSE_LABELS: { [K in FlagResponseType]: string } = {
  already_handled: "Already handled",
  intentional: "Intentional",
  need_help: "Needs help",
};

const RESPONSE_COLORS: { [K in FlagResponseType]: string } = {
  already_handled: "var(--savanna)",
  intentional: "var(--sage)",
  need_help: "var(--clay)",
};

function FlagCard({
  flag,
  slug,
  initialResponse,
}: {
  flag: FlagItem;
  slug: string;
  initialResponse?: { response: FlagResponseType; respondedAt: string };
}) {
  const style = SEVERITY_STYLE[flag.severity];
  const [response, setResponse] = useState<FlagResponseType | null>(
    initialResponse?.response ?? null
  );
  const [showOptions, setShowOptions] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveResponse(value: FlagResponseType) {
    setResponse(value);
    setShowOptions(false);
    setSaving(true);
    try {
      await fetch(`/api/business/${slug}/flag-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagTitle: flag.title, response: value }),
      });
    } catch {
      // silent — optimistic state stays
    } finally {
      setSaving(false);
    }
  }

  async function clearResponse() {
    setResponse(null);
    setShowOptions(false);
    setSaving(true);
    try {
      await fetch(`/api/business/${slug}/flag-response`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagTitle: flag.title }),
      });
    } catch {
      // silent
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
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
              {flag.title}
            </p>
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ background: style.dim, color: style.accent }}
            >
              {flag.confidenceLabel ?? style.fallbackLabel}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--sage)" }}>
            {flag.detail}
          </p>
        </div>
      </div>

      {/* Response section */}
      <div className="border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
        {response && !showOptions ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: RESPONSE_COLORS[response] }}
              />
              <p className="text-xs font-semibold" style={{ color: RESPONSE_COLORS[response] }}>
                {RESPONSE_LABELS[response]}
              </p>
              <p className="text-xs" style={{ color: "var(--sage)" }}>
                — your response is saved
              </p>
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
        ) : showOptions ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--ink)" }}>
              How would you describe this flag?
            </p>
            {RESPONSE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => saveResponse(opt.value)}
                className="w-full text-left rounded-[var(--radius-md)] border px-3 py-2.5 transition hover:opacity-80"
                style={{ borderColor: "var(--line)", background: "white" }}
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
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5" style={{ color: "var(--sage)" }}>
              Does this flag make sense for your business? Let us know so we
              can learn from your context.
            </p>
            <button
              onClick={() => setShowOptions(true)}
              className="shrink-0 font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-3 py-1.5 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{ background: "var(--ink)" }}
            >
              Respond
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface FlagFeedProps {
  flags: FlagItem[];
  slug: string;
  flagResponses?: FlagResponseMap;
  initialVisibleCount?: number;
  title?: string;
}

export default function FlagFeed({
  flags,
  slug,
  flagResponses = {},
  initialVisibleCount,
  title = "What we found",
}: FlagFeedProps) {
  const [expanded, setExpanded] = useState(false);

  const showAll = !initialVisibleCount || expanded;
  const visible = showAll ? flags : flags.slice(0, initialVisibleCount);
  const canExpand = Boolean(initialVisibleCount && flags.length > initialVisibleCount);

  return (
    <div
      className="rounded-[var(--radius-lg)] border p-6"
      style={{ borderColor: "var(--line)", background: "white" }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
          {title}
        </h2>
        {flags.length > 0 && (
          <p className="text-xs mt-1" style={{ color: "var(--sage)" }}>
            Respond to each flag to help Dohtective learn your business context.
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
            {visible.map((flag, i) => (
              <FlagCard
                key={`${flag.title}-${i}`}
                flag={flag}
                slug={slug}
                initialResponse={flagResponses[flag.title]}
              />
            ))}
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