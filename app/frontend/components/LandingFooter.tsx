// app/frontend/components/LandingFooter.tsx
const FOOTER_SECTIONS = [
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Sign in", href: "/sign-in" },
      { label: "Get started", href: "/sign-up" },
    ],
  },
  {
    title: "How it works",
    links: [
      { label: "Connect Zoho Books", href: "/#how-it-works" },
      { label: "Supporting documents", href: "/#how-it-works" },
      { label: "Google Sheets workflow", href: "/#how-it-works" },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] font-display text-sm font-bold text-white"
                style={{ background: "var(--ink)" }}
              >
                D
              </span>
              <span className="font-display text-lg font-bold" style={{ color: "var(--ink)" }}>Dohtective</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-6" style={{ color: "var(--sage)" }}>
              An AI financial controller built for the messy books of a growing Kenyan SME -
              not a Fortune 500 audit tool.
            </p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
                {section.title}
              </p>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm" style={{ color: "var(--sage)" }}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-10 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--line)", color: "var(--sage)" }}
        >
          <p>(c) {new Date().getFullYear()} Dohtective. Built for the Kuzana x MiniHack Builder Bounty Programme.</p>
          <p>Made for Kenyan SMEs.</p>
        </div>
      </div>
    </footer>
  );
}
