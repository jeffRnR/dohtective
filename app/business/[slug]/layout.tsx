// app/business/[slug]/layout.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import "../../frontend/styles/tokens.css";
import { fetchOrgs } from "../../frontend/lib/api";
import Loader from "../../frontend/components/Loader";
import type { Org } from "../../frontend/lib/types";

const TABS = [
  { href: "", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/notify", label: "Notify" },
  { href: "/members", label: "Members" },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const slug = String(params.slug);

  const [orgs, setOrgs] = useState<Org[]>([]);

  useEffect(() => {
    // UI-side gate - the REAL enforcement is server-side in every API
    // route via requireBusinessMember() (see app/lib/authz.ts). This
    // redirect just avoids flashing a broken page to a signed-out
    // visitor; it is not the security boundary.
    if (status === "unauthenticated") {
      router.push("/sign-in");
      return;
    }
    if (status === "authenticated") {
      fetchOrgs().then(setOrgs).catch(() => setOrgs([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, slug]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bone)" }}>
        <Loader size="lg" />
      </div>
    );
  }

  const currentOrg = orgs.find((o) => o.slug === slug);
  const basePath = `/business/${slug}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <header className="sticky top-0 z-10 border-b" style={{ borderColor: "var(--line)", background: "var(--bone)" }}>
        <div className="mx-auto max-w-6xl px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] font-display text-sm font-bold text-white transition hover:opacity-80"
                style={{ background: "var(--ink)" }}
                aria-label="Back to all businesses"
              >
                D
              </button>
              <div>
                <p className="font-display text-base font-bold leading-none" style={{ color: "var(--ink)" }}>
                  {currentOrg?.company_name ?? slug}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--sage)" }}>
                  {currentOrg ? `${currentOrg.branch_count} branches - ${currentOrg.role}` : "Loading..."}
                </p>
              </div>
            </div>

            {orgs.length > 1 ? (
              <select
                value={slug}
                onChange={(e) => router.push(`/business/${e.target.value}`)}
                className="rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "white" }}
              >
                {orgs.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.company_name}</option>
                ))}
              </select>
            ) : null}
          </div>

          <nav className="mt-4 flex gap-1">
            {TABS.map((tab) => {
              const href = `${basePath}${tab.href}`;
              const isActive = pathname === href;
              return (
                <button
                  key={tab.href}
                  onClick={() => router.push(href)}
                  className="rounded-t-[var(--radius-sm)] px-4 py-2 text-sm font-semibold transition"
                  style={{
                    color: isActive ? "var(--savanna)" : "var(--sage)",
                    borderBottom: isActive ? "2px solid var(--savanna)" : "2px solid transparent",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
