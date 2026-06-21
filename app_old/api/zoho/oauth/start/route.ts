// app/api/zoho/oauth/start/route.ts
import { NextResponse } from "next/server";
import { buildAuthorizationUrl, assertZohoConfigured } from "../../../../lib/zoho-client";

// CHANGELOG: this is the route that was missing entirely — there was no
// real "connect to Zoho" action anywhere, only a mock data file read.
// This route kicks off the actual OAuth redirect-and-consent flow.
//
// The business slug is passed through Zoho's `state` parameter, which
// Zoho echoes back unmodified to the callback URL — this is the standard
// way to carry context through an OAuth redirect without a server-side
// session, and it's how the callback route knows WHICH business this
// connection belongs to.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter." }, { status: 400 });
  }

  try {
    assertZohoConfigured();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Zoho OAuth not configured." },
      { status: 412 }
    );
  }

  const authUrl = buildAuthorizationUrl(slug);
  return NextResponse.redirect(authUrl);
}