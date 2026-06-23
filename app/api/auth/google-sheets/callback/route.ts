// app/api/auth/google-sheets/callback/route.ts
// Receives the OAuth callback from Google, exchanges the authorization
// code for tokens, and stores the refresh token in GoogleSheetsConnection.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied consent — redirect back gracefully.
  if (error || !code || !stateRaw) {
    return NextResponse.redirect(
      `${requireEnv("NEXTAUTH_URL")}/?sheets_error=${encodeURIComponent(error ?? "missing_code")}`
    );
  }

  let state: { userId: string; slug: string };
  try {
    state = JSON.parse(stateRaw);
  } catch {
    return NextResponse.redirect(`${requireEnv("NEXTAUTH_URL")}/?sheets_error=bad_state`);
  }

  // Exchange authorization code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: `${requireEnv("NEXTAUTH_URL")}/api/auth/google-sheets/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    console.error("[sheets-oauth] Token exchange failed:", detail);
    return NextResponse.redirect(
      `${requireEnv("NEXTAUTH_URL")}/business/${state.slug}/notify?sheets_error=token_exchange_failed`
    );
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokens.refresh_token) {
    // Google only returns a refresh token on the first consent or when
    // prompt=consent is set. If it's missing, the consent page was skipped
    // somehow — log and surface clearly rather than silently storing nothing.
    console.error("[sheets-oauth] No refresh_token in response — was prompt=consent set?");
    return NextResponse.redirect(
      `${requireEnv("NEXTAUTH_URL")}/business/${state.slug}/notify?sheets_error=no_refresh_token`
    );
  }

  // Fetch the Google account email so we can show "Connected as foo@gmail.com".
  let googleEmail = "unknown";
  try {
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (userInfoRes.ok) {
      const info = await userInfoRes.json() as { email?: string };
      googleEmail = info.email ?? "unknown";
    }
  } catch {
    // Non-fatal — email is cosmetic only.
  }

  // Upsert: one GoogleSheetsConnection per user. If they reconnect, we
  // replace the old token (handles revoked tokens, account switches).
  await prisma.googleSheetsConnection.upsert({
    where: { userId: state.userId },
    create: {
      userId: state.userId,
      refreshToken: tokens.refresh_token,
      email: googleEmail,
    },
    update: {
      refreshToken: tokens.refresh_token,
      email: googleEmail,
      connectedAt: new Date(),
    },
  });

  return NextResponse.redirect(
    `${requireEnv("NEXTAUTH_URL")}/business/${state.slug}/notify?sheets_connected=1`
  );
}