// app/frontend/components/LandingNav.tsx
export default function LandingNav() {
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
          <span className="font-display text-xl font-bold" style={{ color: "var(--ink)" }}>Dohtective</span>
        </a>

        <nav className="flex items-center gap-6">
          <a href="/pricing" className="hidden text-sm font-semibold sm:block" style={{ color: "var(--sage)" }}>
            Pricing
          </a>
          <a href="/sign-in" className="text-sm font-semibold" style={{ color: "var(--sage)" }}>
            Sign in
          </a>
          <a
            href="/sign-up"
            className="font-display rounded-[var(--radius-sm)] px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-white transition"
            style={{ background: "var(--savanna)" }}
          >
            Get started
          </a>
        </nav>
      </div>
    </header>
  );
}