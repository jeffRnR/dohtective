// app/frontend/components/FollowupWorkflow.tsx
import { type FollowupWorkflowItem } from "../lib/types";

const ROLE_COLOR: Record<FollowupWorkflowItem["role"], { bg: string; fg: string }> = {
  founder: { bg: "var(--marigold-dim)", fg: "var(--marigold)" },
  accountant: { bg: "var(--savanna-dim)", fg: "var(--savanna)" },
  reviewer: { bg: "var(--sage-dim)", fg: "var(--sage)" },
};

export default function FollowupWorkflow({ items }: { items: FollowupWorkflowItem[] }) {
  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Follow-up workflow</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>
        Specific next steps, assigned to whoever should act on them.
      </p>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--sage)" }}>No follow-up items needed right now.</p>
        ) : (
          items.map((item, idx) => {
            const colors = ROLE_COLOR[item.role] ?? ROLE_COLOR.reviewer;
            return (
              <div key={item.title} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                  style={{ background: "var(--bone-dim)", color: "var(--sage)" }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--sage)" }}>{item.action}</p>
                  <span
                    className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                    style={{ background: colors.bg, color: colors.fg }}
                  >
                    {item.role}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
