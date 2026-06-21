"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type FollowupWorkflowItem } from "../lib/types";

const ROLE_LABEL: Record<FollowupWorkflowItem["role"], string> = {
  founder: "Your move",
  accountant: "For your accountant",
  reviewer: "For your reviewer",
};

const ROLE_ORDER: FollowupWorkflowItem["role"][] = ["founder", "accountant", "reviewer"];

export default function ActionPlan({ items, slug }: { items: FollowupWorkflowItem[]; slug: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const byRole: Partial<Record<FollowupWorkflowItem["role"], { item: FollowupWorkflowItem; index: number }[]>> = {};
  items.forEach((item, index) => {
    const bucket = byRole[item.role] ?? (byRole[item.role] = []);
    bucket.push({ item, index });
  });
  const activeRoles = ROLE_ORDER.filter((r) => byRole[r] && byRole[r]!.length > 0);

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
        What to do next
      </h2>

      {activeRoles.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--savanna)" }}>
          Nothing outstanding this period.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {activeRoles.map((role) => (
            <div key={role}>
              <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: "var(--sage)" }}>
                {ROLE_LABEL[role]}
              </p>
              <div className="mt-2.5 space-y-1">
                {byRole[role]!.map(({ item, index }) => {
                  const isChecked = checked.has(index);
                  return (
                    <label
                      key={index}
                      className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1.5 transition hover:bg-[var(--bone-dim)]"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(index)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--savanna)]"
                      />
                      <span
                        className="text-sm leading-6"
                        style={{ color: isChecked ? "var(--sage)" : "var(--ink)", textDecoration: isChecked ? "line-through" : "none" }}
                      >
                        <span className="font-medium">{item.title}.</span> <span style={{ color: "var(--sage)" }}>{item.action}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => router.push(`/business/${slug}/notify`)}
        className="font-display mt-5 w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
        style={{ background: "var(--ink)" }}
      >
        Push this list to Google Sheets &rarr;
      </button>
    </div>
  );
}
