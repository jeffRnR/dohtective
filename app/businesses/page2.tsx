// /app/businesses/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import "../frontend/styles/tokens.css";
import { fetchOrgs } from "../frontend/lib/api";
import Loader from "../frontend/components/Loader";
import type { Org } from "../frontend/lib/types";

const ROLE_LABEL: Record<string, string> = {
  founder: "Owner",
  accountant: "Accountant",
  reviewer: "Reviewer",
};

const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  founder: { bg: "var(--savanna-dim)", color: "var(--savanna)" },
  accountant: { bg: "var(--marigold-dim)", color: "var(--marigold)" },
  reviewer: { bg: "var(--bone-dim)", color: "var(--sage)" },
};

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setOrgs(await fetchOrgs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading your businesses.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(slug: string) {
    setProcessingDelete(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
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
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bone)" }}>
        <Loader size="lg" />
      </div>
    );
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">

        {/* Top nav */}
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] font-display text-sm font-bold text-white"
              style={{ background: "var(--ink)" }}
            >
              D
            </span>
            <span className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>
              Dohtective
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm sm:block" style={{ color: "var(--sage)" }}>
              {session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="text-xs font-semibold uppercase tracking-[0.08em] transition hover:opacity-70"
              style={{ color: "var(--clay)" }}
            >
              Sign out
            </button>
          </div>
        </nav>

        {/* Header */}
        <header className="mt-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            Your workspace
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl" style={{ color: "var(--ink)" }}>
            {firstName ? `Welcome back, ${firstName}.` : "Your businesses"}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6" style={{ color: "var(--sage)" }}>
            Each business gets its own monthly review — cash runway, unusual transactions,
            and a prioritised action list for you and your accountant.
          </p>
        </header>

        {/* Error */}
        {error && (
          <div
            className="mt-6 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium"
            style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
          >
            {error}
          </div>
        )}

        {/* Delete confirmation */}
        {deletingSlug && (
          <div
            className="mt-6 rounded-[var(--radius-md)] border bg-white p-5"
            style={{ borderColor: "var(--clay)" }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              Delete <span className="font-mono">{deletingSlug}</span>?
            </p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--sage)" }}>
              This removes all data for this business — transactions, reports, and
              connections. It can't be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                disabled={processingDelete}
                onClick={() => handleDelete(deletingSlug)}
                className="rounded-[var(--radius-sm)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                style={{ background: "var(--clay)" }}
              >
                {processingDelete ? "Deleting…" : "Yes, delete it"}
              </button>
              <button
                disabled={processingDelete}
                onClick={() => setDeletingSlug(null)}
                className="rounded-[var(--radius-sm)] border bg-white px-4 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Business list */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: "var(--sage)" }}>
              {loading ? "Loading…" : `${orgs.length} business${orgs.length === 1 ? "" : "es"}`}
            </h2>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs font-semibold uppercase tracking-[0.08em] disabled:opacity-40 transition hover:opacity-70"
              style={{ color: "var(--sage)" }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader size="sm" />
            </div>
          ) : orgs.length === 0 ? (
            <div
              className="rounded-[var(--radius-lg)] border border-dashed p-12 text-center"
              style={{ borderColor: "var(--line)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                No businesses yet
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--sage)" }}>
                Add your first business to start getting monthly financial reviews.
              </p>
              <button
                onClick={() => router.push("/business/new")}
                className="font-display mt-5 inline-block rounded-[var(--radius-md)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
                style={{ background: "var(--savanna)" }}
              >
                Add a business
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {orgs.map((org) => {
                const roleStyle = ROLE_COLOR[org.role] ?? ROLE_COLOR.reviewer;
                return (
                  <div
                    key={org.slug}
                    className="group rounded-[var(--radius-lg)] border bg-white transition hover:shadow-sm"
                    style={{ borderColor: "var(--line)" }}
                  >
                    {/* Clickable main area */}
                    <div
                      onClick={() => router.push(`/business/${org.slug}`)}
                      className="cursor-pointer p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className="truncate font-display text-base font-bold transition-colors group-hover:text-[var(--savanna)]"
                            style={{ color: "var(--ink)" }}
                          >
                            {org.company_name}
                          </p>
                          <p className="mt-0.5 text-xs font-mono" style={{ color: "var(--sage)" }}>
                            {org.slug} · {org.branch_count} {org.branch_count === 1 ? "branch" : "branches"}
                          </p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                          style={{ background: roleStyle.bg, color: roleStyle.color }}
                        >
                          {ROLE_LABEL[org.role] ?? org.role}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: "var(--savanna)" }}
                        />
                        <span className="text-xs" style={{ color: "var(--sage)" }}>
                          View report →
                        </span>
                      </div>
                    </div>

                    {/* Footer actions */}
                    <div
                      className="flex items-center justify-end gap-4 border-t px-5 py-3"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <button
                        onClick={() => router.push(`/business/${org.slug}/edit`)}
                        className="text-[11px] font-semibold uppercase tracking-wider opacity-50 transition hover:opacity-100"
                        style={{ color: "var(--ink)" }}
                      >
                        Settings
                      </button>
                      <button
                        onClick={() => setDeletingSlug(org.slug)}
                        className="text-[11px] font-semibold uppercase tracking-wider opacity-50 transition hover:opacity-100"
                        style={{ color: "var(--clay)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add business — always visible when orgs exist */}
          {orgs.length > 0 && (
            <button
              onClick={() => router.push("/business/new")}
              className="font-display mt-4 w-full rounded-[var(--radius-lg)] border border-dashed py-3.5 text-sm font-bold uppercase tracking-[0.06em] transition hover:border-[var(--savanna)] hover:text-[var(--savanna)]"
              style={{ borderColor: "var(--line)", color: "var(--sage)", background: "transparent" }}
            >
              + Add another business
            </button>
          )}
        </section>
      </main>
    </div>
  );
}