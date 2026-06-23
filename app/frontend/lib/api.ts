// app/frontend/lib/api.ts
// Shared fetch helpers for the business routes. Each route page calls
// these independently on mount - no shared client state between routes,
// which is the whole point: a refresh on /documents doesn't touch
// whatever the dashboard route had in memory, because there IS no shared
// memory, only re-fetched server data per route.

import type { Org, ZohoPayload } from "./types";

export async function fetchOrgs(): Promise<Org[]> {
  const res = await fetch("/api/businesses");
  if (res.status === 401) throw new Error("Not signed in.");
  if (!res.ok) throw new Error("Unable to load your businesses.");
  const payload = await res.json();
  return (payload.businesses ?? []).map((b: { slug: string; companyName: string; branchCount: number; role: string }) => ({
    slug: b.slug,
    company_name: b.companyName,
    branch_count: b.branchCount,
    role: b.role,
  }));
}

export async function fetchReport(slug: string): Promise<ZohoPayload> {
  const res = await fetch(`/api/report?org=${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Unable to load report.");
  }
  return res.json();
}

// ── Google Sheets ────────────────────────────────────────────────────

export type SheetsStatus = {
  configured: boolean;
  serviceReachable: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
  // TOKEN_EXPIRED is returned by POST when the refresh token was revoked.
  // The page uses this to clear the "connected" state and prompt reconnect.
  code?: "TOKEN_EXPIRED";
};

export async function fetchSheetsStatus(): Promise<SheetsStatus> {
  const res = await fetch("/api/notify/sheets");
  if (!res.ok) return { configured: false, serviceReachable: false, connectedEmail: null, connectedAt: null };
  return res.json();
}

export type SheetsPushResult = {
  status: string;
  sheet_url: string;
  action_items_written: number;
  anomaly_rows_written: number;
  pushed_at: string;
};

export async function pushToSheets(report: unknown, businessName: string): Promise<SheetsPushResult> {
  const res = await fetch("/api/notify/sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report, business_name: businessName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Surface the TOKEN_EXPIRED code so the page can prompt reconnect.
    if (body.code === "TOKEN_EXPIRED") {
      const err = new Error(body.error ?? "Google Sheets authorization expired.");
      (err as Error & { code: string }).code = "TOKEN_EXPIRED";
      throw err;
    }
    throw new Error(body.detail ?? body.error ?? "Could not push to Google Sheets.");
  }
  return res.json();
}

// ── Email notifications ──────────────────────────────────────────────

export type ActionItem = {
  priority: string;
  flag: string;
  assignedTo: string;
  action: string;
};

export type EmailPayload = {
  slug: string;
  businessName: string;
  sheetUrl: string;
  actionItems: ActionItem[];
  period?: string;
};

export type EmailResult = {
  sent: boolean;
  results: Array<{ email: string; ok: boolean; error?: string }>;
};

export async function sendNotificationEmail(payload: EmailPayload): Promise<EmailResult> {
  const res = await fetch("/api/notify/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not send notification email.");
  }
  return res.json();
}