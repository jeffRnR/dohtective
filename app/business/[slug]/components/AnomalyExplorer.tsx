// app/business/[slug]/components/AnomalyExplorer.tsx
"use client";

import { useState } from "react";
import type { AnomalyTransaction } from "../../../frontend/lib/types";

export default function AnomalyExplorer({ anomalies }: { anomalies: AnomalyTransaction[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? anomalies : anomalies.slice(0, 5);

  return (
    <div className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
      <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Transaction detail</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--sage)" }}>
        Every flagged transaction, with the specific reason it was flagged.
      </p>

      {anomalies.length === 0 ? (
        <p className="mt-5 text-sm" style={{ color: "var(--savanna)" }}>
          Nothing flagged at the transaction level this period.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((a) => {
            const isOpen = expandedId === a.transaction_id;
            return (
              <div
                key={a.transaction_id}
                className="rounded-[var(--radius-md)] border"
                style={{ borderColor: "var(--line)" }}
              >
                <button
                  onClick={() => setExpandedId(isOpen ? null : a.transaction_id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{a.anomaly_type}</p>
                    <p className="text-xs" style={{ color: "var(--sage)" }}>
                      KES {a.amount.toLocaleString()} - {a.date}
                    </p>
                  </div>
                  <svg
                    width="14" height="14" viewBox="0 0 16 16" fill="none"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 150ms", flexShrink: 0 }}
                  >
                    <path d="M3 5.5L8 10.5L13 5.5" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isOpen ? (
                  <div className="border-t px-4 py-3 text-sm" style={{ borderColor: "var(--line)" }}>
                    <p style={{ color: "var(--marigold)" }}>{a.reason}</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <Field label="Branch" value={a.branch} />
                      <Field label="Contact" value={a.contact_name} />
                      <Field label="Category" value={a.category_name} />
                      <Field label="Method" value={a.payment_method} />
                      <Field label="Reference" value={a.reference_number} />
                      <Field label="Status" value={a.is_reconciled ? "Reconciled" : "Unreconciled"} />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {anomalies.length > 5 ? (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full rounded-[var(--radius-sm)] py-2 text-xs font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--savanna)" }}
            >
              {showAll ? "Show fewer" : `Show all ${anomalies.length}`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--sage)", fontSize: "10px" }}>{label}</p>
      <p className="mt-0.5" style={{ color: "var(--ink)" }}>{value}</p>
    </div>
  );
}
