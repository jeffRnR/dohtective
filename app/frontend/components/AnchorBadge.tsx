// app/frontend/components/AnchorBadge.tsx
// Shows anchor status for a report snapshot. Three states:
//   anchored  → green badge with Snowtrace link
//   pending   → yellow badge (transaction in flight)
//   failed    → red badge with retry hint
//   null      → nothing (report predates anchoring feature)
"use client";

type AnchorBadgeProps = {
  anchorStatus: string | null;
  anchorTxHash: string | null;
  monthYear: string; // e.g. "2026-06" — used to build the verify link
  businessSlug: string;
};

export default function AnchorBadge({
  anchorStatus,
  anchorTxHash,
  monthYear,
  businessSlug,
}: AnchorBadgeProps) {
  if (!anchorStatus) return null;

  const explorerUrl = anchorTxHash
    ? `https://testnet.snowtrace.io/tx/${anchorTxHash}`
    : null;

  const verifyUrl = `/verify?business=${businessSlug}&month=${monthYear}`;

  if (anchorStatus === "anchored") {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {/* Anchored badge */}
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
          style={{ background: "var(--savanna-dim)", color: "var(--savanna)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--savanna)" }} />
          Anchored on Avalanche
        </span>

        {/* Snowtrace link */}
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold underline underline-offset-2 transition hover:opacity-70"
            style={{ color: "var(--sage)" }}
          >
            View transaction →
          </a>
        )}

        {/* Verify link */}
        <a
          href={verifyUrl}
          className="text-[11px] font-semibold underline underline-offset-2 transition hover:opacity-70"
          style={{ color: "var(--sage)" }}
        >
          Verify this report →
        </a>
      </div>
    );
  }

  if (anchorStatus === "pending") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ background: "var(--marigold-dim)", color: "var(--marigold)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--marigold)" }} />
        Anchoring in progress…
      </span>
    );
  }

  if (anchorStatus === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ background: "var(--clay-dim)", color: "var(--clay)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--clay)" }} />
        Anchor failed — will retry next analysis
      </span>
    );
  }

  return null;
}