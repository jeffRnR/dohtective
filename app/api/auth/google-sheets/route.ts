// app/api/auth/google-sheets/route.ts
// Separate OAuth flow for Google Sheets access. Deliberately NOT routed
// through NextAuth — this grants a different scope (spreadsheets + drive)
// and stores a long-lived refresh token the notification system uses
// independently of the login session. The user may connect Sheets using
// a different Google account than the one they log in with, so the two
// tokens must stay separate.
//
// Flow:
//   GET /api/auth/google-sheets          → redirects to Google consent screen
//   GET /api/auth/google-sheets/callback → exchanges code, stores refresh token, redirects back to /notify page

import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file", // drive.file = only files this app creates; narrower than full drive
  "email",   // so we can record which Google account was connected
  "profile",
].join(" ");

// ── GET /api/auth/google-sheets ─────────────────────────────────────
// Initiates the OAuth flow. Requires the user to already be signed in
// to the app (we need their userId to store the token against).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Store the slug in state so the callback knows where to redirect back.
  const slug = req.nextUrl.searchParams.get("slug") ?? "";

  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: `${requireEnv("NEXTAUTH_URL")}/api/auth/google-sheets/callback`,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",   // required to get a refresh token
    prompt: "consent",        // force consent screen so we always get a refresh token
    state: JSON.stringify({ userId: session.user.id, slug }),
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return NextResponse.redirect(url);
}