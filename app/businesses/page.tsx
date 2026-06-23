// /app/businesses/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import "../frontend/styles/tokens.css";
import { fetchOrgs } from "../frontend/lib/api";
import Loader from "../frontend/components/Loader";
import type { Org } from "../frontend/lib/types";

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for handling business profile removal safely inline
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [processingDelete, setProcessingDelete] = useState(false);

  useEffect(() => {
    // Real auth gate - unauthenticated visitors never see a business
    // list at all, redirected before any data fetch happens.
    if (status === "unauthenticated") {
      router.push("/sign-in");
      return;
    }
    if (status === "authenticated") {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Destructive removal network engine execution 
  async function handleDelete(slug: string) {
    setProcessingDelete(true);
    setError(null);
    try {
      const response = await fetch(`/api/business/${slug}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Could not execute organizational data reset.");
      }

      setDeletingSlug(null);
      await load(); // Hydrate current list status from the API endpoint
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
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

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        {/* Navigation Branding Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] font-display text-base font-bold text-white"
              style={{ background: "var(--ink)" }}
            >
              D
            </span>
            <span className="font-display text-xl font-bold" style={{ color: "var(--ink)" }}>Dohtective</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--sage)" }}>{session?.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="text-xs font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--clay)" }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Hero Header Area */}
        <div className="mt-12 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--savanna)" }}>
            AI Financial Controller for Kenyan SMEs
          </p>
          <h1 className="font-display mt-2 text-4xl font-bold leading-tight sm:text-5xl" style={{ color: "var(--ink)" }}>
            Catch the problem a month before the investor update does.
          </h1>
          <p className="mt-4 text-base leading-7" style={{ color: "var(--sage)" }}>
            Connect Zoho Books, get a plain-language read on cash flow, mixed funds, and
            duplicate payments - flagged the month it happens, not after.
          </p>
        </div>

        {/* Dynamic Global Custom Error Container */}
        {error ? (
          <div
            className="mt-8 rounded-[var(--radius-md)] border px-5 py-4 text-sm font-medium animate-in fade-in duration-150"
            style={{ borderColor: "var(--clay)", background: "var(--clay-dim)", color: "var(--clay)" }}
          >
            {error}
          </div>
        ) : null}

        {/* Safe Inline Context Destruction Confirmation Panel */}
        {deletingSlug && (
          <div 
            className="mt-8 rounded-[var(--radius-md)] border p-5 text-left bg-white border-[var(--clay)] animate-in slide-in-from-top-2 duration-200"
          >
            <p className="text-sm font-bold text-[var(--ink)]">Confirm Business Removal</p>
            <p className="mt-1 text-xs" style={{ color: "var(--sage)" }}>
              Are you completely sure you want to disconnect and delete <span className="font-mono font-bold bg-slate-100 px-1 rounded">{deletingSlug}</span>? This cannot be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                disabled={processingDelete}
                onClick={() => handleDelete(deletingSlug)}
                className="text-xs font-bold uppercase tracking-wider text-white px-4 py-2 rounded-[var(--radius-sm)] disabled:opacity-50"
                style={{ background: "var(--clay)" }}
              >
                {processingDelete ? "Deleting Profile..." : "Confirm Delete"}
              </button>
              <button
                disabled={processingDelete}
                onClick={() => setDeletingSlug(null)}
                className="text-xs font-semibold px-4 py-2 rounded-[var(--radius-sm)] border bg-white"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Workspace Display Board Card */}
        <div className="mt-10 rounded-[var(--radius-lg)] border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "white" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Your businesses</h2>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs font-semibold uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ color: "var(--sage)" }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <div className="mt-6 flex justify-center py-4"><Loader size="sm" /></div>
          ) : orgs.length === 0 ? (
            <div className="mt-6 rounded-[var(--radius-md)] border border-dashed p-8 text-center" style={{ borderColor: "var(--line)" }}>
              <p className="text-sm" style={{ color: "var(--sage)" }}>
                No businesses yet - none have been created, and nobody's added you to one. Add your first one to get started.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {orgs.map((org) => (
                <div
                  key={org.slug}
                  className="group rounded-[var(--radius-md)] border p-4 flex flex-col justify-between transition hover:shadow-sm"
                  style={{ borderColor: "var(--line)", background: "var(--bone)" }}
                >
                  {/* Clickable Area: Safely routes context flow to company route views */}
                  <div 
                    onClick={() => router.push(`/business/${org.slug}`)}
                    className="cursor-pointer flex-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold group-hover:text-[var(--savanna)] transition-colors" style={{ color: "var(--ink)" }}>
                        {org.company_name}
                      </p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                        style={{ background: "var(--bone-dim)", color: "var(--sage)" }}
                      >
                        {org.role}
                      </span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--sage)" }}>
                      {org.branch_count} {org.branch_count === 1 ? "branch" : "branches"} - <span className="font-mono text-[11px]">{org.slug}</span>
                    </p>
                  </div>

                  {/* Inline Action Toolbar Settings Panel */}
                  <div className="mt-4 pt-3 border-t flex justify-end items-center gap-4" style={{ borderColor: "var(--line)" }}>
                    <button
                      onClick={() => router.push(`/business/${org.slug}/edit`)}
                      className="text-[11px] font-bold uppercase tracking-wider transition opacity-60 hover:opacity-100"
                      style={{ color: "var(--ink)" }}
                    >
                      Edit Settings
                    </button>
                    <button
                      onClick={() => setDeletingSlug(org.slug)}
                      className="text-[11px] font-bold uppercase tracking-wider transition opacity-70 hover:opacity-100"
                      style={{ color: "var(--clay)" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
            <button
              onClick={() => router.push("/business/new")}
              className="font-display w-full rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition"
              style={{ background: "var(--savanna)" }}
            >
              + Add a business
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}