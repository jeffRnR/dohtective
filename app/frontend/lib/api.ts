// app/frontend/lib/api.ts
// Shared fetch helpers for the business routes. Each route page calls
// these independently on mount — no shared client state between routes,
// which is the whole point: a refresh on /documents doesn't touch
// whatever the dashboard route had in memory, because there IS no shared
// memory, only re-fetched server data per route.

import type { Org, ZohoPayload } from "./types";

// CHANGELOG: fetchOrgs now hits /api/businesses, not /api/zoho. The old
// /api/zoho?GET returned EVERY business in the flat organizations.json
// file with no access control — this is the actual fix for "every
// business shows up for everyone." /api/businesses requires a signed-in
// session and only returns businesses the current user is a member of.
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

export type SheetsStatus = { configured: boolean; serviceReachable: boolean };

export async function fetchSheetsStatus(): Promise<SheetsStatus> {
  const res = await fetch("/api/notify/sheets");
  if (!res.ok) return { configured: false, serviceReachable: false };
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
    throw new Error(body.detail ?? body.error ?? "Could not push to Google Sheets.");
  }
  return res.json();
}