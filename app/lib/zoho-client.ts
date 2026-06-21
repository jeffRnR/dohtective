// app/lib/zoho-client.ts
// Real Zoho OAuth 2.0 client (Server-based Application flow). Distinct
// from everything else in this project labeled "mock Zoho" - this file
// makes actual HTTP calls to Zoho's accounts and API servers.
//
// Token storage note: tokens are persisted to mock-data/zoho-tokens.json
// for now, keyed by business slug. This is a SIMPLE FILE STORE, acceptable
// for a single-instance dev/demo deployment, NOT acceptable for production
// (no encryption at rest, no concurrent-write safety, refresh tokens are
// long-lived secrets). Before any real deployment, move this to a proper
// database with encrypted columns - flagging explicitly so this isn't
// mistaken for a production-ready pattern.

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const TOKENS_FILE = join(process.cwd(), "mock-data", "zoho-tokens.json");

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;
const ACCOUNTS_BASE_URL = process.env.ZOHO_ACCOUNTS_BASE_URL ?? "https://accounts.zoho.com";
const API_BASE_URL = process.env.ZOHO_API_BASE_URL ?? "https://www.zohoapis.com";

// Scopes needed to read books data and discover the org's organization_id.
// ZohoBooks.fullaccess.all is broad; narrow this to read-only scopes once
// Zoho's docs confirm a read-only equivalent exists for your use case -
// for now, full access is what lets onboarding actually pull real data.
const SCOPES = "ZohoBooks.fullaccess.all";

export function assertZohoConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error(
      "Zoho OAuth is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and " +
      "ZOHO_REDIRECT_URI in .env.local - see the setup steps in conversation history " +
      "or Zoho's Developer Console (api-console.zoho.com)."
    );
  }
}

export function buildAuthorizationUrl(state: string): string {
  assertZohoConfigured();
  const params = new URLSearchParams({
    scope: SCOPES,
    client_id: CLIENT_ID!,
    response_type: "code",
    redirect_uri: REDIRECT_URI!,
    access_type: "offline", // required to receive a refresh_token, not just a short-lived access_token
    prompt: "consent",
    state,
  });
  return `${ACCOUNTS_BASE_URL}/oauth/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  api_domain: string;
  token_type: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  assertZohoConfigured();
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    redirect_uri: REDIRECT_URI!,
    grant_type: "authorization_code",
    code,
  });

  const res = await fetch(`${ACCOUNTS_BASE_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Zoho token exchange failed: ${data.error ?? res.statusText}`);
  }
  return data as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  assertZohoConfigured();
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(`${ACCOUNTS_BASE_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Zoho token refresh failed: ${data.error ?? res.statusText}`);
  }
  return data as TokenResponse;
}

// -- Token persistence (simple file store - see module docstring) --

type StoredTokenRecord = {
  refresh_token: string;
  api_domain: string;
  organization_id?: string;
  connected_at: string;
};

type TokenStore = Record<string, StoredTokenRecord>; // keyed by business slug

async function readTokenStore(): Promise<TokenStore> {
  try {
    const raw = await readFile(TOKENS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeTokenStore(store: TokenStore): Promise<void> {
  await writeFile(TOKENS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function saveTokensForBusiness(
  slug: string,
  tokens: { refresh_token: string; api_domain: string; organization_id?: string }
): Promise<void> {
  const store = await readTokenStore();
  store[slug] = {
    refresh_token: tokens.refresh_token,
    api_domain: tokens.api_domain,
    organization_id: tokens.organization_id,
    connected_at: new Date().toISOString(),
  };
  await writeTokenStore(store);
}

export async function getStoredTokens(slug: string): Promise<StoredTokenRecord | null> {
  const store = await readTokenStore();
  return store[slug] ?? null;
}

// -- Authenticated API calls --

export async function zohoApiGet(slug: string, path: string, extraParams: Record<string, string> = {}) {
  const stored = await getStoredTokens(slug);
  if (!stored) {
    throw new Error(`No Zoho connection found for business "${slug}". Connect Zoho Books first.`);
  }

  const { access_token } = await refreshAccessToken(stored.refresh_token);

  const params = new URLSearchParams({
    organization_id: stored.organization_id ?? "",
    ...extraParams,
  });

  const res = await fetch(`${stored.api_domain}/books/v3${path}?${params.toString()}`, {
    headers: { Authorization: `Zoho-oauthtoken ${access_token}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Zoho API error on ${path}: ${data.message ?? res.statusText}`);
  }
  return data;
}

export async function fetchZohoOrganizations(accessToken: string, apiDomain: string) {
  const res = await fetch(`${apiDomain}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Could not fetch Zoho organizations: ${data.message ?? res.statusText}`);
  }
  return data.organizations as Array<{ organization_id: string; name: string }>;
}

export async function listOrganizationsForPendingConnection(slug: string) {
  const stored = await getStoredTokens(slug);
  if (!stored) {
    throw new Error(`No pending Zoho connection found for "${slug}".`);
  }
  const { access_token } = await refreshAccessToken(stored.refresh_token);
  return fetchZohoOrganizations(access_token, stored.api_domain);
}
