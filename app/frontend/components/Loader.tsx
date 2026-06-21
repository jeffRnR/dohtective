// app/frontend/components/Loader.tsx
// Universal loading indicator. Use this everywhere instead of ad-hoc
// "Loading..." text, so every wait in the app feels like the same product.

type LoaderProps = {
  label?: string;
  fullPage?: boolean;
  size?: "sm" | "md" | "lg";
};

const SIZE_PX = { sm: 18, md: 28, lg: 40 };

export default function Loader({ label, fullPage = false, size = "md" }: LoaderProps) {
  const dimension = SIZE_PX[size];

  const spinner = (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3"
    >
      <svg
        width={dimension}
        height={dimension}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: "dohtective-spin 0.8s linear infinite" }}
      >
        <circle cx="12" cy="12" r="9.5" stroke="var(--line)" strokeWidth="2.5" />
        <path
          d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
          stroke="var(--savanna)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label ? (
        <p className="text-sm font-medium" style={{ color: "var(--sage)" }}>
          {label}
        </p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
      <style>{`
        @keyframes dohtective-spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          svg { animation: none !important; }
        }
      `}</style>
    </div>
  );

  if (!fullPage) return spinner;

  return (
    <div
      className="flex min-h-[40vh] items-center justify-center rounded-[var(--radius-lg)] border p-8"
      style={{ borderColor: "var(--line)", background: "white" }}
    >
      {spinner}
    </div>
  );
}
