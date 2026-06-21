// app/api/zoho/oauth/callback/route.ts
import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchZohoOrganizations,
  saveTokensForBusiness,
} from "../../../../lib/zoho-client";

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
    // Person clicked "Deny" on Zoho's consent screen, or something else
    // went wrong on Zoho's side — redirect back with an honest message
    // rather than a raw error page.
    return NextResponse.redirect(
      new URL(`/business/${state ?? ""}?zoho_error=${encodeURIComponent(errorParam)}`, url.origin)
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state from Zoho's redirect." }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      // Happens if prompt=consent wasn't honored or the user previously
      // authorized without revoking — Zoho only issues a refresh_token on
      // first consent (or with prompt=consent forcing re-consent, which
      // zoho-client.ts already sets). Surfacing this explicitly rather
      // than silently storing an access-token-only connection that will
      // stop working in an hour.
      throw new Error(
        "Zoho did not return a refresh token. Try disconnecting this app in your " +
        "Zoho Account settings and reconnecting."
      );
    }

    const organizations = await fetchZohoOrganizations(tokens.access_token, tokens.api_domain);

    if (organizations.length === 0) {
      throw new Error("This Zoho account has no Books organizations to connect.");
    }

    // If there's exactly one Zoho org, connect it automatically — no
    // reason to make someone pick from a list of one. If there are
    // multiple, store the tokens WITHOUT an organization_id yet and
    // redirect to a picker page, since we can't guess which org maps to
    // this business.
    if (organizations.length === 1) {
      await saveTokensForBusiness(state, {
        refresh_token: tokens.refresh_token,
        api_domain: tokens.api_domain,
        organization_id: organizations[0].organization_id,
      });
      return NextResponse.redirect(new URL(`/business/${state}?zoho_connected=true`, url.origin));
    }

    await saveTokensForBusiness(state, {
      refresh_token: tokens.refresh_token,
      api_domain: tokens.api_domain,
      // organization_id intentionally omitted — set by the picker step
    });
    return NextResponse.redirect(
      new URL(`/business/${state}/connect-zoho/select-org`, url.origin)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error connecting to Zoho.";
    return NextResponse.redirect(
      new URL(`/business/${state}?zoho_error=${encodeURIComponent(message)}`, url.origin)
    );
  }
}