"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../frontend/styles/tokens.css";
import Loader from "../frontend/components/Loader";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      setSuccess("Email verified. Taking you to sign in...");
      setTimeout(() => router.push("/sign-in?verified=true"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not resend code.");
      setSuccess("A new code has been sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bone)" }}>
      <main className="mx-auto max-w-sm px-5 py-20 sm:px-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2.5 mb-8"
        >
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
        </button>

        <h1
          className="font-display text-2xl font-bold"
          style={{ color: "var(--ink)" }}
        >
          Check your email
        </h1>
        <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--sage)" }}>
          We sent a 6-digit code to{" "}
          <strong style={{ color: "var(--ink)" }}>{email || "your email"}</strong>.
          Enter it below to verify your account.
        </p>

        <div
          className="mt-6 rounded-[var(--radius-lg)] border p-6"
          style={{ borderColor: "var(--line)", background: "white" }}
        >
          <form onSubmit={handleVerify} className="space-y-4">
            {!emailFromQuery && (
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: "var(--ink)" }}
                >
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
                  style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                />
              </div>
            )}

            <div>
              <label
                className="block text-xs font-semibold mb-1.5"
                style={{ color: "var(--ink)" }}
              >
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/[^0-9]/g, ""))
                }
                required
                placeholder="000000"
                className="w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-mono tracking-[0.2em] text-center"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm font-medium" style={{ color: "var(--clay)" }}>
                {error}
              </p>
            )}
            {success && (
              <p
                className="text-sm font-medium"
                style={{ color: "var(--savanna)" }}
              >
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || otp.length !== 6}
              className="font-display flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--savanna)" }}
            >
              {submitting ? <Loader size="sm" /> : "Verify email"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center space-y-3">
          <p className="text-xs" style={{ color: "var(--sage)" }}>
            Didn't receive the code?
          </p>
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-sm font-semibold underline underline-offset-2 disabled:opacity-50"
            style={{ color: "var(--savanna)" }}
          >
            {resending ? "Sending..." : "Resend verification code"}
          </button>
          <div>
            <button
              onClick={() => router.push("/sign-in")}
              className="text-xs"
              style={{ color: "var(--sage)" }}
            >
              Back to sign in
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bone)" }}>
        <Loader size="lg" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}