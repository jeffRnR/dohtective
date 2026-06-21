"use client";

import { useEffect, useState } from "react";

type Status = "safe" | "watch" | "urgent" | "unknown";

function getStatus(days: number | null): Status {
  if (days === null) return "unknown";
  if (days < 10) return "urgent";
  if (days < 20) return "watch";
  return "safe";
}

const STATUS_CONFIG: Record<Status, { color: string; dim: string; label: string; sentence: (d: number) => string }> = {
  safe: {
    color: "var(--savanna)",
    dim: "var(--savanna-dim)",
    label: "Healthy",
    sentence: (d) => `At today's pace, you can cover ${d} days of spending without new income.`,
  },
  watch: {
    color: "var(--marigold)",
    dim: "var(--marigold-dim)",
    label: "Worth watching",
    sentence: (d) => `You have ${d} days of buffer left - start lining up what's coming in next.`,
  },
  urgent: {
    color: "var(--clay)",
    dim: "var(--clay-dim)",
    label: "Needs attention",
    sentence: (d) => `Only ${d} days of buffer left at the current pace. Worth a look today.`,
  },
  unknown: {
    color: "var(--sage)",
    dim: "var(--sage-dim)",
    label: "Not connected",
    sentence: () => "Connect your books to see your cash buffer.",
  },
};

export default function CashBufferGauge({ days }: { days: number | null }) {
  const status = getStatus(days);
  const cfg = STATUS_CONFIG[status];
  const [displayed, setDisplayed] = useState(0);

  // Odometer-style count-up - the one orchestrated motion moment on the page.
  useEffect(() => {
    if (days === null) {
      setDisplayed(0);
      return;
    }
    let frame: number;
    const duration = 700;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * days));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [days]);

  // Arc gauge geometry - semicircle, fill proportional to a 0-45 day scale (45d ~ full).
  const pct = days === null ? 0 : Math.max(0, Math.min(1, days / 45));
  const r = 80;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-[120px] w-[200px] shrink-0">
        <svg viewBox="0 0 200 110" className="h-full w-full" aria-hidden="true">
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="var(--bone-dim)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={cfg.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1), stroke 300ms" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="font-display text-[44px] font-bold leading-none tabular-nums" style={{ color: cfg.color }}>
            {days === null ? "-" : displayed}
          </span>
          <span className="mt-1 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
            days of buffer
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span
          className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]"
          style={{ background: cfg.dim, color: cfg.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
          {cfg.label}
        </span>
        <p className="max-w-md text-base leading-6" style={{ color: "var(--ink)" }}>
          {cfg.sentence(days ?? 0)}
        </p>
      </div>
    </div>
  );
}
