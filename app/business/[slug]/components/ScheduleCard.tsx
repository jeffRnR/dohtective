// app/business/[slug]/components/ScheduleCard.tsx
"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

type Schedule = {
  id: string;
  frequency: Frequency;
  status: "active" | "paused";
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  additionalEmails: string[];
};

const FREQUENCY_OPTIONS: { value: Frequency; label: string; hint: string }[] = [
  {
    value: "daily",
    label: "Every day",
    hint: "Best for high-volume or fast-moving books",
  },
  { value: "weekly", label: "Every week", hint: "Good default for most SMEs" },
  {
    value: "biweekly",
    label: "Every 2 weeks",
    hint: "Balanced — catches issues before month-end",
  },
  {
    value: "monthly",
    label: "Every month",
    hint: "Matches your accounting cycle",
  },
];

const STATUS_COLOR: Record<string, string> = {
  success: "var(--savanna)",
  failed: "var(--clay)",
  skipped_no_credits: "var(--clay)",
  skipped_no_zoho: "var(--marigold)",
};

const STATUS_LABEL: Record<string, string> = {
  success: "Completed successfully",
  failed: "Failed — see below",
  skipped_no_credits: "Paused — out of credits",
  skipped_no_zoho: "Skipped — Zoho not connected",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailTagInput({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addEmail() {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!valid) {
      setError("Enter a valid email address.");
      return;
    }

    onChange((prev) => {
      if (prev.includes(trimmed)) {
        setError("Already added.");
        return prev;
      }

      return [...prev, trimmed];
    });

    setInput("");
    setError(null);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="email"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="accountant@example.com"
          className="flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-xs outline-none focus:ring-1"
          style={{
            borderColor: error ? "var(--clay)" : "var(--line)",
            background: "white",
            color: "var(--ink)",
            // @ts-ignore
            "--tw-ring-color": "var(--savanna)",
          }}
        />
        <button
          type="button"
          onClick={addEmail}
          className="font-display text-xs font-bold uppercase tracking-[0.06em] px-3 py-2 rounded-[var(--radius-md)] border transition hover:opacity-80"
          style={{
            borderColor: "var(--line)",
            color: "var(--ink)",
            background: "white",
          }}
        >
          Add
        </button>
      </div>

      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--clay)" }}>
          {error}
        </p>
      )}

      {emails.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {emails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
              style={{
                background: "var(--bone)",
                color: "var(--ink)",
                border: "1px solid var(--line)",
              }}
            >
              {email}
              <button
                type="button"
                onClick={() =>
                  onChange((prev) => prev.filter((e) => e !== email))
                }
                className="opacity-50 hover:opacity-100 transition"
                style={{ color: "var(--ink)", fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScheduleCard({
  slug,
  zohoConnected,
  founderEmail,
}: {
  slug: string;
  zohoConnected: boolean;
  founderEmail?: string;
}) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Form state
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/business/${slug}/schedule`)
      .then((r) => r.json())
      .then((d) => {
        setSchedule(d.schedule ?? null);
        if (d.schedule) {
          setFrequency(d.schedule.frequency);
          setAdditionalEmails(d.schedule.additionalEmails ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  function notify(type: "success" | "error", message: string) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/business/${slug}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency, additionalEmails, status: "active" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save schedule.");
      setSchedule(data.schedule);
      setShowSetup(false);
      notify(
        "success",
        schedule
          ? "Schedule updated."
          : "Schedule created — analysis will run automatically.",
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Could not save schedule.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/business/${slug}/schedule`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to cancel schedule.");
      setSchedule(null);
      setShowSetup(false);
      setShowConfirmCancel(false);
      notify("success", "Scheduled analysis cancelled.");
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Could not cancel schedule.",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function resume() {
    setSaving(true);
    try {
      const res = await fetch(`/api/business/${slug}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency: schedule?.frequency ?? "weekly",
          additionalEmails: schedule?.additionalEmails ?? [],
          status: "active",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to resume.");
      setSchedule(data.schedule);
      notify("success", "Schedule resumed.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not resume.");
    } finally {
      setSaving(false);
    }
  }

  // ── Not connected to Zoho — show explainer ───────────────────────────
  if (!zohoConnected) {
    return (
      <div
        id="schedule"
        className="rounded-[var(--radius-lg)] border p-6"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <p
          className="text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--sage)" }}
        >
          Regular updates
        </p>
        <h3
          className="font-display mt-1.5 text-base font-bold"
          style={{ color: "var(--ink)" }}
        >
          Connect Zoho Books first
        </h3>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--sage)" }}>
          To use this feature, connect your Zoho Books account first. Once it is
          connected, we can check your books for you and send you a simple
          update by email.
        </p>

        <div
          className="mt-4 rounded-[var(--radius-md)] border p-3.5"
          style={{ borderColor: "var(--line)", background: "var(--bone)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            What happens next
          </p>
          <ul
            className="mt-2 list-disc pl-5 text-sm leading-6"
            style={{ color: "var(--sage)" }}
          >
            <li>We check your books on the schedule you choose</li>
            <li>We send one short email with a summarised report</li>
            <li>You can stop or change it anytime</li>
          </ul>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        id="schedule"
        className="rounded-[var(--radius-lg)] border p-6"
        style={{ borderColor: "var(--line)", background: "white" }}
      >
        <p className="text-sm" style={{ color: "var(--sage)" }}>
          Loading schedule…
        </p>
      </div>
    );
  }

  const freqLabel =
    FREQUENCY_OPTIONS.find((o) => o.value === schedule?.frequency)?.label ??
    schedule?.frequency;

  return (
    <div
      id="schedule"
      className="rounded-[var(--radius-lg)] border"
      style={{ borderColor: "var(--line)", background: "white" }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 px-6 py-5 border-b"
        style={{ borderColor: "var(--line)" }}
      >
        <div>
          <p
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--savanna)" }}
          >
            Scheduled analysis
          </p>
          <h3
            className="font-display mt-1 text-base font-bold"
            style={{ color: "var(--ink)" }}
          >
            {schedule
              ? schedule.status === "active"
                ? `Checking every ${freqLabel?.toLowerCase()}`
                : "Paused"
              : "Not set up"}
          </h3>
        </div>

        {/* Status pill */}
        {schedule && (
          <span
            className="shrink-0 mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{
              background:
                schedule.status === "active"
                  ? "var(--savanna-dim)"
                  : "var(--clay-dim)",
              color:
                schedule.status === "active" ? "var(--savanna)" : "var(--clay)",
            }}
          >
            {schedule.status === "active" ? "On" : "Paused"}
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Notification */}
        {notification && (
          <div
            className="rounded-[var(--radius-md)] border p-3.5 text-sm font-medium flex justify-between items-center animate-in fade-in duration-200"
            style={{
              borderColor:
                notification.type === "success"
                  ? "var(--savanna)"
                  : "var(--clay)",
              background:
                notification.type === "success"
                  ? "var(--savanna-dim)"
                  : "var(--clay-dim)",
              color:
                notification.type === "success"
                  ? "var(--savanna)"
                  : "var(--clay)",
            }}
          >
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}
        {/* ── No schedule — prompt to set up ───────────────────────────── */}
        {!schedule && !showSetup && (
          <div>
            <p className="text-sm leading-6" style={{ color: "var(--sage)" }}>
              We can check your books for you and send you a short update by
              email. You do not need to remember to do it yourself.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Automatic",
                  detail:
                    "We check your books for you on a schedule you choose",
                },
                {
                  label: "Simple update",
                  detail:
                    "You get one short email with a summarised report of the analysis findings for your perusal",
                },
                {
                  label: "One credit each time",
                  detail: "Each analysis run uses one credit",
                },
                {
                  label: "Easy to pause",
                  detail:
                    "You can stop or change the schedule of your analysis anytime",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[var(--radius-md)] border p-3.5"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--bone)",
                  }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {item.label}
                  </p>
                  <p
                    className="text-xs mt-0.5 leading-5"
                    style={{ color: "var(--sage)" }}
                  >
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSetup(true)}
              className="mt-5 font-display text-sm font-bold uppercase tracking-[0.06em] text-white px-5 py-3 rounded-[var(--radius-md)] transition hover:opacity-90"
              style={{ background: "var(--savanna)" }}
            >
              Start regular updates →
            </button>
          </div>
        )}

        {/* ── Active schedule — status view ─────────────────────────────── */}
        {schedule && !showSetup && (
          <div className="space-y-4">
            {/* Next / last run info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div
                className="rounded-[var(--radius-md)] border p-4"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--bone)",
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "var(--sage)" }}
                >
                  Next run
                </p>
                <p
                  className="mt-1.5 text-sm font-semibold"
                  style={{ color: "var(--ink)" }}
                >
                  {schedule.status === "paused"
                    ? "Paused — resume to continue"
                    : formatDate(schedule.nextRunAt)}
                </p>
              </div>
              <div
                className="rounded-[var(--radius-md)] border p-4"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--bone)",
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "var(--sage)" }}
                >
                  Last run
                </p>
                {schedule.lastRunAt ? (
                  <div>
                    <p
                      className="mt-1.5 text-sm font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      {formatRelative(schedule.lastRunAt)}
                    </p>
                    {schedule.lastRunStatus && (
                      <p
                        className="text-xs mt-0.5"
                        style={{
                          color:
                            STATUS_COLOR[schedule.lastRunStatus] ??
                            "var(--sage)",
                        }}
                      >
                        {STATUS_LABEL[schedule.lastRunStatus] ??
                          schedule.lastRunStatus}
                      </p>
                    )}
                  </div>
                ) : (
                  <p
                    className="mt-1.5 text-sm"
                    style={{ color: "var(--sage)" }}
                  >
                    No runs yet
                  </p>
                )}
              </div>
            </div>

            {/* Last run error */}
            {schedule.lastRunStatus === "failed" && schedule.lastRunError && (
              <div
                className="rounded-[var(--radius-md)] border p-3.5"
                style={{
                  borderColor: "var(--clay)",
                  background: "var(--clay-dim)",
                }}
              >
                <p
                  className="text-xs font-semibold"
                  style={{ color: "var(--clay)" }}
                >
                  Last run error
                </p>
                <p
                  className="text-xs mt-1 leading-5 font-mono"
                  style={{ color: "var(--clay)" }}
                >
                  {schedule.lastRunError}
                </p>
              </div>
            )}

            {/* Email recipients */}
            <div>
              <p
                className="text-xs font-semibold mb-1"
                style={{ color: "var(--sage)" }}
              >
                Report sent to
              </p>
              <div className="flex flex-wrap gap-1.5">
                {founderEmail && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                    style={{
                      background: "var(--savanna-dim)",
                      color: "var(--savanna)",
                      border: "1px solid var(--savanna)",
                    }}
                  >
                    {founderEmail}
                    <span className="text-[10px] opacity-70">founder</span>
                  </span>
                )}
                {schedule.additionalEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs"
                    style={{
                      background: "var(--bone)",
                      color: "var(--ink)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {email}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button
                onClick={() => setShowSetup(true)}
                className="font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-4 py-2 rounded-[var(--radius-md)] transition hover:opacity-90"
                style={{ background: "var(--ink)" }}
              >
                Change how often
              </button>
              {schedule.status === "paused" ? (
                <button
                  onClick={resume}
                  disabled={saving}
                  className="font-display text-xs font-bold uppercase tracking-[0.06em] text-white px-4 py-2 rounded-[var(--radius-md)] transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--savanna)" }}
                >
                  {saving ? "Resuming…" : "Resume schedule"}
                </button>
              ) : null}
              <button
                onClick={() => setShowConfirmCancel(true)}
                className="text-xs font-semibold underline underline-offset-2 transition hover:opacity-70"
                style={{ color: "var(--clay)" }}
              >
                Cancel schedule
              </button>
            </div>

            {/* Confirm cancel */}
            {showConfirmCancel && (
              <div
                className="rounded-[var(--radius-md)] border p-4 animate-in fade-in duration-150"
                style={{
                  borderColor: "var(--clay)",
                  background: "var(--clay-dim)",
                }}
              >
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--clay)" }}
                >
                  Cancel scheduled analysis?
                </p>
                <p
                  className="mt-1 text-xs leading-5"
                  style={{ color: "var(--ink)" }}
                >
                  This stops automatic runs. Your existing reports and data are
                  not affected. You can set up a new schedule any time.
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={cancel}
                    disabled={cancelling}
                    className="font-display text-xs font-bold uppercase tracking-wider text-white px-4 py-2 rounded-[var(--radius-md)] transition disabled:opacity-50"
                    style={{ background: "var(--clay)" }}
                  >
                    {cancelling ? "Cancelling…" : "Yes, cancel"}
                  </button>
                  <button
                    onClick={() => setShowConfirmCancel(false)}
                    className="text-xs font-semibold px-4 py-2 rounded-[var(--radius-md)] border transition"
                    style={{
                      borderColor: "var(--line)",
                      background: "white",
                      color: "var(--ink)",
                    }}
                  >
                    Keep schedule
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── Setup / edit form ─────────────────────────────────────────── */}
        {showSetup && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Frequency picker */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.1em] mb-2"
                style={{ color: "var(--ink)" }}
              >
                How often should we check your books (analysis run)?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value)}
                    className="text-left rounded-[var(--radius-md)] border px-4 py-3 transition"
                    style={{
                      borderColor:
                        frequency === opt.value
                          ? "var(--savanna)"
                          : "var(--line)",
                      background:
                        frequency === opt.value
                          ? "var(--savanna-dim)"
                          : "white",
                    }}
                  >
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      {opt.label}
                    </p>
                    <p
                      className="text-xs mt-0.5 leading-4"
                      style={{ color: "var(--sage)" }}
                    >
                      {opt.hint}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Email recipients */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.1em] mb-1"
                style={{ color: "var(--ink)" }}
              >
                Who receives the summary email?
              </p>
              {founderEmail && (
                <p className="text-xs mb-2" style={{ color: "var(--sage)" }}>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--savanna)" }}
                  >
                    {founderEmail}
                  </span>{" "}
                  (you — always included)
                </p>
              )}
              <EmailTagInput
                emails={additionalEmails}
                onChange={setAdditionalEmails}
              />
              <p className="mt-1.5 text-xs" style={{ color: "var(--sage)" }}>
                Add your accountant, co-founder, or CFO. They'll get the same
                summary email after each run.
              </p>
            </div>

            {/* Credit notice */}
            <div
              className="rounded-[var(--radius-md)] border p-3.5"
              style={{ borderColor: "var(--line)", background: "var(--bone)" }}
            >
              <p className="text-xs leading-5" style={{ color: "var(--sage)" }}>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>
                  1 credit per run.
                </span>{" "}
                If you run out of credits, the schedule pauses automatically and
                you'll get an email.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="font-display text-sm font-bold uppercase tracking-[0.06em] text-white px-5 py-3 rounded-[var(--radius-md)] transition hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--savanna)" }}
              >
                {saving
                  ? "Saving…"
                  : schedule
                    ? "Save changes"
                    : "Start schedule →"}
              </button>
              <button
                onClick={() => {
                  setShowSetup(false);
                  setNotification(null);
                }}
                className="text-xs font-semibold"
                style={{ color: "var(--sage)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
