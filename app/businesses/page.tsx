"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import "../frontend/styles/tokens.css";
import { fetchOrgs } from "../frontend/lib/api";
import Loader from "../frontend/components/Loader";
import type { Org } from "../frontend/lib/types";

export default function BusinessesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [processingDelete, setProcessingDelete] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/sign-in");
      return;
    }
    if (status === "authenticated") load();
  }, [status]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOrgs();
      setOrgs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(slug: string) {
    setProcessingDelete(true);
    setError(null);
    try {
      const response = await fetch(`/api/business/${slug}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Couldn't delete this business. Try again.");
      }
      setDeletingSlug(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setProcessingDelete(false);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bone)" }}
      >
        <Loader size="lg" />
      </div>
    );
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? null;
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>

      {/* Nav */}
      <div
        className="sticky top-0 z-10 border-b"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5 sm:px-8">
          {/* Brand — links to home */}
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2.5"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] font-display text-sm font-bold text-white"
              style={{ background: "var(--ink)" }}
            >
              D
            </span>
            <span
              className="font-display text-lg font-bold hidden sm:block"
              style={{ color: "var(--ink)" }}
            >
              Dohtective
            </span>
          </button>

          {/* Centre links */}
          <div className="hidden sm:flex items-center gap-6">
            <button
              onClick={() => router.push("/")}
              className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60 hover:opacity-100 transition"
              style={{ color: "var(--ink)" }}
            >
              Home
            </button>
            <a
              href="/pricing"
              className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60 hover:opacity-100 transition"
              style={{ color: "var(--ink)" }}
            >
              Pricing
            </a>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <span
              className="hidden sm:block text-xs truncate max-w-[180px]"
              style={{ color: "var(--sage)" }}
            >
              {userEmail}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="text-xs font-bold uppercase tracking-[0.08em] transition hover:opacity-70"
              style={{ color: "var(--clay)" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">

        {/* Header */}
        <div>
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            Your workspace
          </p>
          <h1
            className="font-display mt-1.5 text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--ink)" }}
          >
            {firstName ? `Welcome back, ${firstName}.` : "Your businesses"}
          </h1>
          <p
            className="mt-2 max-w-xl text-sm leading-6"
            style={{ color: "var(--sage)" }}
          >
            Each business has its own dashboard where you can upload statements,
            run your monthly analysis, and see what needs attention.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mt-6 rounded-[var(--radius-md)] border px-5 py-4 text-sm font-medium"
            style={{
              borderColor: "var(--clay)",
              background: "var(--clay-dim)",
              color: "var(--clay)",
            }}
          >
            {error}
          </div>
        )}

        {/* Delete confirmation */}
        {deletingSlug && (
          <div
            className="mt-6 rounded-[var(--radius-md)] border p-5 bg-white"
            style={{ borderColor: "var(--clay)" }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              Delete this business?
            </p>
            <p
              className="mt-1 text-xs leading-5"
              style={{ color: "var(--sage)" }}
            >
              This permanently removes{" "}
              <span
                className="font-mono font-bold px-1 rounded"
                style={{ background: "var(--bone-dim)" }}
              >
                {deletingSlug}
              </span>{" "}
              along with all its transactions, uploaded files, and reports.
              There is no undo.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                disabled={processingDelete}
                onClick={() => handleDelete(deletingSlug as string)}
                className="text-xs font-bold uppercase tracking-wider text-white px-4 py-2 rounded-[var(--radius-sm)] disabled:opacity-50"
                style={{ background: "var(--clay)" }}
              >
                {processingDelete ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                disabled={processingDelete}
                onClick={() => setDeletingSlug(null)}
                className="text-xs font-semibold px-4 py-2 rounded-[var(--radius-sm)] border bg-white disabled:opacity-50"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Business list */}
        <div
          className="mt-8 rounded-[var(--radius-lg)] border"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <div
            className="flex items-center justify-between px-6 py-4 border-b"
            style={{ borderColor: "var(--line)" }}
          >
            <div>
              <h2
                className="font-display text-base font-bold"
                style={{ color: "var(--ink)" }}
              >
                Your businesses
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--sage)" }}>
                {loading
                  ? "Loading..."
                  : orgs.length === 0
                  ? "None added yet"
                  : `${orgs.length} business${orgs.length === 1 ? "" : "es"}`}
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60 hover:opacity-100 transition disabled:opacity-30"
              style={{ color: "var(--sage)" }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader size="sm" />
            </div>
          ) : orgs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                No businesses yet
              </p>
              <p
                className="mt-1 text-xs leading-5 max-w-sm mx-auto"
                style={{ color: "var(--sage)" }}
              >
                Add your first business to start getting monthly financial
                reviews.
              </p>
              <button
                onClick={() => router.push("/business/new")}
                className="mt-5 font-display text-sm font-bold uppercase tracking-[0.06em] text-white px-5 py-3 rounded-[var(--radius-md)] transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                + Add your first business
              </button>
            </div>
          ) : (
            <ul>
              {orgs.map((org, i) => (
                <li
                  key={org.slug}
                  className="group px-6 py-5 flex items-start justify-between gap-4 hover:bg-[var(--bone)] transition cursor-pointer"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                  }}
                  onClick={() => router.push(`/business/${org.slug}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="text-sm font-semibold group-hover:text-[var(--savanna)] transition-colors"
                        style={{ color: "var(--ink)" }}
                      >
                        {org.company_name}
                      </p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                        style={{
                          background: "var(--bone-dim)",
                          color: "var(--sage)",
                        }}
                      >
                        {org.role}
                      </span>
                    </div>

                    <p
                      className="mt-0.5 text-xs"
                      style={{ color: "var(--sage)" }}
                    >
                      {org.branch_count}{" "}
                      {org.branch_count === 1 ? "branch" : "branches"}{" "}
                      {"\u00B7"}{" "}
                      <span className="font-mono">{org.slug}</span>
                    </p>

                    {/* Quick shortcuts */}
                    <div
                      className="mt-3 flex flex-wrap gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          router.push(`/business/${org.slug}/documents`)
                        }
                        className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-[var(--radius-sm)] border transition hover:opacity-80"
                        style={{
                          borderColor: "var(--line)",
                          color: "var(--ink)",
                          background: "white",
                        }}
                      >
                        Upload files
                      </button>
                      <button
                        onClick={() => router.push(`/business/${org.slug}`)}
                        className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-[var(--radius-sm)] border transition hover:opacity-80"
                        style={{
                          borderColor: "var(--line)",
                          color: "var(--ink)",
                          background: "white",
                        }}
                      >
                        View dashboard
                      </button>
                      <button
                        onClick={() =>
                          router.push(`/business/${org.slug}/edit`)
                        }
                        className="text-[11px] font-bold uppercase tracking-wider transition opacity-50 hover:opacity-100"
                        style={{ color: "var(--ink)" }}
                      >
                        Edit settings
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0 pt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingSlug(org.slug);
                      }}
                      className="text-[11px] font-bold uppercase tracking-wider opacity-40 hover:opacity-100 transition"
                      style={{ color: "var(--clay)" }}
                    >
                      Delete
                    </button>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--savanna)" }}
                    >
                      Open
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {orgs.length > 0 && (
            <div
              className="px-6 py-4 border-t"
              style={{ borderColor: "var(--line)" }}
            >
              <button
                onClick={() => router.push("/business/new")}
                className="font-display w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                + Add a business
              </button>
            </div>
          )}
        </div>

        {/* How it works — only when no businesses */}
        {!loading && orgs.length === 0 && (
          <div
            className="mt-5 rounded-[var(--radius-lg)] border p-6"
            style={{ borderColor: "var(--line)", background: "white" }}
          >
            <p
              className="text-xs font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--savanna)" }}
            >
              What happens after you add a business
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Connect your data",
                  detail:
                    "Connect Zoho Books via OAuth for automatic syncing, or upload M-Pesa statements, bank exports, or Excel files directly. Both paths work.",
                },
                {
                  step: "02",
                  title: "Run your analysis",
                  detail:
                    "The engine checks for mixed funds, duplicate payments, cash flow risk, and unreconciled entries across all your uploaded data.",
                },
                {
                  step: "03",
                  title: "Act on your report",
                  detail:
                    "Get a plain-language summary with a prioritised action list. Push everything to Google Sheets for your accountant to work from directly.",
                },
              ].map((item) => (
                <div key={item.step}>
                  <span
                    className="font-mono text-xs font-semibold"
                    style={{ color: "var(--sage)" }}
                  >
                    {item.step}
                  </span>
                  <p
                    className="font-display mt-1 text-sm font-bold"
                    style={{ color: "var(--ink)" }}
                  >
                    {item.title}
                  </p>
                  <p
                    className="mt-1.5 text-xs leading-5"
                    style={{ color: "var(--sage)" }}
                  >
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p
          className="mt-8 text-center text-xs"
          style={{ color: "var(--sage)" }}
        >
          Dohtective {"\u00B7"} Built for Kenyan SMEs {"\u00B7"}{" "}
          <a
            href="/pricing"
            className="underline underline-offset-2"
            style={{ color: "var(--sage)" }}
          >
            Pricing
          </a>{" "}
          {"\u00B7"}{" "}
          <button
            onClick={() => signOut({ callbackUrl: "/sign-in" })}
            className="underline underline-offset-2"
            style={{ color: "var(--sage)" }}
          >
            Sign out
          </button>
        </p>
      </main>
    </div>
  );
}