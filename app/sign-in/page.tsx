// app/sign-in/page.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import "../frontend/styles/tokens.css";
import Loader from "../frontend/components/Loader";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("Incorrect email or password.");
      setSubmitting(false);
      return;
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <main className="mx-auto max-w-sm px-5 py-20 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] font-display text-base font-bold text-white" style={{ background: "var(--ink)" }}>D</span>
          <span className="font-display text-xl font-bold" style={{ color: "var(--ink)" }}>Dohtective</span>
        </div>

        <h1 className="font-display mt-8 text-2xl font-bold" style={{ color: "var(--ink)" }}>Sign in</h1>

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="font-display mt-6 flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] border px-5 py-3 text-sm font-bold transition hover:border-[var(--savanna)]"
          style={{ borderColor: "var(--line)", color: "var(--ink)", background: "white" }}
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--sage)" }}>OR</span>
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        </div>

        <form onSubmit={handleCredentialsSignIn} className="space-y-3.5">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          />

          {error ? <p className="text-sm font-medium" style={{ color: "var(--clay)" }}>{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="font-display flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:cursor-not-allowed"
            style={{ background: submitting ? "var(--sage)" : "var(--savanna)" }}
          >
            {submitting ? <Loader size="sm" /> : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--sage)" }}>
          No account?{" "}
          <a href="/sign-up" className="font-semibold underline underline-offset-2" style={{ color: "var(--savanna)" }}>
            Sign up
          </a>
        </p>
      </main>
    </div>
  );
}