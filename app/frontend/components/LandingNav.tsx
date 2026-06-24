"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function LandingNav({
  isSignedIn: isSignedInProp,
}: {
  isSignedIn?: boolean;
}) {
  const { data: session, status } = useSession();
  const isSignedIn =
    isSignedInProp ?? (status === "authenticated" && !!session?.user);
  const pathname = usePathname();

  const isPricingPage = pathname === "/pricing";

  return (
    <header className="border-b" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] font-display text-base font-bold text-white"
            style={{ background: "var(--ink)" }}
          >
            D
          </span>
          <span
            className="font-display text-xl font-bold"
            style={{ color: "var(--ink)" }}
          >
            Dohtective
          </span>
        </a>

        <nav className="flex items-center gap-6">
          {/* Swap "Pricing" for "Home" when already on the pricing page */}
          <a
            href={isPricingPage ? "/" : "/pricing"}
            className="hidden text-sm font-semibold sm:block"
            style={{ color: "var(--sage)" }}
          >
            {isPricingPage ? "Home" : "Pricing"}
          </a>

          {status === "loading" ? (
            <div
              className="h-8 w-24 rounded-[var(--radius-sm)] animate-pulse"
              style={{ background: "var(--bone-dim)" }}
            />
          ) : isSignedIn ? (
            <a
              href="/businesses"
              className="font-display rounded-[var(--radius-sm)] px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-white transition"
              style={{ background: "var(--savanna)" }}
            >
              My businesses
            </a>
          ) : (
            <>
              <a
                href="/sign-in"
                className="text-sm font-semibold"
                style={{ color: "var(--sage)" }}
              >
                Sign in
              </a>
              <a
                href="/sign-up"
                className="font-display rounded-[var(--radius-sm)] px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-white transition"
                style={{ background: "var(--savanna)" }}
              >
                Get started
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
