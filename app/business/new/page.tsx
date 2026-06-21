// app/business/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../../frontend/styles/tokens.css";
import Loader from "../../frontend/components/Loader";

export default function NewBusinessPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [branchCount, setBranchCount] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Business name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          branch_count: Number(branchCount) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't create the business.");
      router.push(`/business/${data.organization.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <main className="mx-auto max-w-xl px-5 py-16 sm:px-8">
        <button
          onClick={() => router.push("/")}
          className="text-xs font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--sage)" }}
        >
          &larr; Back
        </button>

        <h1 className="font-display mt-4 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Add a business
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
          This creates an empty business profile you can immediately see on a dashboard.
          No fake numbers - it starts at zero until real data comes in.
        </p>

        <div className="mt-6 rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--line)", background: "white" }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="company_name" className="block text-sm font-semibold" style={{ color: "var(--ink)" }}>
                Business name
              </label>
              <input
                id="company_name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Mawimbi Electronics"
                autoFocus
                className="mt-1.5 w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </div>

            <div>
              <label htmlFor="branch_count" className="block text-sm font-semibold" style={{ color: "var(--ink)" }}>
                Number of branches
              </label>
              <input
                id="branch_count"
                type="number"
                min={1}
                value={branchCount}
                onChange={(e) => setBranchCount(e.target.value)}
                className="mt-1.5 w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm font-medium" style={{ color: "var(--clay)" }}>
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="font-display flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:cursor-not-allowed"
              style={{ background: submitting ? "var(--sage)" : "var(--savanna)" }}
            >
              {submitting ? (
                <>
                  <Loader size="sm" />
                  Creating...
                </>
              ) : (
                "Create business"
              )}
            </button>
          </form>
        </div>

        <div
          className="mt-5 rounded-[var(--radius-md)] border p-4"
          style={{ borderColor: "var(--line)", background: "var(--bone-dim)" }}
        >
          <p className="text-xs leading-5" style={{ color: "var(--sage)" }}>
            <span className="font-semibold" style={{ color: "var(--ink)" }}>What happens next: </span>
            you'll land on this business's dashboard right away - it'll show zero transactions
            until real data flows in. From there you can optionally add supporting documents
            (KRA PIN, bank statement, etc.) for sharper detection. A real Zoho Books connection
            isn't live yet - see the honesty note in the project docs.
          </p>
        </div>
      </main>
    </div>
  );
}
