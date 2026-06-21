// app/frontend/components/MissingInformationChecklist.tsx
"use client";

import { useState } from "react";
import { type ReportData } from "../lib/types";

export default function MissingInformationChecklist({ report }: { report: ReportData | null }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(item: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Checklist</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>Items worth following up on.</p>

      <div className="mt-4 space-y-1">
        {!report ? (
          <p className="text-sm" style={{ color: "var(--sage)" }}>Connect a business to see the checklist.</p>
        ) : report.missing_information_checklist.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--savanna)" }}>All set for this period.</p>
        ) : (
          report.missing_information_checklist.map((item) => {
            const isChecked = checked.has(item);
            return (
              <label
                key={item}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition hover:bg-[var(--bone-dim)]"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--savanna)]"
                />
                <span
                  className="text-sm leading-5"
                  style={{
                    color: isChecked ? "var(--sage)" : "var(--ink)",
                    textDecoration: isChecked ? "line-through" : "none",
                  }}
                >
                  {item}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
