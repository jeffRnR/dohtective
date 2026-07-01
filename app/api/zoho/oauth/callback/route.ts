// app/api/zoho/oauth/callback/route.ts
import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchZohoOrganizations,
  saveTokensForBusiness,
} from "../../../../lib/zoho-client";
import { syncZohoTransactions } from "../../../../lib/zoho-sync";

// Zoho redirects here after the person approves (or denies) access on
// Zoho's consent screen. `state` is the business slug we sent in /start,
// echoed back unmodified — this is how we know which Dohtective business
// this connection belongs to without needing a server session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // business slug
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(
        `/business/${state ?? ""}?zoho_error=${encodeURIComponent(errorParam)}`,
        url.origin
      )
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state from Zoho's redirect." },
      { status: 400 }
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      throw new Error(
        "Zoho did not return a refresh token. Try disconnecting this app in your " +
          "Zoho Account settings and reconnecting."
      );
    }

    const organizations = await fetchZohoOrganizations(
      tokens.access_token,
      tokens.api_domain
    );

    if (organizations.length === 0) {
      throw new Error("This Zoho account has no Books organizations to connect.");
    }

    if (organizations.length === 1) {
      await saveTokensForBusiness(state, {
        refresh_token: tokens.refresh_token,
        api_domain: tokens.api_domain,
        organization_id: organizations[0].organization_id,
      });

      // ── Sync transactions immediately after connecting ──────────────
      // Do this before redirect so the dashboard has data on first load.
      // Non-fatal: a sync failure here should not block the connection —
      // the dashboard will re-sync on mount anyway.
      try {
        await syncZohoTransactions(state);
      } catch (syncErr) {
        console.error("[Zoho callback] Initial sync failed (non-fatal):", syncErr);
      }

      return NextResponse.redirect(
        new URL(`/business/${state}?zoho_connected=true`, url.origin)
      );
    }

    // Multiple orgs — save tokens without org ID and redirect to picker.
    // Sync will happen after the picker calls /api/zoho/select-org.
    await saveTokensForBusiness(state, {
      refresh_token: tokens.refresh_token,
      api_domain: tokens.api_domain,
    });

    return NextResponse.redirect(
      new URL(`/business/${state}/connect-zoho/select-org`, url.origin)
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error connecting to Zoho.";
    return NextResponse.redirect(
      new URL(
        `/business/${state}?zoho_error=${encodeURIComponent(message)}`,
        url.origin
      )
    );
  }
}