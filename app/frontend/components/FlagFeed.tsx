"use client";

import { useState } from "react";
import { type FlagItem } from "../lib/types";

const SEVERITY_STYLE: Record<FlagItem["severity"], { accent: string; dim: string; fallbackLabel: string }> = {
  high: { accent: "var(--clay)", dim: "var(--clay-dim)", fallbackLabel: "Needs attention" },
  medium: { accent: "var(--marigold)", dim: "var(--marigold-dim)", fallbackLabel: "Worth watching" },
  low: { accent: "var(--sage)", dim: "var(--sage-dim)", fallbackLabel: "For your records" },
};

interface FlagFeedProps {
  flags: FlagItem[];
  initialVisibleCount?: number;
  title?: string;
}

export default function FlagFeed({ flags, initialVisibleCount, title = "What we found" }: FlagFeedProps) {
  const [expanded, setExpanded] = useState(false);

  const showAll = !initialVisibleCount || expanded;
  const visible = showAll ? flags : flags.slice(0, initialVisibleCount);
  const canExpand = Boolean(initialVisibleCount && flags.length > initialVisibleCount);

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
        {title}
      </h2>

      {flags.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--savanna)" }}>
          Nothing flagged for this period.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-2.5">
            {visible.map((flag, i) => {
              const style = SEVERITY_STYLE[flag.severity];
              return (
                <div
                  key={`${flag.title}-${i}`}
                  className="flex gap-3 rounded-[var(--radius-md)] border py-3.5 pl-3.5 pr-4"
                  style={{ borderColor: "var(--line)", background: "var(--bone)" }}
                >
                  <span className="mt-0.5 w-1 shrink-0 self-stretch rounded-full" style={{ background: style.accent }} />
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
              );
            })}
          </div>

          {canExpand ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] transition hover:opacity-70"
              style={{ color: "var(--sage)" }}
            >
              {expanded ? "Show fewer flags" : `Show all ${flags.length} flags`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}